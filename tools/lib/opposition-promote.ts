/**
 * Promotion of manifesto candidates for a party outside the Tidö agreement (opposition).
 * Pure transformation: no agreement evidence is added, `vague` promises become `not_assessable`,
 * everything else stays as extracted (`unassessed`, `evidence: []`).
 */

import type { ManifestoEntry } from './manifesto-extract.ts';
import { VAGUE_REASONING } from './manifesto-promote.ts';
import { promiseSchema, type PromiseRecord } from './schema.ts';

export function promoteOpposition(
  entries: readonly ManifestoEntry[],
  party: PromiseRecord['parties'][number],
): PromiseRecord[] {
  return entries.map((e) => {
    if (e.link) throw new Error(`${e.promise.id} has a Tidö link; use the Tidö-linked promotion`);
    const p = structuredClone(e.promise);
    if (p.roles[party] !== 'opposition') throw new Error(`${p.id}: ${party} is not opposition`);
    if (p.evidence.length > 0) throw new Error(`${p.id}: opposition candidate has evidence`);
    if (p.type === 'vague') {
      p.verdict = {
        value: 'not_assessable',
        reasoning: VAGUE_REASONING,
        date: p.verdict.date,
        history: [],
      };
    }
    return promiseSchema.parse(p);
  });
}
