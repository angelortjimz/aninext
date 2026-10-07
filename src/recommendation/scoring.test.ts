import { describe, expect, it } from "vitest";
import { buildCandidateSeeds } from "./candidates";
import { SCORING_WEIGHTS } from "./config";
import { anime, relation, selectedThree } from "./fixtures";
import { rankCandidates, scoreCandidate } from "./scoring";
import { metadataSimilarity } from "./similarity";

function seedFor(id: number) {
  return buildCandidateSeeds(
    selectedThree(),
    [[relation(1, id, "SIDE_STORY")], [], []],
    [[], [], []],
  )[0];
}

describe("scoreCandidate", () => {
  const selected = selectedThree();

  it("combines the relation and metadata scores with the configured weights", () => {
    const candidate = scoreCandidate(seedFor(10), anime(10), selected);
    const metadataScore =
      selected.reduce((total, source) => total + metadataSimilarity(candidate.anime, source).total, 0) /
      selected.length;
    expect(candidate.finalScore).toBeCloseTo(
      candidate.relationScore * SCORING_WEIGHTS.relation +
        metadataScore * SCORING_WEIGHTS.metadata,
      6,
    );
  });

  it("carries the seed fields onto the candidate", () => {
    const candidate = scoreCandidate(seedFor(10), anime(10), selected);
    expect(candidate.id).toBe(10);
    expect(candidate.sourceCount).toBe(1);
    expect(candidate.relations).toHaveLength(1);
    expect(candidate.anime.id).toBe(10);
    expect(candidate.reasons).toEqual([]);
  });

  it("scores a closer metadata match higher", () => {
    const seed = seedFor(10);
    const close = scoreCandidate(seed, anime(10), selected);
    const distant = scoreCandidate(
      seed,
      anime(10, { genres: [], themes: [], mainStudios: [], type: null, year: null }),
      selected,
    );
    expect(close.finalScore).toBeGreaterThan(distant.finalScore);
  });

  it("is deterministic for identical inputs", () => {
    const seed = seedFor(10);
    const a = scoreCandidate(seed, anime(10), selected);
    const b = scoreCandidate(seed, anime(10), selected);
    expect(a.finalScore).toBe(b.finalScore);
  });
});

describe("rankCandidates", () => {
  const selected = selectedThree();

  it("orders by final score", () => {
    const first = scoreCandidate(seedFor(10), anime(10, { popularity: 500 }), selected);
    const second = scoreCandidate(seedFor(11), anime(11, { popularity: 100 }), selected);
    expect(rankCandidates([second, first]).map((candidate) => candidate.id)).toEqual([10, 11]);
  });

  it("breaks equal scores by popularity", () => {
    const first = scoreCandidate(seedFor(10), anime(10, { popularity: 100 }), selected);
    const second = scoreCandidate(seedFor(11), anime(11, { popularity: 900 }), selected);
    expect(rankCandidates([second, first]).map((candidate) => candidate.id)).toEqual([11, 10]);
  });

  it("breaks equal scores and popularity by id", () => {
    const first = scoreCandidate(seedFor(10), anime(10, { popularity: 100 }), selected);
    const second = scoreCandidate(seedFor(11), anime(11, { popularity: 100 }), selected);
    expect(rankCandidates([second, first]).map((candidate) => candidate.id)).toEqual([10, 11]);
  });

  it("is order-independent", () => {
    const candidates = [
      scoreCandidate(seedFor(10), anime(10, { popularity: 100 }), selected),
      scoreCandidate(seedFor(11), anime(11, { popularity: 100 }), selected),
      scoreCandidate(seedFor(12), anime(12, { popularity: 100 }), selected),
    ];
    const forwards = rankCandidates(candidates).map((candidate) => candidate.id);
    const backwards = rankCandidates([...candidates].reverse()).map((candidate) => candidate.id);
    expect(forwards).toEqual(backwards);
  });

  it("does not mutate its input", () => {
    const candidates = [
      scoreCandidate(seedFor(10), anime(10), selected),
      scoreCandidate(seedFor(11), anime(11), selected),
    ];
    const before = candidates.map((candidate) => candidate.id);
    rankCandidates(candidates);
    expect(candidates.map((candidate) => candidate.id)).toEqual(before);
  });
});
