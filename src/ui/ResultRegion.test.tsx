// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Recommendation } from "@/models/anime";
import { anime } from "@/recommendation/fixtures";
import { ResultRegion } from "./ResultRegion";

afterEach(cleanup);

const recommendation = (overrides: Partial<Recommendation> = {}): Recommendation => ({
  anime: anime(7, { title: "Yurei Deco", imageUrl: "https://img.example/7.jpg" }),
  reasons: ["Shares a strong Drama tag", "Adjacent in the same thematic cluster"],
  basedOn: [anime(1, { title: "First Pick" }), anime(2, { title: "Second Pick" })],
  ...overrides,
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
    render(<ResultRegion ui={{ kind: "recommendation", recommendation: recommendation() }} />);

    expect(screen.getByRole("heading", { name: "Yurei Deco" })).toBeDefined();
    expect(screen.getByText("2020 - TV - 12 episodes")).toBeDefined();
    expect(screen.getByText("Shares a strong Drama tag")).toBeDefined();
    expect(screen.getByText("Adjacent in the same thematic cluster")).toBeDefined();
    expect(screen.getByText("Based on First Pick / Second Pick")).toBeDefined();
  });

  it("labels the recommendation region by the anime title", () => {
    render(<ResultRegion ui={{ kind: "recommendation", recommendation: recommendation() }} />);
    const region = screen.getByRole("region", { name: "Yurei Deco" });
    expect(region).toBeDefined();
  });

  it("renders a filled placeholder when cover art is missing", () => {
    const { container } = render(
      <ResultRegion
        ui={{
          kind: "recommendation",
          recommendation: recommendation({ anime: anime(7, { imageUrl: null }) }),
        }}
      />,
    );
    expect(container.querySelector(".cover--placeholder")).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("falls back to generic copy when metadata is entirely empty", () => {
    render(
      <ResultRegion
        ui={{
          kind: "recommendation",
          recommendation: recommendation({
            anime: anime(7, { title: "Yurei Deco", type: null, year: null, episodes: null }),
          }),
        }}
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
