import type { Anime, Candidate } from "@/models/anime";
import { COMMUNITY_RELATION_TYPE, MAX_REASONS, MIN_SHARED_SELECTIONS } from "./config";

function listTitles(titles: string[]): string {
  const sorted = [...titles].sort((a, b) => a.localeCompare(b));
  if (sorted.length <= 1) return sorted[0] ?? "";
  const last = sorted[sorted.length - 1];
  return `${sorted.slice(0, -1).join(", ")} and ${last}`;
}

function titlesById(selected: Anime[]): Map<number, string> {
  return new Map(selected.map((anime) => [anime.id, anime.title]));
}

function connectedTitles(candidate: Candidate, titles: Map<number, string>): string[] {
  const connected = candidate.relations
    .map((relation) => titles.get(relation.sourceId))
    .filter((title): title is string => title !== undefined);
  return [...new Set(connected)];
}

function titlesSharing(
  label: string,
  selected: Anime[],
  labelsOf: (anime: Anime) => string[],
): string[] {
  const target = label.toLowerCase();
  return selected
    .filter((anime) => labelsOf(anime).some((item) => item.toLowerCase() === target))
    .map((anime) => anime.title);
}

function sharedLabels(
  candidateLabels: string[],
  selected: Anime[],
  labelsOf: (anime: Anime) => string[],
): string[] {
  return candidateLabels.filter(
    (label) => titlesSharing(label, selected, labelsOf).length >= MIN_SHARED_SELECTIONS,
  );
}

function linkReason(candidate: Candidate, titles: string[]): string | null {
  if (titles.length === 0) return null;
  const list = listTitles(titles);
  const hasCommunity = candidate.relations.some(
    (relation) => relation.relationType === COMMUNITY_RELATION_TYPE,
  );
  return hasCommunity
    ? `Fans of ${list} also went on to watch this.`
    : `Sits alongside ${list}, a neighbouring story rather than the next episode.`;
}

export function generateReasons(candidate: Candidate, selected: Anime[]): string[] {
  const reasons: string[] = [];
  const titles = titlesById(selected);

  const link = linkReason(candidate, connectedTitles(candidate, titles));
  if (link) reasons.push(link);

  const [genre] = sharedLabels(candidate.anime.genres, selected, (anime) => anime.genres);
  if (genre) {
    reasons.push(
      `The ${genre} streak runs through ${listTitles(titlesSharing(genre, selected, (anime) => anime.genres))}.`,
    );
  }

  const [theme] = sharedLabels(candidate.anime.themes, selected, (anime) => anime.themes);
  if (theme) {
    reasons.push(
      `It also carries the ${theme} of ${listTitles(titlesSharing(theme, selected, (anime) => anime.themes))}.`,
    );
  }

  if (reasons.length === 0) reasons.push("Closest match on genre, era and studio we could find.");
  return reasons.slice(0, MAX_REASONS);
}
