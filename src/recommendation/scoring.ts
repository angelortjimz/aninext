import type { Anime, Candidate, CandidateSeed } from "@/models/anime";
import { SCORING_WEIGHTS } from "./config";
import { metadataSimilarity } from "./similarity";

export function scoreCandidate(seed: CandidateSeed, anime: Anime, selected: Anime[]): Candidate {
  const comparisons = selected.map((source) => metadataSimilarity(anime, source));
  const metadataScore =
    comparisons.reduce((total, score) => total + score.total, 0) / comparisons.length;
  return {
    ...seed,
    anime,
    finalScore:
      seed.relationScore * SCORING_WEIGHTS.relation + metadataScore * SCORING_WEIGHTS.metadata,
    reasons: [],
  };
}

export function rankCandidates(candidates: Candidate[]): Candidate[] {
  return [...candidates].sort(
    (a, b) =>
      b.finalScore - a.finalScore ||
      b.sourceCount - a.sourceCount ||
      b.anime.popularity - a.anime.popularity ||
      a.id - b.id,
  );
}
