import { describe, expect, it } from "vitest";
import type { Anime, RelatedAnime } from "../models/anime";
import { buildCandidateSeeds } from "./candidates";
import { generateReasons } from "./reasons";
import { rankCandidates, scoreCandidate } from "./scoring";
import { jaccardSimilarity, typeSimilarity } from "./similarity";

const anime = (malId: number, overrides: Partial<Anime> = {}): Anime => ({
  malId,
  title: `Anime ${malId}`,
  imageUrl: null,
  type: "TV",
  year: 2020,
  episodes: 12,
  genres: ["Drama", "Mystery"],
  themes: ["Psychological"],
  studios: ["Studio A"],
  rating: "PG-13",
  ...overrides,
});

describe("similarity", () => {
  it("handles same, disjoint, partial, and empty sets", () => {
    expect(jaccardSimilarity(["Drama"], ["Drama"])).toBe(1);
    expect(jaccardSimilarity(["Drama"], ["Action"])).toBe(0);
    expect(jaccardSimilarity(["Drama", "Mystery"], ["Drama", "Sci-Fi"])).toBe(1 / 3);
    expect(jaccardSimilarity([], [])).toBe(0);
  });

  it("requires known matching types", () => {
    expect(typeSimilarity(anime(1), anime(2))).toBe(1);
    expect(typeSimilarity(anime(1), anime(2, { type: "Movie" }))).toBe(0);
    expect(typeSimilarity(anime(1, { type: null }), anime(2, { type: null }))).toBe(0);
  });
});

describe("candidate generation and ranking", () => {
  const selected = [anime(1), anime(2), anime(3)];
  const relation = (sourceMalId: number, malId: number, relationType: string, mediaType = "anime"): RelatedAnime => ({
    sourceMalId, malId, relationType, mediaType, title: `Anime ${malId}`,
  });

  it("filters unsafe relation types and deduplicates strongest source links", () => {
    const seeds = buildCandidateSeeds(selected, [
      [relation(1, 10, "Side Story"), relation(1, 10, "Other"), relation(1, 11, "Sequel")],
      [relation(2, 10, "Spin-off"), relation(2, 12, "Other", "manga")],
      [relation(3, 1, "Other")],
    ]);
    expect(seeds).toHaveLength(1);
    expect(seeds[0]).toMatchObject({ malId: 10, sourceCount: 2, relationScore: 0.5 });
    expect(seeds[0].relations).toHaveLength(2);
  });

  it("uses final score, source count, then MAL id for stable ordering", () => {
    const seed = buildCandidateSeeds(selected, [[relation(1, 10, "Side Story")], [relation(2, 11, "Side Story")], []]);
    const first = scoreCandidate(seed[0], anime(10), selected);
    const second = scoreCandidate(seed[1], anime(11), selected);
    expect(rankCandidates([second, first]).map((candidate) => candidate.malId)).toEqual([10, 11]);
  });

  it("produces factual reasons", () => {
    const seed = buildCandidateSeeds(selected, [[relation(1, 10, "Side Story")], [relation(2, 10, "Spin-off")], []])[0];
    const candidate = scoreCandidate(seed, anime(10), selected);
    expect(generateReasons(candidate, selected)).toContain("Connected to 2 of your 3 selections");
    expect(generateReasons(candidate, selected)).toContain("Shares Drama with at least 2 selections");
  });
});
