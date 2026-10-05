import { getAnimeBatch, getAnimeConnections } from "../api/anilist";
import type { Anime, CandidateSeed, RecommendationResult } from "../models/anime";
import { buildCandidateSeeds } from "./candidates";
import { generateReasons } from "./reasons";
import { rankCandidates, scoreCandidate } from "./scoring";

async function hydrateCandidates(seeds: CandidateSeed[]): Promise<Array<{ seed: CandidateSeed; anime: Anime }>> {
  if (seeds.length === 0) return [];
  const anime = await getAnimeBatch(seeds.map((seed) => seed.id));
  const byId = new Map(anime.map((item) => [item.id, item]));
  return seeds.flatMap((seed) => {
    const found = byId.get(seed.id);
    // A single unavailable or adult candidate should not invalidate an otherwise useful recommendation.
    return found && !found.isAdult ? [{ seed, anime: found }] : [];
  });
}

export async function recommend(selected: Anime[]): Promise<RecommendationResult> {
  if (selected.length !== 3 || new Set(selected.map((anime) => anime.id)).size !== 3) {
    throw new Error("Three different anime are required for a recommendation.");
  }
  const connections = await Promise.all(selected.map((anime) => getAnimeConnections(anime.id)));
  const seeds = buildCandidateSeeds(
    selected,
    connections.map((connection) => connection.relations),
    connections.map((connection) => connection.recommendations),
  );
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
