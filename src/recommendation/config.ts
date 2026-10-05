export const ELIGIBLE_RELATION_WEIGHTS: Readonly<Record<string, number>> = {
  "Side Story": 0.8,
  "Spin-off": 0.7,
  "Alternative Version": 0.6,
  Other: 0.4,
};

export const SCORING_WEIGHTS = {
  relation: 0.4,
  metadata: 0.6,
  genre: 0.5,
  theme: 0.3,
  type: 0.1,
  studio: 0.1,
} as const;

export const CANDIDATE_LIMIT = 24;
export const DETAIL_CONCURRENCY = 2;
