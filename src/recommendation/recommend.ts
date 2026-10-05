import { getAnime, getAnimeRelations } from "../api/anilist";
import type { Anime, CandidateSeed, RecommendationResult } from "../models/anime";
import { DETAIL_CONCURRENCY } from "./config";
import { buildCandidateSeeds } from "./candidates";
import { generateReasons } from "./reasons";
import { rankCandidates, scoreCandidate } from "./scoring";

function isExplicit(anime: Anime): boolean {
  return anime.isAdult;
}

async function hydrateCandidates(seeds: CandidateSeed[]): Promise<Array<{ seed: CandidateSeed; anime: Anime }>> {
  const hydrated: Array<{ seed: CandidateSeed; anime: Anime }> = [];
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < seeds.length) {
      const seed = seeds[nextIndex++];
      try {
        const anime = await getAnime(seed.malId);
        if (!isExplicit(anime)) hydrated.push({ seed, anime });
      } catch {
        // A single unavailable candidate should not invalidate an otherwise useful recommendation.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(DETAIL_CONCURRENCY, seeds.length) }, worker));
  return hydrated;
}

export async function recommend(selected: Anime[]): Promise<RecommendationResult> {
  if (selected.length !== 3 || new Set(selected.map((anime) => anime.malId)).size !== 3) {
    throw new Error("Three different anime are required for a recommendation.");
  }
  const relations = await Promise.all(selected.map((anime) => getAnimeRelations(anime.malId)));
  const seeds = buildCandidateSeeds(selected, relations);
  if (seeds.length === 0) return { kind: "no-match" };
  const hydrated = await hydrateCandidates(seeds);
  const ranked = rankCandidates(hydrated.map(({ seed, anime }) => scoreCandidate(seed, anime, selected)));
  const best = ranked[0];
  if (!best) return { kind: "no-match" };
  best.reasons = generateReasons(best, selected);
  return {
    kind: "recommendation",
    recommendation: { anime: best.anime, reasons: best.reasons, basedOn: selected },
  };
}

export { hydrateCandidates as hydrateCandidatesForTest };
