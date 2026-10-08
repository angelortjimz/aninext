// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type { AnimeSearchResult } from "@/models/anime";
import { SearchField } from "./SearchField";
import { SEARCH_DEBOUNCE_MS } from "./config";

const api = vi.hoisted(() => ({ search: vi.fn() }));

vi.mock("@/api/anilist", () => ({
  SEARCH_MIN_LENGTH: 2,
  searchAnime: api.search,
}));

const combobox = (): HTMLInputElement => screen.getByRole<HTMLInputElement>("combobox");

const result = (id: number, overrides: Partial<AnimeSearchResult> = {}): AnimeSearchResult => {
  const base: AnimeSearchResult = {
    id,
    title: `Anime ${id}`,
    nativeTitle: null,
    imageUrl: null,
    type: "TV",
    year: 2020,
    episodes: 12,
  };
  return { ...base, ...overrides };
};

function renderField(
  onSelectionChange = vi.fn(),
  props: Partial<ComponentProps<typeof SearchField>> = {},
) {
  render(
    <SearchField
      index={1}
      disabled={false}
      pickedIds={[]}
      restoreToken={0}
      restoredSelection={null}
      onSelectionChange={onSelectionChange}
      {...props}
    />,
  );
  return { onSelectionChange, input: combobox() };
}

/** Applies `text` as a single input event, mirroring one paste or fast burst. */
function type(input: HTMLInputElement, text: string): void {
  fireEvent.change(input, { target: { value: text } });
}

/** Runs past the debounce window and flushes the resulting promise chain. */
async function settle(): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
  });
}

function activeOptionText(): string {
  return screen.getByRole("listbox").querySelector(".is-active")?.textContent ?? "";
}

/** Types `query` and waits for the debounced matches to render. */
async function search(input: HTMLInputElement, query: string): Promise<void> {
  type(input, query);
  await settle();
}

beforeEach(() => {
  api.search.mockReset();
  api.search.mockResolvedValue([]);
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SearchField", () => {
  it("does not search below the minimum length and explains why", async () => {
    const { input } = renderField();
    type(input, "a");
    await settle();
    expect(api.search).not.toHaveBeenCalled();
    expect(screen.getByText("Enter at least 2 characters")).toBeDefined();
  });

  it("coalesces a burst of keystrokes and searches again after a further pause", async () => {
    const { input } = renderField();
    type(input, "b");
    type(input, "be");
    type(input, "bebop");
    expect(api.search).not.toHaveBeenCalled();

    await settle();
    expect(api.search).toHaveBeenCalledTimes(1);
    expect(api.search.mock.calls[0]?.[0]).toBe("bebop");

    await search(input, "trigun");
    expect(api.search).toHaveBeenCalledTimes(2);
    expect(api.search.mock.calls[1]?.[0]).toBe("trigun");
  });

  it("reports a failed search but stays quiet about an abort", async () => {
    api.search.mockRejectedValue(new Error("network down"));
    const failed = renderField();
    await search(failed.input, "bebop");
    expect(screen.getByText("Search is unavailable. Try again.")).toBeDefined();

    cleanup();

    api.search.mockRejectedValue(new DOMException("aborted", "AbortError"));
    const aborted = renderField();
    await search(aborted.input, "bebop");
    expect(screen.queryByText("Search is unavailable. Try again.")).toBeNull();
  });

  it("reports no match and ignores Enter while there is nothing to pick", async () => {
    const { onSelectionChange, input } = renderField();
    await search(input, "zzzz");
    expect(screen.getByText("No anime found")).toBeDefined();

    onSelectionChange.mockClear();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it("discards a stale response that resolves after newer input", async () => {
    const resolvers: ((value: AnimeSearchResult[]) => void)[] = [];
    api.search.mockImplementation(
      () => new Promise<AnimeSearchResult[]>((resolve) => resolvers.push(resolve)),
    );

    const { input } = renderField();
    await search(input, "bebop");
    await search(input, "bebops");

    // Resolve the newer request first, then let the older one land late.
    await act(async () => {
      resolvers[1]?.([result(2, { title: "Newest" })]);
    });
    expect(screen.getByText("Newest")).toBeDefined();

    await act(async () => {
      resolvers[0]?.([result(1, { title: "Stale" })]);
    });
    expect(screen.queryByText("Stale")).toBeNull();
    expect(screen.getByText("Newest")).toBeDefined();
  });

  it("wraps at both ends of the list but not through the middle", async () => {
    api.search.mockResolvedValue([result(1), result(2), result(3)]);
    const { input } = renderField();
    await search(input, "bebop");

    expect(activeOptionText()).toContain("Anime 1");

    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(activeOptionText()).toContain("Anime 3");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(activeOptionText()).toContain("Anime 1");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(activeOptionText()).toContain("Anime 3");

    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(activeOptionText()).toContain("Anime 2");
  });

  it("selects the active result on Enter and locks the field", async () => {
    api.search.mockResolvedValue([result(1, { title: "Cowboy Bebop" })]);
    const { onSelectionChange, input } = renderField();
    await search(input, "bebop");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelectionChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, title: "Cowboy Bebop" }),
    );
    expect(input.value).toBe("Cowboy Bebop");
    expect(input.readOnly).toBe(true);
    expect(screen.getByText("Selected")).toBeDefined();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("selects a result by clicking it", async () => {
    api.search.mockResolvedValue([result(1, { title: "Trigun" })]);
    const { onSelectionChange, input } = renderField();
    await search(input, "trigun");
    onSelectionChange.mockClear();

    fireEvent.click(screen.getByRole("option", { name: /Trigun/ }).querySelector("button")!);
    expect(onSelectionChange).toHaveBeenCalledWith(expect.objectContaining({ title: "Trigun" }));
  });

  it("dismisses the list on Escape without selecting", async () => {
    api.search.mockResolvedValue([result(1)]);
    const { onSelectionChange, input } = renderField();
    await search(input, "bebop");
    onSelectionChange.mockClear();

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onSelectionChange).not.toHaveBeenCalled();
    expect(input.readOnly).toBe(false);
  });

  it("reveals Clear only once selected, and clearing reports no selection", async () => {
    api.search.mockResolvedValue([result(1, { title: "Nadia" })]);
    const { onSelectionChange, input } = renderField();
    expect(screen.queryByRole("button", { name: "Clear Anime 1" })).toBeNull();

    await search(input, "nadia");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("button", { name: "Clear Anime 1" })).toBeDefined();
    onSelectionChange.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Clear Anime 1" }));
    expect(input.value).toBe("");
    expect(input.readOnly).toBe(false);
    expect(document.activeElement).toBe(input);
    expect(onSelectionChange).toHaveBeenCalledWith(null);

    // Editing an existing selection must also report no selection.
    onSelectionChange.mockClear();
    type(input, "nadi");
    expect(onSelectionChange).toHaveBeenCalledWith(null);
  });

  it("wires combobox accessibility to the visible list", async () => {
    api.search.mockResolvedValue([result(1, { title: "Alpha" }), result(2, { title: "Beta" })]);
    const { input } = renderField();
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.getAttribute("aria-controls")).toBeNull();

    await search(input, "ab");

    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(input.getAttribute("aria-controls")).toBe("anime-results-1");
    expect(input.getAttribute("aria-activedescendant")).toBe("anime-results-1-option-0");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe("anime-results-1-option-1");
  });

  it("keeps the metadata visible after a pick, so the entry can be verified", async () => {
    api.search.mockResolvedValue([result(1, { title: "Nadia", year: 1990, episodes: 46 })]);
    const { input } = renderField();
    await search(input, "nadia");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(input.value).toBe("Nadia");
    // The lock replaces the title only; year, format and length stay readable.
    expect(screen.getByText("1990 - TV - 46 episodes")).toBeDefined();
  });

  it("marks an anime already locked into another field and refuses it", async () => {
    api.search.mockResolvedValue([result(1, { title: "Nadia" }), result(2, { title: "Trigun" })]);
    const { onSelectionChange, input } = renderField(vi.fn(), { pickedIds: [2] });
    await search(input, "na");

    const taken = screen.getByRole("option", { name: /Already chosen/ });
    const button = taken.querySelector("button")!;
    expect(button.disabled).toBe(true);

    onSelectionChange.mockClear();
    fireEvent.click(button);
    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it("restores a handed-back selection into the field", async () => {
    const onSelectionChange = vi.fn();
    const { rerender } = render(
      <SearchField
        index={1}
        disabled={false}
        pickedIds={[]}
        restoreToken={0}
        restoredSelection={null}
        onSelectionChange={onSelectionChange}
      />,
    );
    expect(combobox().value).toBe("");

    rerender(
      <SearchField
        index={1}
        disabled={false}
        pickedIds={[]}
        restoreToken={1}
        restoredSelection={result(1, { title: "Nadia" })}
        onSelectionChange={onSelectionChange}
      />,
    );

    expect(screen.getByRole<HTMLInputElement>("combobox").value).toBe("Nadia");
    expect(screen.getByRole<HTMLInputElement>("combobox").readOnly).toBe(true);
    expect(screen.getByText("Selected")).toBeDefined();
  });

  it("shows a thumbnail only when the result has cover art", async () => {
    api.search.mockResolvedValue([
      result(1, { title: "WithArt", imageUrl: "https://img.example/a.jpg" }),
      result(2, { title: "NoArt", imageUrl: null }),
    ]);
    const { input } = renderField();
    await search(input, "ab");

    const withArt = screen.getByRole("option", { name: /WithArt/ });
    const noArt = screen.getByRole("option", { name: /NoArt/ });
    expect(withArt.querySelector("img")?.getAttribute("src")).toBe("https://img.example/a.jpg");
    expect(noArt.querySelector("img")).toBeNull();
    expect(noArt.querySelector(".suggestion-thumb")).not.toBeNull();
  });
});
