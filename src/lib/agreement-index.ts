import type { Evidence, RiksdagEvidence } from '@/schema/promise';
import { isAgreement, isRiksdag, orderTimeline } from '@/lib/timeline';

interface LinkablePromise {
  id: string;
  title: string;
  evidence: readonly Evidence[];
}

/**
 * Reverse index: agreement promise id -> promises (e.g. manifesto promises) whose agreement
 * entries link to it. Derived at build time; the agreement's own files are never edited.
 * Each linking promise is listed once per target, sorted by title.
 */
export function buildReverseIndex<T extends LinkablePromise>(
  promises: readonly T[],
): Map<string, T[]> {
  const index = new Map<string, T[]>();
  for (const p of promises) {
    for (const e of p.evidence) {
      if (!isAgreement(e)) continue;
      for (const id of e.promises) {
        const list = index.get(id) ?? [];
        if (!list.includes(p)) list.push(p);
        index.set(id, list);
      }
    }
  }
  for (const list of index.values()) list.sort((a, b) => a.title.localeCompare(b.title, 'sv'));
  return index;
}

export interface LinkedTimeline {
  id: string;
  title: string;
  evidence: RiksdagEvidence[];
}

/**
 * Riksdag evidence of the promises a promise's agreement entries link to, one group per linked
 * promise in link order. Linked promises without Riksdag evidence are omitted, so an empty
 * result means the section should be hidden.
 */
export function linkedRiksdagTimelines(
  promise: LinkablePromise,
  byId: ReadonlyMap<string, LinkablePromise>,
): LinkedTimeline[] {
  const seen = new Set<string>();
  const out: LinkedTimeline[] = [];
  for (const e of promise.evidence) {
    if (!isAgreement(e)) continue;
    for (const id of e.promises) {
      const target = byId.get(id);
      if (!target || seen.has(id)) continue;
      seen.add(id);
      const evidence = orderTimeline(target.evidence).filter(isRiksdag);
      if (evidence.length > 0) out.push({ id, title: target.title, evidence });
    }
  }
  return out;
}
