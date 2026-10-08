import type { Anime, CommunityRecommendation, RelatedAnime } from "@/models/anime";

export const anime = (id: number, overrides: Partial<Anime> = {}): Anime => ({
  id,
  title: `Anime ${id}`,
  nativeTitle: null,
  imageUrl: null,
  type: "TV",
  year: 2020,
  episodes: 12,
  genres: ["Drama", "Mystery"],
  themes: ["Psychological"],
  mainStudios: ["Studio A"],
  popularity: 100,
  isAdult: false,
  ...overrides,
});

export const selectedThree = (): Anime[] => [anime(1), anime(2), anime(3)];

export const relation = (
  sourceId: number,
  id: number,
  relationType: string,
  mediaType = "anime",
): RelatedAnime => ({
  sourceId,
  id,
  relationType,
  mediaType,
  title: `Anime ${id}`,
});

export const communityRecommendation = (
  sourceId: number,
  id: number,
  rating = 10,
): CommunityRecommendation => ({
  sourceId,
  id,
  rating,
  mediaType: "anime",
  title: `Anime ${id}`,
});

export function reversed<T>(items: T[]): T[] {
  return [...items].reverse();
}
