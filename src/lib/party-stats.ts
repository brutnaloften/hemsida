import { AGREEMENT_OUTCOMES, VERDICTS } from '@/schema/promise';
import type { AgreementOutcome, Evidence } from '@/schema/promise';
import { isAgreement } from '@/lib/timeline';

type VerdictValue = (typeof VERDICTS)[number];

export interface PartyPromise {
  id: string;
  title: string;
  area: string;
  parties: readonly string[];
  verdict: { value: VerdictValue };
}

/**
 * Promises attributed to a party. A promise listing several parties (e.g. the Tidö agreement,
 * made jointly by M, KD, L and SD) counts in full for each of them; it is not split.
 */
export function promisesForParty<T extends PartyPromise>(
  promises: readonly T[],
  party: string,
): T[] {
  return promises.filter((p) => p.parties.includes(party));
}

/** Count per verdict value, always containing every value (zero when absent). */
export function verdictCounts(
  promises: readonly Pick<PartyPromise, 'verdict'>[],
): Record<VerdictValue, number> {
  const counts = Object.fromEntries(VERDICTS.map((v) => [v, 0])) as Record<VerdictValue, number>;
  for (const p of promises) counts[p.verdict.value]++;
  return counts;
}

/** Promises with a real verdict: everything except `unassessed`, `not_assessable` and `expired` (the term ended without a verdict). */
export function assessedCount(promises: readonly Pick<PartyPromise, 'verdict'>[]): number {
  return promises.filter(
    (p) =>
      p.verdict.value !== 'unassessed' &&
      p.verdict.value !== 'not_assessable' &&
      p.verdict.value !== 'expired',
  ).length;
}

/**
 * Agreement points a party stands behind: promises whose own source is the agreement and that
 * list the party. `assessed` counts those with a real verdict.
 */
export function agreementPointStats(
  promises: readonly (Pick<PartyPromise, 'verdict' | 'parties'> & { source: { id: string } })[],
  agreementId: string,
  party: string,
): { points: number; assessed: number } {
  const mine = promises.filter((p) => p.source.id === agreementId && p.parties.includes(party));
  return { points: mine.length, assessed: assessedCount(mine) };
}

/**
 * Count of a party's promises per agreement outcome, always containing every outcome (zero when
 * absent). Only promises with an agreement evidence entry are counted (in practice manifesto
 * promises compared to the agreement); a promise with several agreement entries counts once,
 * under its most recent entry. `total` is the number of promises counted.
 */
export function agreementOutcomeCounts(promises: readonly { evidence: readonly Evidence[] }[]): {
  counts: Record<AgreementOutcome, number>;
  total: number;
} {
  const counts = Object.fromEntries(AGREEMENT_OUTCOMES.map((o) => [o, 0])) as Record<
    AgreementOutcome,
    number
  >;
  let total = 0;
  for (const p of promises) {
    const entries = p.evidence.filter(isAgreement);
    if (entries.length === 0) continue;
    const latest = entries.reduce((a, b) => (b.date > a.date ? b : a));
    counts[latest.outcome]++;
    total++;
  }
  return { counts, total };
}

type Counts = Record<VerdictValue, number>;

/** Display order for the bar and the texts: delivered first, then open, failed, neutral, unjudged. */
export const BAR_ORDER = [
  'fulfilled',
  'partially_fulfilled',
  'in_progress',
  'no_evidence',
  'unfulfilled',
  'abandoned',
  'broken',
  'not_assessable',
  'expired',
  'unassessed',
] as const satisfies readonly VerdictValue[];

/** Outcome phrase as [singular, plural]; "löfte" is neuter, so one promise is "uppfyllt". */
const OUTCOME_PHRASES: Record<VerdictValue, readonly [string, string]> = {
  fulfilled: ['uppfyllt', 'uppfyllda'],
  partially_fulfilled: ['delvis uppfyllt', 'delvis uppfyllda'],
  in_progress: ['pågår', 'pågår'],
  no_evidence: ['utan funna belägg', 'utan funna belägg'],
  unfulfilled: ['ej uppfyllt', 'ej uppfyllda'],
  abandoned: ['övergivet', 'övergivna'],
  broken: ['brutet', 'brutna'],
  not_assessable: ['ej bedömbart', 'ej bedömbara'],
  expired: ['löpte ut', 'löpte ut'],
  unassessed: ['inte bedömt', 'inte bedömda'],
};

/**
 * The term is complete for a set of promises when it has promises and none is `unassessed`. Data
 * driven, so a term that still has unjudged promises keeps the "inte bedömda" framing.
 */
export function isTermComplete(counts: Counts): boolean {
  return counts.unassessed === 0 && VERDICTS.some((v) => counts[v] > 0);
}

/** Bar segments in display order; zero counts are left out so no segment renders at 0% width. */
export function verdictBarSegments(counts: Counts): { verdict: VerdictValue; n: number }[] {
  return BAR_ORDER.filter((v) => counts[v] > 0).map((v) => ({ verdict: v, n: counts[v] }));
}

/** "5 uppfyllda, 3 pågår, 2 inte bedömda": outcome phrases in bar order, zero counts left out. */
export function outcomeBreakdownText(counts: Counts, skip: readonly VerdictValue[] = []): string {
  return BAR_ORDER.filter((v) => counts[v] > 0 && !skip.includes(v))
    .map(
      (v) => `${counts[v].toLocaleString('sv-SE')} ${OUTCOME_PHRASES[v][counts[v] === 1 ? 0 : 1]}`,
    )
    .join(', ');
}

/** Summary sentence under the verdict bar; leads with the outcome, zero counts are left out. */
export function verdictSummaryText(total: number, counts: Counts): string {
  const parts = outcomeBreakdownText(counts, ['unassessed', 'expired']);
  const lead = isTermComplete(counts)
    ? `Alla ${total} löften har granskats${parts ? `: ${parts}` : ''}.`
    : `${total} löften${parts ? `: ${parts}` : ''}.`;
  return [
    lead,
    counts.expired > 0
      ? `${counts.expired} löpte ut utan avgörande verdikt när mandatperioden tog slut.`
      : '',
    counts.unassessed > 0 ? `${counts.unassessed} löften är ännu inte bedömda av någon.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Screen-reader label for the verdict bar; zero counts are left out. */
export function verdictAriaLabel(total: number, counts: Counts): string {
  const lead = isTermComplete(counts) ? `Alla ${total} löften granskade` : `${total} löften`;
  const parts = outcomeBreakdownText(counts);
  return parts ? `${lead}: ${parts}` : lead;
}
