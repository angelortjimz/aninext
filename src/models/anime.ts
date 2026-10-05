export interface AnimeSearchResult {
  id: number;
  malId: number | null;
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
  mainStudios: string[];
  popularity: number;
  isAdult: boolean;
}

export interface RelatedAnime {
  id: number;
  title: string;
  mediaType: string;
  sourceId: number;
  relationType: string;
}

export interface CommunityRecommendation {
  id: number;
  title: string;
  mediaType: string;
  sourceId: number;
  rating: number;
}

export interface AnimeConnections {
  relations: RelatedAnime[];
  recommendations: CommunityRecommendation[];
}

export interface CandidateRelation {
  sourceId: number;
  relationType: string;
  weight: number;
}

export interface CandidateSeed {
  id: number;
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
  eraScore: number;
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
