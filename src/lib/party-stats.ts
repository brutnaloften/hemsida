import { PARTIES, VERDICTS } from '@/schema/promise';

type Party = (typeof PARTIES)[number];
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

/** Parties that have at least one promise, in canonical PARTIES order. */
export function partiesWithPromises(promises: readonly PartyPromise[]): Party[] {
  return PARTIES.filter((party) => promises.some((p) => p.parties.includes(party)));
}

/** Count per verdict value, always containing every value (zero when absent). */
export function verdictCounts(
  promises: readonly Pick<PartyPromise, 'verdict'>[],
): Record<VerdictValue, number> {
  const counts = Object.fromEntries(VERDICTS.map((v) => [v, 0])) as Record<VerdictValue, number>;
  for (const p of promises) counts[p.verdict.value]++;
  return counts;
}

/** Promises with a real verdict: everything except `unassessed` and `not_assessable`. */
export function assessedCount(promises: readonly Pick<PartyPromise, 'verdict'>[]): number {
  return promises.filter(
    (p) => p.verdict.value !== 'unassessed' && p.verdict.value !== 'not_assessable',
  ).length;
}

export interface PromiseFilter {
  query?: string;
  area?: string;
  verdict?: VerdictValue | '';
}

/** Case-insensitive title match plus optional exact area and verdict. */
export function filterPromises<T extends Pick<PartyPromise, 'title' | 'area' | 'verdict'>>(
  promises: readonly T[],
  { query = '', area = '', verdict = '' }: PromiseFilter,
): T[] {
  const q = query.trim().toLocaleLowerCase('sv');
  return promises.filter(
    (p) =>
      (q === '' || p.title.toLocaleLowerCase('sv').includes(q)) &&
      (area === '' || p.area === area) &&
      (verdict === '' || p.verdict.value === verdict),
  );
}

/** Distinct areas with promise counts, sorted by name (Swedish collation). */
export function areaCounts(promises: readonly Pick<PartyPromise, 'area'>[]) {
  const map = new Map<string, number>();
  for (const p of promises) map.set(p.area, (map.get(p.area) ?? 0) + 1);
  return [...map]
    .map(([area, count]) => ({ area, count }))
    .sort((a, b) => a.area.localeCompare(b.area, 'sv'));
}

/** Sort by title (Swedish collation) without mutating the input. */
export function sortByTitle<T extends Pick<PartyPromise, 'title'>>(promises: readonly T[]): T[] {
  return [...promises].sort((a, b) => a.title.localeCompare(b.title, 'sv'));
}
