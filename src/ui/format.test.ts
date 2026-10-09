import { describe, expect, it } from "vitest";
import { anilistUrl, metaLine, studioLine } from "./format";

describe("metaLine", () => {
  it("formats the full metadata a fan looks for", () => {
    expect(metaLine({ year: 1998, type: "TV", episodes: 26 } as never)).toBe(
      "1998 - TV - 26 episodes",
    );
  });

  it("omits what AniList does not know", () => {
    expect(metaLine({ type: "Movie", episodes: null } as never)).toBe("Movie");
    expect(metaLine({ year: 2020, type: null, episodes: null } as never)).toBe("2020");
    expect(metaLine({ year: null, type: null, episodes: null } as never)).toBe("");
  });
});

describe("studioLine", () => {
  it("credits every main studio", () => {
    expect(studioLine(["Sunrise"])).toBe("Sunrise");
    expect(studioLine(["Sunrise", "Madhouse"])).toBe("Sunrise, Madhouse");
    expect(studioLine([])).toBe("");
  });
});

describe("anilistUrl", () => {
  it("points at the anime entry for the given id", () => {
    expect(anilistUrl(12345)).toBe("https://anilist.co/anime/12345");
  });

  it("never emits a path that leaves the anime namespace", () => {
    expect(anilistUrl(-7)).toBe("https://anilist.co/anime/-7");
  });
});
