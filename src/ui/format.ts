import type { AnimeSearchResult } from "@/models/anime";

export function metaLine(item: AnimeSearchResult): string {
  return [item.year, item.type, item.episodes ? `${item.episodes} episodes` : null]
    .filter(Boolean)
    .join(" - ");
}

export function studioLine(studios: string[]): string {
  return studios.join(", ");
}

export function anilistUrl(id: number): string {
  return `https://anilist.co/anime/${encodeURIComponent(String(id))}`;
}
