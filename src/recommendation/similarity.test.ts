import { describe, expect, it } from "vitest";
import { anime } from "./fixtures";
import { eraSimilarity, jaccardSimilarity, metadataSimilarity, typeSimilarity } from "./similarity";

describe("jaccardSimilarity", () => {
  it("handles same, disjoint, partial, and empty sets", () => {
    expect(jaccardSimilarity(["Drama"], ["Drama"])).toBe(1);
    expect(jaccardSimilarity(["Drama"], ["Action"])).toBe(0);
    expect(jaccardSimilarity(["Drama", "Mystery"], ["Drama", "Sci-Fi"])).toBe(1 / 3);
    expect(jaccardSimilarity([], [])).toBe(0);
  });

  it("ignores case and duplicates", () => {
    expect(jaccardSimilarity(["Drama", "drama"], ["DRAMA"])).toBe(1);
    expect(jaccardSimilarity(["Drama", "Drama"], ["Drama"])).toBe(1);
  });
});

describe("typeSimilarity", () => {
  it("requires known matching types", () => {
    expect(typeSimilarity(anime(1), anime(2))).toBe(1);
    expect(typeSimilarity(anime(1), anime(2, { type: "Movie" }))).toBe(0);
    expect(typeSimilarity(anime(1, { type: null }), anime(2, { type: null }))).toBe(0);
    expect(typeSimilarity(anime(1, { type: null }), anime(2))).toBe(0);
  });
});

describe("eraSimilarity", () => {
  it("scores closer release years higher", () => {
    expect(eraSimilarity(anime(1), anime(2))).toBe(1);
    expect(eraSimilarity(anime(1), anime(2, { year: 2025 }))).toBe(0.5);
    expect(eraSimilarity(anime(1), anime(2, { year: 2030 }))).toBe(0);
    expect(eraSimilarity(anime(1), anime(2, { year: null }))).toBe(0);
  });
});

describe("metadataSimilarity", () => {
  it("scores studio similarity from main studios", () => {
    const source = anime(1);
    expect(metadataSimilarity(anime(10), source).studio).toBe(1);
    expect(metadataSimilarity(anime(10, { mainStudios: ["Studio B"] }), source).studio).toBe(0);
  });

  it("returns a total bounded by the sum of the weights", () => {
    const identical = metadataSimilarity(anime(1), anime(1));
    const unrelated = metadataSimilarity(anime(1, { genres: [], themes: [], type: null, mainStudios: [], year: null }), anime(1));
    expect(identical.total).toBeCloseTo(1);
    expect(unrelated.total).toBe(0);
  });

  it("is symmetric", () => {
    const a = anime(10, { genres: ["Drama"], themes: ["Time Travel"], year: 2001 });
    const b = anime(11, { genres: ["Drama", "Action"], themes: ["Time Travel"], year: 2009 });
    expect(metadataSimilarity(a, b).total).toBeCloseTo(metadataSimilarity(b, a).total);
  });
});
