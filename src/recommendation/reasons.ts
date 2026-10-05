import type { Anime, Candidate } from "../models/anime";

function sharedLabels(candidateLabels: string[], selected: Anime[], accessor: (anime: Anime) => string[]): string[] {
  return candidateLabels.filter((label) => {
    const lowerLabel = label.toLowerCase();
    return selected.filter((anime) => accessor(anime).some((item) => item.toLowerCase() === lowerLabel)).length >= 2;
  });
}

export function generateReasons(candidate: Candidate, selected: Anime[]): string[] {
  const reasons: string[] = [];
  if (candidate.sourceCount > 0) {
    reasons.push(`Connected to ${candidate.sourceCount} of your 3 selections`);
  }
  const genres = sharedLabels(candidate.anime.genres, selected, (anime) => anime.genres).slice(0, 2);
  genres.forEach((genre) => reasons.push(`Shares ${genre} with at least 2 selections`));
  const themes = sharedLabels(candidate.anime.themes, selected, (anime) => anime.themes).slice(0, 1);
  themes.forEach((theme) => reasons.push(`Shares the ${theme} theme with at least 2 selections`));
  if (reasons.length === 0) reasons.push("Strong overall metadata match");
  return reasons;
}
