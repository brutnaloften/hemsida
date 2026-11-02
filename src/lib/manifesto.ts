/**
 * Shared by the Start page and the Partier table so the two always count the same thing:
 * only manifesto promises ("vallöften") count per party. Agreement points and mid-term
 * pledges (e.g. speeches) are tracked elsewhere.
 */
import type { AgreementOutcome } from '@/schema/promise';

/** Ids of the sources of kind `manifesto`. */
export function manifestoSourceIds(sources: readonly { id: string; kind: string }[]): Set<string> {
  return new Set(sources.filter((s) => s.kind === 'manifesto').map((s) => s.id));
}

/** Keeps only promises whose own source is a manifesto. */
export function manifestoOnly<T extends { source: { id: string } }>(
  promises: readonly T[],
  sources: readonly { id: string; kind: string }[],
): T[] {
  const ids = manifestoSourceIds(sources);
  return promises.filter((p) => ids.has(p.source.id));
}

/** Swedish label per outcome in a count line, shared by Start and Partier. */
export const OUTCOME_WORDS: Record<AgreementOutcome, string> = {
  included: 'med',
  strengthened: 'skärpta',
  weakened: 'urvattnade',
  contradicted: 'motsägs',
  not_addressed: 'saknas',
};

/** Count line such as "57 med · 67 urvattnade · 3 motsägs"; zero counts are left out. */
export function outcomeCountsText(counts: Record<AgreementOutcome, number>): string {
  return (Object.keys(OUTCOME_WORDS) as AgreementOutcome[])
    .filter((o) => counts[o] > 0)
    .map((o) => `${counts[o]} ${OUTCOME_WORDS[o]}`)
    .join(' · ');
}
