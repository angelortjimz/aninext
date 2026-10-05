export const ELIGIBLE_RELATION_WEIGHTS: Readonly<Record<string, number>> = {
  SIDE_STORY: 0.8,
  SPIN_OFF: 0.7,
  ALTERNATIVE: 0.6,
  SAME_UNIVERSE: 0.5,
  OTHER: 0.4,
};

export const COMMUNITY_RELATION_TYPE = "COMMUNITY";
export const COMMUNITY_WEIGHT = 0.5;

export const SCORING_WEIGHTS = {
  relation: 0.4,
  metadata: 0.6,
  genre: 0.45,
  theme: 0.25,
  type: 0.1,
  studio: 0.1,
  era: 0.1,
} as const;

export const ERA_SIMILARITY_YEARS = 10;

export const CANDIDATE_LIMIT = 24;
