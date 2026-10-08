// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Recommendation } from "@/models/anime";
import type { UiState } from "@/models/ui";
import { anime } from "@/recommendation/fixtures";
import { ResultRegion } from "./ResultRegion";

afterEach(cleanup);

const recommendation = (id: number, overrides: Partial<Recommendation> = {}): Recommendation => ({
  anime: anime(id, { title: `Anime ${id}`, imageUrl: `https://img.example/${id}.jpg` }),
  reasons: ["Shares a strong Drama tag", "Adjacent in the same thematic cluster"],
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

describe("ResultRegion", () => {
  it("renders nothing while idle", () => {
    const { container } = render(<ResultRegion ui={{ kind: "idle" }} />);
    expect(container.innerHTML).toBe("");
  });

  it("shows a spinner and progress copy while loading", () => {
    const { container } = render(<ResultRegion ui={{ kind: "loading" }} />);
    expect(screen.getByText("Finding your next anime...")).toBeDefined();
    expect(container.querySelector(".spinner")).not.toBeNull();
  });

  it("renders the title, metadata, every reason and the based-on list", () => {
    render(<ResultRegion ui={recommended([yurei])} />);

    expect(screen.getByRole("heading", { name: "Yurei Deco" })).toBeDefined();
    expect(screen.getByText("2020 - TV - 12 episodes")).toBeDefined();
    expect(screen.getByText("Shares a strong Drama tag")).toBeDefined();
    expect(screen.getByText("Adjacent in the same thematic cluster")).toBeDefined();
    expect(screen.getByText("Based on First Pick / Second Pick")).toBeDefined();
  });

  it("labels the recommendation region by the anime title", () => {
    render(<ResultRegion ui={recommended([yurei])} />);
    const region = screen.getByRole("region", { name: "Yurei Deco" });
    expect(region).toBeDefined();
  });

  it("renders a filled placeholder when cover art is missing", () => {
    const { container } = render(
      <ResultRegion
        ui={recommended([recommendation(7, { anime: anime(7, { imageUrl: null }) })])}
      />,
    );
    expect(container.querySelector(".cover--placeholder")).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("falls back to generic copy when metadata is entirely empty", () => {
    render(
      <ResultRegion
        ui={recommended([
          recommendation(7, {
            anime: anime(7, { title: "Yurei Deco", type: null, year: null, episodes: null }),
          }),
        ])}
      />,
    );
    expect(screen.getAllByText("Anime").length).toBeGreaterThan(0);
  });

  it.each([
    ["no-match", "No discovery match yet"],
    ["unavailable", "One selection is no longer available"],
    ["error", "We could not find a recommendation"],
  ] as const)("explains the %s outcome", (kind, heading) => {
    render(<ResultRegion ui={{ kind }} />);
    expect(screen.getByRole("heading", { name: heading })).toBeDefined();
  });
});

describe("ResultRegion re-roll", () => {
  it("renders the result at the given index", () => {
    render(<ResultRegion ui={recommended([yurei, recommendation(8)], 1)} />);
    expect(screen.getByRole("heading", { name: "Anime 8" })).toBeDefined();
    expect(screen.queryByRole("heading", { name: "Yurei Deco" })).toBeNull();
  });

  it("falls back to the first result when the index is out of range", () => {
    render(<ResultRegion ui={recommended([yurei, recommendation(8)], 5)} />);
    expect(screen.getByRole("heading", { name: "Yurei Deco" })).toBeDefined();
  });

  it("offers the re-roll while a later result exists", () => {
    const onReroll = vi.fn();
    render(<ResultRegion ui={recommended([yurei, recommendation(8)])} onReroll={onReroll} />);

    const button = screen.getByRole("button", { name: "Seen it — show me another" });
    button.click();
    expect(onReroll).toHaveBeenCalledTimes(1);
  });

  it("hides the button and notes exhaustion on the last result", () => {
    render(<ResultRegion ui={recommended([yurei, recommendation(8)], 1)} onReroll={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Seen it — show me another" })).toBeNull();
    expect(screen.getByText("That was the last match for this combination.")).toBeDefined();
  });

  it("hides the button on a single-result queue", () => {
    render(<ResultRegion ui={recommended([yurei])} onReroll={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Seen it — show me another" })).toBeNull();
  });

  it("renders no controls at all without a handler", () => {
    render(<ResultRegion ui={recommended([yurei, recommendation(8)])} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText("That was the last match for this combination.")).toBeNull();
  });
});
