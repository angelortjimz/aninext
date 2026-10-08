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
    const result = await recommend(selected);
    expect(result.kind).toBe("recommendation");
    if (result.kind !== "recommendation") return;
    const best = result.results[0];
    expect(best?.anime.id).toBeGreaterThan(0);
    expect(best?.basedOn.map((item) => item.id)).toEqual([1, 2, 3]);
    expect(best?.reasons.length).toBeGreaterThan(0);
  });

  it("returns every eligible candidate as a re-rollable ranked queue", async () => {
    const selected = scenario([{ id: 10 }, { id: 11 }, { id: 12 }]);
    const result = await recommend(selected);
    expect(result.kind).toBe("recommendation");
    if (result.kind !== "recommendation") return;
    expect(result.results.map((item) => item.anime.id)).toEqual([10, 11, 12]);
    // Every entry carries its own reasons and the same sources.
    for (const entry of result.results) {
      expect(entry.reasons.length).toBeGreaterThan(0);
      expect(entry.basedOn.map((item) => item.id)).toEqual([1, 2, 3]);
    }
  });

  it("never puts a dropped candidate into the re-roll queue", async () => {
    const selected = scenario([{ id: 10, isAdult: true }, { id: 11, omit: true }, { id: 12 }]);
    const result = await recommend(selected);
    expect(result.kind).toBe("recommendation");
    if (result.kind !== "recommendation") return;
    expect(result.results.map((item) => item.anime.id)).toEqual([12]);
  });

  it("never repeats an anime within the queue", async () => {
    const selected = scenario([{ id: 10 }, { id: 10 }, { id: 11 }]);
    const result = await recommend(selected);
    expect(result.kind).toBe("recommendation");
    if (result.kind !== "recommendation") return;
    const ids = result.results.map((item) => item.anime.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("reports no match when no candidate is eligible", async () => {
    const selected = selectedThree();
    selected.forEach((source) => {
      api.connections.set(source.id, { relations: [], recommendations: [] });
    });
    expect(await recommend(selected)).toEqual({ kind: "no-match" });
  });

  it("drops adult candidates instead of recommending them", async () => {
    const selected = scenario([{ id: 10, isAdult: true }, { id: 11 }]);
    const result = await recommend(selected);
    expect(result.kind).toBe("recommendation");
    if (result.kind !== "recommendation") return;
    expect(result.results[0]?.anime.isAdult).toBe(false);
    expect(result.results[0]?.anime.id).not.toBe(10);
  });

  it("reports no match when every candidate is adult", async () => {
    const selected = scenario([{ id: 10, isAdult: true }]);
    expect(await recommend(selected)).toEqual({ kind: "no-match" });
  });

  it("drops candidates AniList no longer returns", async () => {
    const selected = scenario([{ id: 10, omit: true }, { id: 11 }]);
    const result = await recommend(selected);
    expect(result.kind).toBe("recommendation");
    if (result.kind !== "recommendation") return;
    expect(result.results[0]?.anime.id).toBe(11);
  });

  it("returns no match when every candidate has vanished", async () => {
    const selected = scenario([{ id: 10, omit: true }]);
    expect(await recommend(selected)).toEqual({ kind: "no-match" });
  });

  it("never recommends one of the selections", async () => {
    const selected = scenario([{ id: 1 }, { id: 10 }]);
    const result = await recommend(selected);
    expect(result.kind).toBe("recommendation");
    if (result.kind !== "recommendation") return;
    expect(result.results[0]?.anime.id).not.toBe(1);
  });

  it("picks the higher scoring candidate", async () => {
    const selected = scenario([{ id: 10 }, { id: 11 }]);
    api.batch.set(
      10,
      anime(10, { genres: [], themes: [], mainStudios: [], type: null, year: null }),
    );
    const result = await recommend(selected);
    expect(result.kind).toBe("recommendation");
    if (result.kind !== "recommendation") return;
    expect(result.results[0]?.anime.id).toBe(11);
  });

  it("is deterministic across repeated calls and shuffled candidates", async () => {
    const candidates = [{ id: 10 }, { id: 11 }, { id: 12 }, { id: 13 }];

    const first = scenario(candidates);
    const runA = await recommend(first);
    const runB = await recommend(first);

    // A fresh scenario with the candidates offered in a different order.
    api.connections.clear();
    api.batch.clear();
    const second = scenario(reversed(candidates));
    const runC = await recommend(second);

    expect(runA).toEqual(runB);
    expect(runA.kind).toBe("recommendation");
    expect(runC.kind).toBe("recommendation");
    if (runA.kind !== "recommendation" || runC.kind !== "recommendation") return;
    expect(runC.results[0]?.anime.id).toBe(runA.results[0]?.anime.id);
    expect(runC.results[0]?.reasons).toEqual(runA.results[0]?.reasons);
    // The whole queue is order-stable, not just the winner.
    expect(runC.results.map((item) => item.anime.id)).toEqual(
      runA.results.map((item) => item.anime.id),
    );
  });

  it("produces identical output for reordered selections", async () => {
    const forward = scenario([{ id: 10 }, { id: 11 }]);
    const resultForward = await recommend(forward);

    api.connections.clear();
    api.batch.clear();
    const backward = scenario([{ id: 10 }, { id: 11 }]);
    const resultBackward = await recommend(reversed(backward));

    expect(resultForward.kind).toBe("recommendation");
    expect(resultBackward.kind).toBe("recommendation");
    if (resultForward.kind !== "recommendation" || resultBackward.kind !== "recommendation") return;
    expect(resultBackward.results[0]?.anime.id).toBe(resultForward.results[0]?.anime.id);
    expect(resultBackward.results[0]?.reasons).toEqual(resultForward.results[0]?.reasons);
    expect(resultBackward.results.map((item) => item.anime.id)).toEqual(
      resultForward.results.map((item) => item.anime.id),
    );
  });

  it("propagates a failure from the connections lookup", async () => {
    api.connections.clear();
    await expect(recommend(selectedThree())).rejects.toThrow(/no connections stubbed/);
  });
});
