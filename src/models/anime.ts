export interface AnimeSearchResult {
  malId: number;
  title: string;
  imageUrl: string | null;
  type: string | null;
  year: number | null;
  episodes: number | null;
}

export interface Anime extends AnimeSearchResult {
  genres: string[];
  themes: string[];
  studios: string[];
  isAdult: boolean;
}

export interface RelatedAnime {
  malId: number;
  title: string;
  mediaType: string;
  sourceMalId: number;
  relationType: string;
}

export interface CandidateRelation {
  sourceMalId: number;
  relationType: string;
  weight: number;
}

export interface CandidateSeed {
  malId: number;
  title: string;
  relations: CandidateRelation[];
  sourceCount: number;
  relationScore: number;
}

export interface Candidate extends CandidateSeed {
  anime: Anime;
  genreScore: number;
  themeScore: number;
  typeScore: number;
  studioScore: number;
  metadataScore: number;
  finalScore: number;
  reasons: string[];
}

export interface Recommendation {
  anime: Anime;
  reasons: string[];
  basedOn: Anime[];
}

export type RecommendationResult =
  | { kind: "recommendation"; recommendation: Recommendation }
  | { kind: "no-match" };
