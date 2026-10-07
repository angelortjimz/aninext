import { describe, expect, it } from "vitest";
import { buildCandidateSeeds } from "./candidates";
import { CANDIDATE_LIMIT } from "./config";
import { communityRecommendation, relation, selectedThree } from "./fixtures";

describe("buildCandidateSeeds", () => {
  const selected = selectedThree();

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
    expect(seeds[0]?.relations).toHaveLength(2);
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
      [[communityRecommendation(1, 10, 30)], [communityRecommendation(2, 10, 12)], []],
    );
    expect(seeds).toHaveLength(1);
    expect(seeds[0]).toMatchObject({ id: 10, sourceCount: 2, relationScore: 1 / 3 });
    expect(seeds[0]?.relations.every((item) => item.relationType === "COMMUNITY")).toBe(true);
  });

  it("prefers the higher weight when one source both relates and recommends a title", () => {
    const seeds = buildCandidateSeeds(
      selected,
      [[relation(1, 10, "OTHER")], [], []],
      [[communityRecommendation(1, 10)], [], []],
    );
    expect(seeds[0]?.relations).toHaveLength(1);
    expect(seeds[0]?.relations[0]).toMatchObject({
      sourceId: 1,
      relationType: "COMMUNITY",
      weight: 0.5,
    });
  });

  it("excludes the selections themselves and non-anime media", () => {
    const seeds = buildCandidateSeeds(
      selected,
      [
        [relation(1, 1, "SIDE_STORY"), relation(1, 2, "SIDE_STORY"), relation(1, 3, "SIDE_STORY")],
        [relation(2, 20, "SIDE_STORY", "manga")],
      ],
      [[], [], []],
    );
    expect(seeds).toEqual([]);
  });

  it("counts each source once no matter how many links it contributes", () => {
    const seeds = buildCandidateSeeds(
      selected,
      [[relation(1, 10, "SIDE_STORY"), relation(1, 10, "OTHER")], [], []],
      [[], [], []],
    );
    expect(seeds[0]).toMatchObject({ sourceCount: 1, relationScore: 0.8 / selected.length });
  });

  it("caps the candidate list and orders it by relation score", () => {
    const relations = [1, 2, 3].map((sourceId) =>
      Array.from({ length: 12 }, (_, offset) => relation(sourceId, 100 + sourceId * 20 + offset, "SIDE_STORY")),
    );
    const seeds = buildCandidateSeeds(selected, relations, [[], [], []]);
    expect(seeds).toHaveLength(CANDIDATE_LIMIT);
    const scores = seeds.map((seed) => seed.relationScore);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("breaks equal scores by source count then id", () => {
    const seeds = buildCandidateSeeds(
      selected,
      [
        [relation(1, 10, "SIDE_STORY"), relation(2, 10, "SIDE_STORY")],
        [relation(1, 11, "SIDE_STORY")],
      ],
      [[], [], []],
    );
    expect(seeds.map((seed) => seed.id)).toEqual([10, 11]);
  });

  it("returns nothing when there are no eligible connections", () => {
    expect(buildCandidateSeeds(selected, [[], [], []], [[], [], []])).toEqual([]);
  });
});
