/** Aggregate cached request results into one score per (document, promise) (hemsida-vzn). */
import type { ResultCache } from './cache.ts';
import type { Plan } from './plan.ts';

export interface PairScore {
  /** Highest probability over the document's chunks. */
  score: number;
  best_chunk: number;
}
/** document id -> promise id -> score. */
export type ScoreResults = Record<string, Record<string, PairScore>>;

export function aggregateResults(
  plan: Plan,
  cache: ResultCache,
): { results: ScoreResults; missing: number } {
  const results: ScoreResults = {};
  let missing = 0;
  for (const req of plan.requests) {
    const entry = cache.get(req.key);
    if (!entry) {
      missing++;
      continue;
    }
    const doc = (results[req.document_id] ??= {});
    for (const [promiseId, score] of Object.entries(entry.answers)) {
      const prev = doc[promiseId];
      if (!prev || score > prev.score) doc[promiseId] = { score, best_chunk: req.chunk_index };
    }
  }
  return { results, missing };
}
