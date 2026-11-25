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

/** Summary sentence under the verdict bar; zero counts are left out. */
export function verdictSummaryText(total: number, assessed: number, counts: Counts): string {
  return [
    `${total} löften, varav ${assessed} bedömda.`,
    counts.unassessed > 0 ? `${counts.unassessed} löften är ännu inte bedömda av någon.` : '',
    counts.not_assessable > 0
      ? `${counts.not_assessable} är ej bedömbara (till exempel vaga löften).`
      : '',
    counts.expired > 0
      ? `${counts.expired} löpte ut utan avgörande verdikt när mandatperioden tog slut.`
      : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Screen-reader label for the verdict bar; zero counts are left out. */
export function verdictAriaLabel(total: number, assessed: number, counts: Counts): string {
  return [
    `${assessed} av ${total} löften är bedömda`,
    counts.not_assessable > 0 ? `${counts.not_assessable} ej bedömbara` : '',
    counts.expired > 0 ? `${counts.expired} löpte ut` : '',
    counts.unassessed > 0 ? `${counts.unassessed} inte bedömda` : '',
  ]
    .filter(Boolean)
    .join(', ');
}
