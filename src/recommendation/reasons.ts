import type { Anime, Candidate } from "../models/anime";
import {
  COMMUNITY_RELATION_TYPE,
  MAX_REASON_GENRES,
  MAX_REASON_THEMES,
  MIN_SHARED_SELECTIONS,
} from "./config";

function sharedLabels(
  candidateLabels: string[],
  selectionLabels: string[][],
): string[] {
  return candidateLabels.filter((label) => {
    const lowerLabel = label.toLowerCase();
    return (
      selectionLabels.filter((labels) =>
        labels.some((item) => item.toLowerCase() === lowerLabel),
      ).length >= MIN_SHARED_SELECTIONS
    );
  });
}

export function generateReasons(candidate: Candidate, selected: Anime[]): string[] {
  const reasons: string[] = [];
  if (candidate.sourceCount > 0) {
    reasons.push(`Connected to ${candidate.sourceCount} of your ${selected.length} selections`);
  }
  if (candidate.relations.some((relation) => relation.relationType === COMMUNITY_RELATION_TYPE)) {
    reasons.push("Frequently recommended by fans of your selections");
  }
  const genres = sharedLabels(
    candidate.anime.genres,
    selected.map((anime) => anime.genres),
  ).slice(0, MAX_REASON_GENRES);
  genres.forEach((genre) => reasons.push(`Shares ${genre} with at least ${MIN_SHARED_SELECTIONS} selections`));
  const themes = sharedLabels(
    candidate.anime.themes,
    selected.map((anime) => anime.themes),
  ).slice(0, MAX_REASON_THEMES);
  themes.forEach((theme) =>
    reasons.push(`Shares the ${theme} theme with at least ${MIN_SHARED_SELECTIONS} selections`),
  );
  if (reasons.length === 0) reasons.push("Strong overall metadata match");
  return reasons;
}
