import { getAnimeBatch, getAnimeConnections } from "@/api/anilist";
import type { Anime, Candidate, CandidateSeed, RecommendationResult } from "@/models/anime";
import { buildCandidateSeeds } from "./candidates";
import { REQUIRED_SELECTIONS } from "./config";
import { generateReasons } from "./reasons";
import { rankCandidates, scoreCandidate } from "./scoring";

async function hydrateCandidates(seeds: CandidateSeed[], selected: Anime[]): Promise<Candidate[]> {
  if (seeds.length === 0) return [];
  const anime = await getAnimeBatch(seeds.map((seed) => seed.id));
  const byId = new Map(anime.map((item) => [item.id, item]));
  return seeds.flatMap((seed) => {
    const found = byId.get(seed.id);
    // A single unavailable or adult candidate should not invalidate an otherwise useful recommendation.
    return found && !found.isAdult ? [scoreCandidate(seed, found, selected)] : [];
  });
}

export async function recommend(selected: Anime[]): Promise<RecommendationResult> {
  const distinctIds = new Set(selected.map((anime) => anime.id)).size;
  if (selected.length !== REQUIRED_SELECTIONS || distinctIds !== REQUIRED_SELECTIONS) {
    throw new Error(`${REQUIRED_SELECTIONS} different anime are required for a recommendation.`);
  }
  const connections = await Promise.all(selected.map((anime) => getAnimeConnections(anime.id)));
  const seeds = buildCandidateSeeds(
    selected,
    connections.map((connection) => connection.relations),
    connections.map((connection) => connection.recommendations),
  );
  if (seeds.length === 0) return { kind: "no-match" };
  const ranked = rankCandidates(await hydrateCandidates(seeds, selected));
  const best = ranked[0];
  if (!best) return { kind: "no-match" };
  return {
    kind: "recommendation",
    recommendation: {
      anime: best.anime,
      reasons: generateReasons(best, selected),
      basedOn: selected,
    },
  };
}
