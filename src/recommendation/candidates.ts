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
  title: string;
  bySource: Map<number, CandidateRelation>;
}

export function buildCandidateSeeds(
  selected: Anime[],
  relations: RelatedAnime[][],
  recommendations: CommunityRecommendation[][],
): CandidateSeed[] {
  const selectedIds = new Set(selected.map((anime) => anime.id));
  const candidates = new Map<number, CandidateAccumulator>();

  const addCandidate = (id: number, title: string, relation: CandidateRelation): void => {
    const candidate = candidates.get(id) ?? { title, bySource: new Map<number, CandidateRelation>() };
    const existing = candidate.bySource.get(relation.sourceId);
    if (!existing || relation.weight > existing.weight) {
      candidate.bySource.set(relation.sourceId, relation);
    }
    candidates.set(id, candidate);
  };

  relations.flat().forEach((relation) => {
    const weight = ELIGIBLE_RELATION_WEIGHTS[relation.relationType];
    if (weight === undefined || relation.mediaType !== "anime" || selectedIds.has(relation.id)) return;
    addCandidate(relation.id, relation.title, {
      sourceId: relation.sourceId,
      relationType: relation.relationType,
      weight,
    });
  });

  recommendations.flat().forEach((recommendation) => {
    if (recommendation.mediaType !== "anime" || selectedIds.has(recommendation.id)) return;
    addCandidate(recommendation.id, recommendation.title, {
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
        title: candidate.title,
        relations: relationsForCandidate,
        sourceCount: relationsForCandidate.length,
        relationScore: relationsForCandidate.reduce((total, relation) => total + relation.weight, 0) / selected.length,
      };
    })
    .sort((a, b) => b.relationScore - a.relationScore || b.sourceCount - a.sourceCount || a.id - b.id)
    .slice(0, CANDIDATE_LIMIT);
}
