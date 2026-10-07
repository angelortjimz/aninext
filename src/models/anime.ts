export interface AnimeSearchResult {
  id: number;
  title: string;
  imageUrl: string | null;
  type: string | null;
  year: number | null;
  episodes: number | null;
}

export interface Anime extends AnimeSearchResult {
  genres: string[];
  themes: string[];
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
  relations: CandidateRelation[];
  sourceCount: number;
  relationScore: number;
}

export interface Candidate extends CandidateSeed {
  anime: Anime;
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
