import type { Anime, Candidate, CandidateSeed } from "../models/anime";
import { SCORING_WEIGHTS } from "./config";
import { metadataSimilarity } from "./similarity";

export function scoreCandidate(seed: CandidateSeed, anime: Anime, selected: Anime[]): Candidate {
  const comparisons = selected.map((source) => metadataSimilarity(anime, source));
  const average = (field: "genre" | "theme" | "type" | "studio" | "total") =>
    comparisons.reduce((total, score) => total + score[field], 0) / comparisons.length;
  const metadataScore = average("total");
  return {
    ...seed,
    anime,
    genreScore: average("genre"),
    themeScore: average("theme"),
    typeScore: average("type"),
    studioScore: average("studio"),
    metadataScore,
    finalScore: seed.relationScore * SCORING_WEIGHTS.relation + metadataScore * SCORING_WEIGHTS.metadata,
    reasons: [],
  };
}

export function rankCandidates(candidates: Candidate[]): Candidate[] {
  return [...candidates].sort(
    (a, b) => b.finalScore - a.finalScore || b.sourceCount - a.sourceCount || a.malId - b.malId,
  );
}
