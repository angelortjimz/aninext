// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnimeSearchResult } from "@/models/anime";
import { SearchField } from "./SearchField";
import { SEARCH_DEBOUNCE_MS } from "./config";

const api = vi.hoisted(() => ({ search: vi.fn() }));

vi.mock("@/api/anilist", () => ({
  SEARCH_MIN_LENGTH: 2,
  searchAnime: api.search,
}));

const combobox = (): HTMLInputElement => screen.getByRole<HTMLInputElement>("combobox");

const result = (id: number, overrides: Partial<AnimeSearchResult> = {}): AnimeSearchResult => ({
  id,
  title: `Anime ${id}`,
  imageUrl: null,
  type: "TV",
  year: 2020,
  episodes: 12,
  ...overrides,
});

function renderField(onSelectionChange = vi.fn()) {
  render(<SearchField index={1} disabled={false} onSelectionChange={onSelectionChange} />);
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

  it("coalesces a burst of keystrokes into a single debounced search", async () => {
    const { input } = renderField();
    type(input, "b");
    type(input, "be");
    type(input, "bebop");
    expect(api.search).not.toHaveBeenCalled();

    await settle();
    expect(api.search).toHaveBeenCalledTimes(1);
    expect(api.search.mock.calls[0]?.[0]).toBe("bebop");
  });

  it("searches again after a further pause", async () => {
    const { input } = renderField();
    type(input, "bebop");
    await settle();
    type(input, "trigun");
    await settle();
    expect(api.search).toHaveBeenCalledTimes(2);
  });

  it("surfaces a friendly message when the search fails", async () => {
    api.search.mockRejectedValue(new Error("network down"));
    const { input } = renderField();
    type(input, "bebop");
    await settle();
    expect(screen.getByText("Search is unavailable. Try again.")).toBeDefined();
  });

  it("swallows an aborted request instead of reporting failure", async () => {
    api.search.mockRejectedValue(new DOMException("aborted", "AbortError"));
    const { input } = renderField();
    type(input, "bebop");
    await settle();
    expect(screen.queryByText("Search is unavailable. Try again.")).toBeNull();
  });

  it("reports when nothing matched", async () => {
    api.search.mockResolvedValue([]);
    const { input } = renderField();
    type(input, "zzzz");
    await settle();
    expect(screen.getByText("No anime found")).toBeDefined();
  });

  it("discards a stale response that resolves after newer input", async () => {
    const resolvers: ((value: AnimeSearchResult[]) => void)[] = [];
    api.search.mockImplementation(
      () => new Promise<AnimeSearchResult[]>((resolve) => resolvers.push(resolve)),
    );

    const { input } = renderField();
    type(input, "bebop");
    await settle();
    type(input, "bebops");
    await settle();

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

  it("activates the first result by default and wraps at both ends", async () => {
    api.search.mockResolvedValue([result(1), result(2), result(3)]);
    const { input } = renderField();
    type(input, "bebop");
    await settle();

    expect(activeOptionText()).toContain("Anime 1");

    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(activeOptionText()).toContain("Anime 3");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(activeOptionText()).toContain("Anime 1");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(activeOptionText()).toContain("Anime 3");
  });

  it("steps backwards through the list without wrapping mid-list", async () => {
    api.search.mockResolvedValue([result(1), result(2), result(3)]);
    const { input } = renderField();
    type(input, "bebop");
    await settle();

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(activeOptionText()).toContain("Anime 3");

    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(activeOptionText()).toContain("Anime 2");
  });

  it("selects the active result on Enter and locks the field", async () => {
    api.search.mockResolvedValue([result(1, { title: "Cowboy Bebop" })]);
    const { onSelectionChange, input } = renderField();
    type(input, "bebop");
    await settle();

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelectionChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, title: "Cowboy Bebop" }),
    );
    expect(input.value).toBe("Cowboy Bebop");
    expect(input.readOnly).toBe(true);
    expect(screen.getByText("Selected")).toBeDefined();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("ignores Enter when no result is active", async () => {
    const { onSelectionChange, input } = renderField();
    type(input, "zzzz");
    await settle();
    onSelectionChange.mockClear();

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it("selects a result by clicking it", async () => {
    api.search.mockResolvedValue([result(1, { title: "Trigun" })]);
    const { onSelectionChange, input } = renderField();
    type(input, "trigun");
    await settle();
    onSelectionChange.mockClear();

    fireEvent.click(screen.getByRole("option", { name: /Trigun/ }).querySelector("button")!);
    expect(onSelectionChange).toHaveBeenCalledWith(expect.objectContaining({ title: "Trigun" }));
  });

  it("dismisses the list on Escape without selecting", async () => {
    api.search.mockResolvedValue([result(1)]);
    const { onSelectionChange, input } = renderField();
    type(input, "bebop");
    await settle();
    onSelectionChange.mockClear();

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onSelectionChange).not.toHaveBeenCalled();
    expect(input.readOnly).toBe(false);
  });

  it("clears the selection, refocuses and reports no selection", async () => {
    api.search.mockResolvedValue([result(1, { title: "Nadia" })]);
    const { onSelectionChange, input } = renderField();
    type(input, "nadia");
    await settle();
    fireEvent.keyDown(input, { key: "Enter" });
    onSelectionChange.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Clear Anime 1" }));
    expect(input.value).toBe("");
    expect(input.readOnly).toBe(false);
    expect(document.activeElement).toBe(input);
    expect(onSelectionChange).toHaveBeenCalledWith(null);
  });

  it("hides the Clear button until something is selected", async () => {
    api.search.mockResolvedValue([result(1, { title: "Nadia" })]);
    const { input } = renderField();
    expect(screen.queryByRole("button", { name: "Clear Anime 1" })).toBeNull();

    type(input, "nadia");
    await settle();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("button", { name: "Clear Anime 1" })).toBeDefined();
  });

  it("editing after a selection reports a null selection", async () => {
    api.search.mockResolvedValue([result(1, { title: "Nadia" })]);
    const { onSelectionChange, input } = renderField();
    type(input, "nadia");
    await settle();
    fireEvent.keyDown(input, { key: "Enter" });

    input.readOnly = false;
    type(input, "nadi");
    expect(onSelectionChange).toHaveBeenCalledWith(null);
  });

  it("wires combobox accessibility to the visible list", async () => {
    api.search.mockResolvedValue([result(1, { title: "Alpha" }), result(2, { title: "Beta" })]);
    const { input } = renderField();
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.getAttribute("aria-controls")).toBeNull();

    type(input, "ab");
    await settle();

    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(input.getAttribute("aria-controls")).toBe("anime-results-1");
    expect(input.getAttribute("aria-activedescendant")).toBe("anime-results-1-option-0");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe("anime-results-1-option-1");
  });

  it("shows a thumbnail only when the result has cover art", async () => {
    api.search.mockResolvedValue([
      result(1, { title: "WithArt", imageUrl: "https://img.example/a.jpg" }),
      result(2, { title: "NoArt", imageUrl: null }),
    ]);
    const { input } = renderField();
    type(input, "ab");
    await settle();

    const withArt = screen.getByRole("option", { name: /WithArt/ });
    const noArt = screen.getByRole("option", { name: /NoArt/ });
    expect(withArt.querySelector("img")?.getAttribute("src")).toBe("https://img.example/a.jpg");
    expect(noArt.querySelector("img")).toBeNull();
    expect(noArt.querySelector(".suggestion-thumb")).not.toBeNull();
  });

  it("cannot be edited while the parent disables it", () => {
    render(<SearchField index={1} disabled onSelectionChange={vi.fn()} />);
    expect(combobox().disabled).toBe(true);
  });

  it("labels the field so it is reachable by accessible name", () => {
    renderField();
    expect(screen.getByLabelText("Anime 1")).toBeDefined();
  });
});
