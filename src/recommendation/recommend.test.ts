import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAnilistCache } from "@/api/anilist";
import type { Anime, CommunityRecommendation, RelatedAnime } from "@/models/anime";
import { anime, relation, reversed, selectedThree } from "./fixtures";
import { recommend } from "./recommend";

const api = vi.hoisted(() => ({
  connections: new Map<
    number,
    { relations: RelatedAnime[]; recommendations: CommunityRecommendation[] }
  >(),
  batch: new Map<number, Anime>(),
}));

vi.mock("../api/anilist", async (importOriginal) => {
  const original = await importOriginal<typeof import("../api/anilist")>();
  return {
    ...original,
    getAnimeConnections: vi.fn(async (id: number) => {
      const found = api.connections.get(id);
      if (!found) throw new Error(`no connections stubbed for ${id}`);
      return found;
    }),
    getAnimeBatch: vi.fn(async (ids: number[]) =>
      ids.flatMap((id) => {
        const found = api.batch.get(id);
        return found ? [found] : [];
      }),
    ),
  };
});

beforeEach(() => {
  api.connections.clear();
  api.batch.clear();
  clearAnilistCache();
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

/** Registers three selections whose connections point at the given candidates. */
function scenario(
  candidates: { id: number; isAdult?: boolean; omit?: boolean; popularity?: number }[],
) {
  const selected = selectedThree();
  selected.forEach((source) => {
    api.connections.set(source.id, {
      relations: candidates.map((candidate) => relation(source.id, candidate.id, "SIDE_STORY")),
      recommendations: [],
    });
    api.batch.set(source.id, source);
  });
  candidates.forEach((candidate) => {
    if (candidate.omit) return;
    api.batch.set(
      candidate.id,
      anime(candidate.id, {
        isAdult: candidate.isAdult ?? false,
        popularity: candidate.popularity ?? 100,
      }),
    );
  });
  return selected;
}

/** Narrows the result union so each test can read `results` without a guard. */
function asRecommendation(result: Awaited<ReturnType<typeof recommend>>) {
  if (result.kind !== "recommendation")
    throw new Error(`expected a recommendation, got ${result.kind}`);
  return result;
}

describe("recommend", () => {
  it("rejects anything other than three different anime", async () => {
    await expect(recommend([])).rejects.toThrow(/3 different anime/);
    await expect(recommend([anime(1), anime(2)])).rejects.toThrow(/3 different anime/);
    await expect(recommend([anime(1), anime(2), anime(3), anime(4)])).rejects.toThrow(
      /3 different anime/,
    );
    await expect(recommend([anime(1), anime(1), anime(2)])).rejects.toThrow(/3 different anime/);
  });

  it("returns a recommendation with reasons and the sources it came from", async () => {
    const selected = scenario([{ id: 10 }, { id: 11 }]);
    const best = asRecommendation(await recommend(selected)).results[0];
    expect(best?.anime.id).toBeGreaterThan(0);
    expect(best?.basedOn.map((item) => item.id)).toEqual([1, 2, 3]);
    expect(best?.reasons.length).toBeGreaterThan(0);
  });

  it("returns every eligible candidate as a ranked queue, each with its own reasons", async () => {
    const selected = scenario([{ id: 10 }, { id: 11 }, { id: 12 }]);
    const results = asRecommendation(await recommend(selected)).results;
    expect(results.map((item) => item.anime.id)).toEqual([10, 11, 12]);
    for (const entry of results) {
      expect(entry.reasons.length).toBeGreaterThan(0);
      expect(entry.basedOn.map((item) => item.id)).toEqual([1, 2, 3]);
    }
  });

  it("drops adult, vanished and repeated candidates without repeating an anime", async () => {
    const selected = scenario([
      { id: 10, isAdult: true },
      { id: 11, omit: true },
      { id: 12 },
      { id: 12 },
    ]);
    const results = asRecommendation(await recommend(selected)).results;
    expect(results.map((item) => item.anime.id)).toEqual([12]);
    expect(results[0]?.anime.isAdult).toBe(false);
  });

  it("reports no match for every route to an empty result", async () => {
    // No connections at all.
    selectedThree().forEach((source) => {
      api.connections.set(source.id, { relations: [], recommendations: [] });
    });
    expect(await recommend(selectedThree())).toEqual({ kind: "no-match" });

    // Every candidate rejected as adult.
    expect(await recommend(scenario([{ id: 10, isAdult: true }]))).toEqual({ kind: "no-match" });

    // Every candidate no longer returned by AniList.
    expect(await recommend(scenario([{ id: 10, omit: true }]))).toEqual({ kind: "no-match" });
  });

  it("never recommends one of the selections", async () => {
    const selected = scenario([{ id: 1 }, { id: 10 }]);
    expect(asRecommendation(await recommend(selected)).results[0]?.anime.id).not.toBe(1);
  });

  it("picks the higher scoring candidate", async () => {
    const selected = scenario([{ id: 10 }, { id: 11 }]);
    api.batch.set(
      10,
      anime(10, { genres: [], themes: [], mainStudios: [], type: null, year: null }),
    );
    expect(asRecommendation(await recommend(selected)).results[0]?.anime.id).toBe(11);
  });

  it("is deterministic under shuffled candidates and reordered selections", async () => {
    const candidates = [{ id: 10 }, { id: 11 }, { id: 12 }, { id: 13 }];

    const forward = scenario(candidates);
    const runA = await recommend(forward);
    const runB = await recommend(forward);

    // A fresh scenario with the candidates offered in a different order.
    api.connections.clear();
    api.batch.clear();
    const shuffled = scenario(reversed(candidates));
    const runC = await recommend(shuffled);

    // ...and the same three selections handed over back to front.
    api.connections.clear();
    api.batch.clear();
    const reordered = scenario(candidates);
    const runD = await recommend(reversed(reordered));

    expect(runA).toEqual(runB);

    for (const other of [runC, runD]) {
      const a = asRecommendation(runA);
      const b = asRecommendation(other);
      expect(b.results.map((item) => item.anime.id)).toEqual(
        a.results.map((item) => item.anime.id),
      );
      expect(b.results[0]?.reasons).toEqual(a.results[0]?.reasons);
    }
  });

  it("propagates a failure from the connections lookup", async () => {
    api.connections.clear();
    await expect(recommend(selectedThree())).rejects.toThrow(/no connections stubbed/);
  });
});
