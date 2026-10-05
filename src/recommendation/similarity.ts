import type { Anime } from "../models/anime";
import { ERA_SIMILARITY_YEARS, SCORING_WEIGHTS } from "./config";

export function jaccardSimilarity(a: string[], b: string[]): number {
  const aSet = new Set(a.map((value) => value.toLowerCase()));
  const bSet = new Set(b.map((value) => value.toLowerCase()));
  const union = new Set([...aSet, ...bSet]);
  if (union.size === 0) return 0;
  const intersection = [...aSet].filter((value) => bSet.has(value));
  return intersection.length / union.size;
}

export function typeSimilarity(a: Anime, b: Anime): number {
  return a.type !== null && b.type !== null && a.type === b.type ? 1 : 0;
}

export function eraSimilarity(a: Anime, b: Anime): number {
  if (a.year === null || b.year === null) return 0;
  return Math.max(0, 1 - Math.abs(a.year - b.year) / ERA_SIMILARITY_YEARS);
}

export interface MetadataScores {
  genre: number;
  theme: number;
  type: number;
  studio: number;
  era: number;
  total: number;
}

export function metadataSimilarity(a: Anime, b: Anime): MetadataScores {
  const genre = jaccardSimilarity(a.genres, b.genres);
  const theme = jaccardSimilarity(a.themes, b.themes);
  const type = typeSimilarity(a, b);
  const studio = jaccardSimilarity(a.mainStudios, b.mainStudios);
  const era = eraSimilarity(a, b);
  return {
    genre,
    theme,
    type,
    studio,
    era,
    total:
      genre * SCORING_WEIGHTS.genre +
      theme * SCORING_WEIGHTS.theme +
      type * SCORING_WEIGHTS.type +
      studio * SCORING_WEIGHTS.studio +
      era * SCORING_WEIGHTS.era,
  };
}
