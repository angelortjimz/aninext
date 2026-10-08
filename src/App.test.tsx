// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { AnimeSearchResult, RecommendationResult } from "@/models/anime";
import { anime } from "@/recommendation/fixtures";
import { SEARCH_DEBOUNCE_MS } from "@/ui/config";

const api = vi.hoisted(() => ({
  search: vi.fn(),
  batch: vi.fn(),
}));

vi.mock("@/api/anilist", () => ({
  SEARCH_MIN_LENGTH: 2,
  searchAnime: api.search,
  getAnimeBatch: api.batch,
}));

vi.mock("@/recommendation/recommend", () => ({ recommend: vi.fn() }));

const { recommend } = await import("@/recommendation/recommend");
const recommendMock = vi.mocked(recommend);

const searchResult = (id: number, title: string): AnimeSearchResult => ({
  id,
  title,
  imageUrl: null,
  type: "TV",
  year: 2020,
  episodes: 12,
});

/** Runs `body` inside act, so React flushes the resulting state updates. */
async function flush(body: () => void | Promise<void>): Promise<void> {
  await act(async () => {
    await body();
  });
}

/** Advances past the debounce window and flushes the search promise. */
async function passDebounce(): Promise<void> {
  await flush(async () => {
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
  });
}

/** Lets already-resolved promises and their `.then` chains settle. */
async function settlePromises(): Promise<void> {
  await flush(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

/** Fills one field: type, wait for matches, then pick the first one. */
async function select(index: number, id: number, title = `Anime ${id}`): Promise<void> {
  api.search.mockResolvedValueOnce([searchResult(id, title)]);
  const input = screen.getAllByRole("combobox")[index] as HTMLInputElement;
  await flush(() => {
    fireEvent.change(input, { target: { value: title } });
  });
  await passDebounce();
  await flush(() => {
    fireEvent.keyDown(input, { key: "Enter" });
  });
}

async function chooseThreeDistinct(): Promise<void> {
  await select(0, 1, "Cowboy Bebop");
  await select(1, 2, "Trigun");
  await select(2, 3, "Nadia");
}

function submitButton(): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>("button", { name: "Find a recommendation" });
}

async function submit(): Promise<void> {
  await flush(() => {
    fireEvent.click(submitButton());
  });
  await settlePromises();
}

beforeEach(() => {
  api.search.mockReset();
  api.batch.mockReset();
  recommendMock.mockReset();
  api.search.mockResolvedValue([]);
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("App", () => {
  it("renders three labelled search fields inside a main landmark", () => {
    render(<App />);
    expect(screen.getByRole("main")).toBeDefined();
    expect(screen.getAllByRole("combobox")).toHaveLength(3);
    expect(screen.getByLabelText("Anime 1")).toBeDefined();
    expect(screen.getByLabelText("Anime 2")).toBeDefined();
    expect(screen.getByLabelText("Anime 3")).toBeDefined();
  });

  it("starts idle with the submit button disabled and no result", () => {
    render(<App />);
    expect(submitButton().disabled).toBe(true);
    expect(screen.queryByRole("region", { name: /recommendation/i })).toBeNull();
  });

  it("keeps submit disabled until three distinct anime are chosen", async () => {
    render(<App />);
    await select(0, 1, "Cowboy Bebop");
    expect(submitButton().disabled).toBe(true);
    await select(1, 2, "Trigun");
    expect(submitButton().disabled).toBe(true);
    await select(2, 3, "Nadia");
    expect(submitButton().disabled).toBe(false);
  });

  it("rejects a repeated selection and explains why", async () => {
    render(<App />);
    await select(0, 1, "Cowboy Bebop");
    await select(1, 1, "Cowboy Bebop");
    await select(2, 3, "Nadia");

    expect(submitButton().disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toBe("Please select three different anime.");
  });

  it("clears the duplicate warning once the clash is resolved", async () => {
    render(<App />);
    await select(0, 1, "Cowboy Bebop");
    await select(1, 1, "Cowboy Bebop");
    await select(2, 3, "Nadia");
    expect(screen.getByRole("alert").textContent).not.toBe("");

    const clearButtons = screen
      .getAllByRole("button", { name: /^Clear Anime/ })
      .filter((button) => !(button as HTMLButtonElement).disabled);
    await flush(() => {
      fireEvent.click(clearButtons[1]!);
    });
    expect(screen.getByRole("alert").textContent).toBe("");
  });

  it("locks the fields and shows progress while a request is in flight", async () => {
    let release: (() => void) | undefined;
    api.batch.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve([anime(1), anime(2), anime(3)]);
        }),
    );
    recommendMock.mockResolvedValue({ kind: "no-match" } satisfies RecommendationResult);

    render(<App />);
    await chooseThreeDistinct();
    await submit();

    expect(submitButton().disabled).toBe(true);
    expect(screen.getAllByRole("combobox").every((el) => (el as HTMLInputElement).disabled)).toBe(
      true,
    );
    expect(screen.getByText("Finding your next anime...")).toBeDefined();

    release?.();
    await settlePromises();
    expect(submitButton().disabled).toBe(false);
  });

  it("renders the recommendation the engine returns", async () => {
    api.batch.mockResolvedValue([anime(1), anime(2), anime(3)]);
    recommendMock.mockResolvedValue({
      kind: "recommendation",
      recommendation: {
        anime: anime(9, { title: "Yurei Deco" }),
        reasons: ["Shares a strong Drama tag"],
        basedOn: [anime(1, { title: "First" }), anime(2, { title: "Second" })],
      },
    } satisfies RecommendationResult);

    render(<App />);
    await chooseThreeDistinct();
    await submit();

    expect(screen.getByRole("heading", { name: "Yurei Deco" })).toBeDefined();
    expect(api.batch).toHaveBeenCalledWith([1, 2, 3]);
    expect(recommendMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Based on First / Second")).toBeDefined();
  });

  it("shows the no-match outcome", async () => {
    api.batch.mockResolvedValue([anime(1), anime(2), anime(3)]);
    recommendMock.mockResolvedValue({ kind: "no-match" } satisfies RecommendationResult);

    render(<App />);
    await chooseThreeDistinct();
    await submit();

    expect(screen.getByRole("heading", { name: "No discovery match yet" })).toBeDefined();
  });

  it("reports unavailable when a selection cannot be re-fetched", async () => {
    api.batch.mockResolvedValue([anime(1), anime(2)]);

    render(<App />);
    await chooseThreeDistinct();
    await submit();

    expect(
      screen.getByRole("heading", { name: "One selection is no longer available" }),
    ).toBeDefined();
    expect(recommendMock).not.toHaveBeenCalled();
  });

  it("reports a friendly error and leaks no raw API message", async () => {
    api.batch.mockRejectedValue(new Error("AniList responded 503"));

    render(<App />);
    await chooseThreeDistinct();
    await submit();

    expect(
      screen.getByRole("heading", { name: "We could not find a recommendation" }),
    ).toBeDefined();
    expect(screen.queryByText(/503/)).toBeNull();
    expect(screen.queryByText(/AniList responded/)).toBeNull();
  });

  it("replaces the previous result with progress while re-running", async () => {
    api.batch.mockResolvedValue([anime(1), anime(2), anime(3)]);
    recommendMock.mockResolvedValue({
      kind: "recommendation",
      recommendation: {
        anime: anime(9, { title: "Yurei Deco" }),
        reasons: ["First reason"],
        basedOn: [anime(1, { title: "First" })],
      },
    } satisfies RecommendationResult);

    render(<App />);
    await chooseThreeDistinct();
    await submit();
    expect(screen.getByRole("heading", { name: "Yurei Deco" })).toBeDefined();

    // Hold the next run open so the in-between state is observable.
    let release: (() => void) | undefined;
    recommendMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ kind: "no-match" } satisfies RecommendationResult);
        }),
    );
    await flush(() => {
      fireEvent.click(submitButton());
    });

    expect(screen.getByText("Finding your next anime...")).toBeDefined();
    expect(screen.queryByRole("heading", { name: "Yurei Deco" })).toBeNull();

    release?.();
    await settlePromises();
    expect(screen.getByRole("heading", { name: "No discovery match yet" })).toBeDefined();
  });

  it("announces results through a polite live region", () => {
    const { container } = render(<App />);
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
  });
});
