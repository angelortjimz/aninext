import { describe, expect, it } from "vitest";
import type { Anime, CommunityRecommendation, RelatedAnime } from "../models/anime";
import { buildCandidateSeeds } from "./candidates";
import { generateReasons } from "./reasons";
import { rankCandidates, scoreCandidate } from "./scoring";
import { eraSimilarity, jaccardSimilarity, metadataSimilarity, typeSimilarity } from "./similarity";

const anime = (id: number, overrides: Partial<Anime> = {}): Anime => ({
  id,
  title: `Anime ${id}`,
  imageUrl: null,
  type: "TV",
  year: 2020,
  episodes: 12,
  genres: ["Drama", "Mystery"],
  themes: ["Psychological"],
  mainStudios: ["Studio A"],
  popularity: 100,
  isAdult: false,
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

  it("scores closer release years higher", () => {
    expect(eraSimilarity(anime(1), anime(2))).toBe(1);
    expect(eraSimilarity(anime(1), anime(2, { year: 2025 }))).toBe(0.5);
    expect(eraSimilarity(anime(1), anime(2, { year: 2030 }))).toBe(0);
    expect(eraSimilarity(anime(1), anime(2, { year: null }))).toBe(0);
  });

  it("scores studio similarity from main studios", () => {
    const source = anime(1);
    const sameStudio = metadataSimilarity(anime(10), source);
    const differentStudio = metadataSimilarity(
      anime(10, { mainStudios: ["Studio B"] }),
      source,
    );
    expect(sameStudio.studio).toBe(1);
    expect(differentStudio.studio).toBe(0);
  });
});

describe("candidate generation and ranking", () => {
  const selected = [anime(1), anime(2), anime(3)];
  const relation = (sourceId: number, id: number, relationType: string, mediaType = "anime"): RelatedAnime => ({
    sourceId, id, relationType, mediaType, title: `Anime ${id}`,
  });
  const recommendation = (sourceId: number, id: number, rating = 10): CommunityRecommendation => ({
    sourceId, id, rating, mediaType: "anime", title: `Anime ${id}`,
  });

  it("filters unsafe relation types and deduplicates strongest source links", () => {
    const seeds = buildCandidateSeeds(
      selected,
      [
        [relation(1, 10, "SIDE_STORY"), relation(1, 10, "OTHER"), relation(1, 11, "SEQUEL")],
        [relation(2, 10, "SPIN_OFF"), relation(2, 12, "OTHER", "manga")],
        [relation(3, 1, "OTHER")],
      ],
      [[], [], []],
    );
    expect(seeds).toHaveLength(1);
    expect(seeds[0]).toMatchObject({ id: 10, sourceCount: 2, relationScore: 0.5 });
    expect(seeds[0].relations).toHaveLength(2);
  });

  it("includes same-universe relations as discovery candidates", () => {
    const seeds = buildCandidateSeeds(
      selected,
      [[relation(1, 10, "SAME_UNIVERSE")], [relation(2, 10, "SAME_UNIVERSE")], []],
      [[], [], []],
    );
    expect(seeds).toHaveLength(1);
    expect(seeds[0]).toMatchObject({ id: 10, sourceCount: 2, relationScore: 1 / 3 });
  });

  it("includes community recommendations as candidates", () => {
    const seeds = buildCandidateSeeds(
      selected,
      [[], [], []],
      [[recommendation(1, 10, 30)], [recommendation(2, 10, 12)], []],
    );
    expect(seeds).toHaveLength(1);
    expect(seeds[0]).toMatchObject({ id: 10, sourceCount: 2, relationScore: 1 / 3 });
    expect(seeds[0].relations.every((item) => item.relationType === "COMMUNITY")).toBe(true);
  });

  it("keeps the strongest link when a source relates and recommends the same title", () => {
    const seeds = buildCandidateSeeds(
      selected,
      [[relation(1, 10, "OTHER")], [], []],
      [[recommendation(1, 10)], [], []],
    );
    expect(seeds[0].relations).toHaveLength(1);
    expect(seeds[0].relations[0]).toMatchObject({ sourceId: 1, relationType: "COMMUNITY", weight: 0.5 });
  });

  it("uses final score, source count, then popularity and id for stable ordering", () => {
    const seeds = buildCandidateSeeds(
      selected,
      [[relation(1, 10, "SIDE_STORY")], [relation(2, 11, "SIDE_STORY")], []],
      [[], [], []],
    );
    const first = scoreCandidate(seeds[0], anime(10, { popularity: 500 }), selected);
    const second = scoreCandidate(seeds[1], anime(11, { popularity: 100 }), selected);
    expect(rankCandidates([second, first]).map((candidate) => candidate.id)).toEqual([10, 11]);
  });

  it("breaks equal scores by popularity", () => {
    const seeds = buildCandidateSeeds(
      selected,
      [[relation(1, 10, "SIDE_STORY")], [relation(2, 11, "SIDE_STORY")], []],
      [[], [], []],
    );
    const first = scoreCandidate(seeds[0], anime(10, { popularity: 100 }), selected);
    const second = scoreCandidate(seeds[1], anime(11, { popularity: 900 }), selected);
    expect(rankCandidates([second, first]).map((candidate) => candidate.id)).toEqual([11, 10]);
  });

  it("produces factual reasons including community recommendations", () => {
    const seed = buildCandidateSeeds(
      selected,
      [[relation(1, 10, "SIDE_STORY")], [relation(2, 10, "SPIN_OFF")], []],
      [[], [], [recommendation(3, 10)]],
    )[0];
    const candidate = scoreCandidate(seed, anime(10), selected);
    const reasons = generateReasons(candidate, selected);
    expect(reasons).toContain("Connected to 3 of your 3 selections");
    expect(reasons).toContain("Frequently recommended by fans of your selections");
    expect(reasons).toContain("Shares Drama with at least 2 selections");
  });
});
