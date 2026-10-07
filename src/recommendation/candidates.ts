import type {
  Anime,
  CandidateRelation,
  CandidateSeed,
  CommunityRecommendation,
  RelatedAnime,
} from "../models/anime";
import {
  COMMUNITY_RELATION_TYPE,
  COMMUNITY_WEIGHT,
  CANDIDATE_LIMIT,
  ELIGIBLE_RELATION_WEIGHTS,
} from "./config";

interface CandidateAccumulator {
  bySource: Map<number, CandidateRelation>;
}

export function buildCandidateSeeds(
  selected: Anime[],
  relations: RelatedAnime[][],
  recommendations: CommunityRecommendation[][],
): CandidateSeed[] {
  const selectedIds = new Set(selected.map((anime) => anime.id));
  const candidates = new Map<number, CandidateAccumulator>();

  const addCandidate = (id: number, relation: CandidateRelation): void => {
    const existing = candidates.get(id);
    if (!existing) {
      candidates.set(id, { bySource: new Map([[relation.sourceId, relation]]) });
      return;
    }
    const current = existing.bySource.get(relation.sourceId);
    if (!current || relation.weight > current.weight) {
      existing.bySource.set(relation.sourceId, relation);
    }
  };

  relations.flat().forEach((relation) => {
    const weight = ELIGIBLE_RELATION_WEIGHTS[relation.relationType];
    if (weight === undefined || relation.mediaType !== "anime" || selectedIds.has(relation.id)) return;
    addCandidate(relation.id, {
      sourceId: relation.sourceId,
      relationType: relation.relationType,
      weight,
    });
  });

  recommendations.flat().forEach((recommendation) => {
    if (recommendation.mediaType !== "anime" || selectedIds.has(recommendation.id)) return;
    addCandidate(recommendation.id, {
      sourceId: recommendation.sourceId,
      relationType: COMMUNITY_RELATION_TYPE,
      weight: COMMUNITY_WEIGHT,
    });
  });

  return [...candidates.entries()]
    .map(([id, candidate]) => {
      const relationsForCandidate = [...candidate.bySource.values()];
      return {
        id,
        relations: relationsForCandidate,
        sourceCount: relationsForCandidate.length,
        relationScore: relationsForCandidate.reduce((total, relation) => total + relation.weight, 0) / selected.length,
      };
    })
    .sort((a, b) => b.relationScore - a.relationScore || b.sourceCount - a.sourceCount || a.id - b.id)
    .slice(0, CANDIDATE_LIMIT);
}
