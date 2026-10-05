import type { Anime, CandidateRelation, CandidateSeed, RelatedAnime } from "../models/anime";
import { CANDIDATE_LIMIT, ELIGIBLE_RELATION_WEIGHTS } from "./config";

function weightFor(relationType: string): number | null {
  return ELIGIBLE_RELATION_WEIGHTS[relationType] ?? null;
}

export function buildCandidateSeeds(selected: Anime[], relations: RelatedAnime[][]): CandidateSeed[] {
  const selectedIds = new Set(selected.map((anime) => anime.malId));
  const candidates = new Map<number, { title: string; bySource: Map<number, CandidateRelation> }>();

  relations.flat().forEach((relation) => {
    const weight = weightFor(relation.relationType);
    if (relation.mediaType !== "anime" || selectedIds.has(relation.malId) || weight === null) return;
    const candidate = candidates.get(relation.malId) ?? { title: relation.title, bySource: new Map() };
    const existing = candidate.bySource.get(relation.sourceMalId);
    if (!existing || weight > existing.weight) {
      candidate.bySource.set(relation.sourceMalId, { sourceMalId: relation.sourceMalId, relationType: relation.relationType, weight });
    }
    candidates.set(relation.malId, candidate);
  });

  return [...candidates.entries()]
    .map(([malId, candidate]) => {
      const relationsForCandidate = [...candidate.bySource.values()];
      return {
        malId,
        title: candidate.title,
        relations: relationsForCandidate,
        sourceCount: relationsForCandidate.length,
        relationScore: relationsForCandidate.reduce((total, relation) => total + relation.weight, 0) / selected.length,
      };
    })
    .sort((a, b) => b.relationScore - a.relationScore || b.sourceCount - a.sourceCount || a.malId - b.malId)
    .slice(0, CANDIDATE_LIMIT);
}
