// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type { Recommendation } from "@/models/anime";
import type { UiState } from "@/models/ui";
import { anime } from "@/recommendation/fixtures";
import { ResultRegion } from "./ResultRegion";

afterEach(cleanup);

const recommendation = (id: number, overrides: Partial<Recommendation> = {}): Recommendation => ({
  anime: anime(id, { title: `Anime ${id}`, imageUrl: `https://img.example/${id}.jpg` }),
  reasons: [
    "Fans of Anime 1 also went on to watch this.",
    "The Drama streak runs through Anime 1.",
  ],
  basedOn: [anime(1, { title: "First Pick" }), anime(2, { title: "Second Pick" })],
  ...overrides,
});

const recommended = (results: Recommendation[], index = 0): UiState => ({
  kind: "recommendation",
  results,
  index,
});

const yurei = recommendation(7, {
  anime: anime(7, { title: "Yurei Deco", imageUrl: "https://img.example/7.jpg" }),
});

function renderRegion(ui: UiState, props: Partial<ComponentProps<typeof ResultRegion>> = {}) {
  return render(<ResultRegion ui={ui} isStale={false} {...props} />);
}

describe("ResultRegion", () => {
  it("renders nothing while idle", () => {
    const { container } = renderRegion({ kind: "idle" });
    expect(container.innerHTML).toBe("");
  });

  it("shows a spinner and progress copy while loading", () => {
    const { container } = renderRegion({ kind: "loading" });
    expect(screen.getByText("Finding your next anime...")).toBeDefined();
    expect(container.querySelector(".spinner")).not.toBeNull();
  });

  it("renders the title, metadata, every reason and the based-on list", () => {
    renderRegion(recommended([yurei]));

    expect(screen.getByRole("region", { name: "Yurei Deco" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "Yurei Deco" })).toBeDefined();
    expect(screen.getByText("2020 - TV - 12 episodes")).toBeDefined();
    expect(screen.getByText("Fans of Anime 1 also went on to watch this.")).toBeDefined();
    expect(screen.getByText("The Drama streak runs through Anime 1.")).toBeDefined();
    expect(screen.getByText("Based on First Pick / Second Pick")).toBeDefined();
  });

  it("surfaces the native title, studio and genres already in the model", () => {
    renderRegion(
      recommended([
        recommendation(7, {
          anime: anime(7, {
            title: "Yurei Deco",
            nativeTitle: "幽霊デコ",
            mainStudios: ["Studio A", "Studio B"],
            genres: ["Drama", "Mystery"],
          }),
        }),
      ]),
    );

    expect(screen.getByText("幽霊デコ")).toBeDefined();
    expect(screen.getByText("Studio: Studio A, Studio B")).toBeDefined();
    expect(screen.getByRole("list", { name: "Genres" }).textContent).toContain("Mystery");
  });

  it("renders a filled placeholder when cover art is missing", () => {
    const { container } = renderRegion(
      recommended([recommendation(7, { anime: anime(7, { imageUrl: null }) })]),
    );
    expect(container.querySelector(".cover--placeholder")).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("falls back to generic copy when metadata is entirely empty", () => {
    renderRegion(
      recommended([
        recommendation(7, {
          anime: anime(7, { title: "Yurei Deco", type: null, year: null, episodes: null }),
        }),
      ]),
    );
    expect(screen.getAllByText("Anime").length).toBeGreaterThan(0);
  });

  it("explains every non-recommendation outcome without naming the API", () => {
    const outcomes: Array<[Exclude<UiState["kind"], "recommendation">, string]> = [
      ["no-match", "No discovery match yet"],
      ["unavailable", "One selection is no longer available"],
      ["error", "We could not find a recommendation"],
    ];

    for (const [kind, heading] of outcomes) {
      renderRegion({ kind });
      expect(screen.getByRole("heading", { name: heading })).toBeDefined();
      expect(document.body.textContent).not.toContain("AniList");
      cleanup();
    }
  });

  it("gives each outcome its own accent so the state reads before it is read", () => {
    const accents = (["loading", "no-match", "unavailable", "error"] as const).map((kind) => {
      const { container, unmount } = renderRegion({ kind });
      const accent = container.querySelector(".message-card")?.className;
      unmount();
      return accent;
    });
    expect(new Set(accents).size).toBe(4);
  });

  it("announces one short sentence rather than the whole card", () => {
    renderRegion(recommended([yurei, recommendation(8)], 1));
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Recommendation 2 of 2: Anime 8.");
    // The visual card stays out of the live region.
    expect(screen.getByRole("region", { name: "Anime 8" }).closest("[aria-live]")).toBeNull();
  });

  it("moves focus to the answer so a keyboard user learns it arrived", () => {
    renderRegion(recommended([yurei]));
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Yurei Deco" }));
  });
});

describe("ResultRegion stale card", () => {
  it("dims the card, explains why, and offers undo instead of a re-roll", () => {
    const onUndo = vi.fn();
    const onEditPicks = vi.fn();
    const { container } = renderRegion(recommended([yurei]), {
      isStale: true,
      onUndo,
      onEditPicks,
      onReroll: vi.fn(),
    });

    expect(container.querySelector(".result-card")?.className).toContain("is-stale");
    expect(screen.getByText(/no longer reflects them/)).toBeDefined();
    expect(screen.queryByRole("button", { name: "Seen it — show me another" })).toBeNull();

    screen.getByRole("button", { name: "Undo my last change" }).click();
    expect(onUndo).toHaveBeenCalledTimes(1);
    screen.getByRole("button", { name: "Edit my picks" }).click();
    expect(onEditPicks).toHaveBeenCalledTimes(1);
  });
});

describe("ResultRegion re-roll", () => {
  it("renders the result at the given index", () => {
    renderRegion(recommended([yurei, recommendation(8)], 1));
    expect(screen.getByRole("heading", { name: "Anime 8" })).toBeDefined();
    expect(screen.queryByRole("heading", { name: "Yurei Deco" })).toBeNull();
  });

  it("falls back to the first result when the index is out of range", () => {
    renderRegion(recommended([yurei, recommendation(8)], 5));
    expect(screen.getByRole("heading", { name: "Yurei Deco" })).toBeDefined();
  });

  it("shows the position in the queue and walks it in order", () => {
    const onReroll = vi.fn();
    renderRegion(recommended([yurei, recommendation(8)]), { onReroll });
    expect(screen.getByText("1 of 2")).toBeDefined();

    screen.getByRole("button", { name: "Seen it — show me another" }).click();
    expect(onReroll).toHaveBeenCalledTimes(1);
  });

  it("offers a way back to the previous result", () => {
    const onBack = vi.fn();
    renderRegion(recommended([yurei, recommendation(8)], 1), { onReroll: vi.fn(), onBack });

    screen.getByRole("button", { name: "Back to the previous one" }).click();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("hides the way back on the first result", () => {
    renderRegion(recommended([yurei, recommendation(8)]), { onReroll: vi.fn(), onBack: vi.fn() });
    expect(screen.queryByRole("button", { name: "Back to the previous one" })).toBeNull();
  });

  it("keeps the re-roll button but names a next action once the queue is exhausted", () => {
    renderRegion(recommended([yurei, recommendation(8)], 1), { onReroll: vi.fn() });

    expect(screen.getByText(/That was the last match for this combination\./)).toBeDefined();
    expect(screen.getByText(/Change one pick to explore again\./)).toBeDefined();
    expect(screen.getByRole("button", { name: "Seen it — show me another" })).toBeDefined();
  });

  it("hides the queue position when there is only one result", () => {
    const { container } = renderRegion(recommended([yurei]));
    expect(container.querySelector(".queue-position")).toBeNull();
  });

  it("renders no controls at all without handlers", () => {
    renderRegion(recommended([yurei, recommendation(8)]));
    expect(screen.queryByRole("button")).toBeNull();
  });
});
