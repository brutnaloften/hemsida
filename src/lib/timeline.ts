import type { AgreementEvidence, Evidence, RiksdagEvidence } from '@/schema/promise';

/**
 * Orders evidence for the detail page timeline: agreement entries first (the agreement precedes
 * the Riksdag process it triggers), then Riksdag documents oldest to newest. Sorting is stable
 * and does not mutate the input.
 */
export function orderTimeline(evidence: readonly Evidence[]): Evidence[] {
  const rank = (e: Evidence) => (e.kind === 'agreement' ? 0 : 1);
  return [...evidence].sort((a, b) => rank(a) - rank(b) || a.date.localeCompare(b.date));
}

export function isAgreement(e: Evidence): e is AgreementEvidence {
  return e.kind === 'agreement';
}

export function isRiksdag(e: Evidence): e is RiksdagEvidence {
  return e.kind !== 'agreement';
}

/** Site-relative path (resolved against <base href>) of a promise's detail page. */
export function promisePath(id: string): string {
  return `lofte/${id}`;
}
