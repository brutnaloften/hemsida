/**
 * Filter state of the Löften page and its (de)serialisation to the URL query string.
 * Pure functions so they can be tested without a DOM. Params: q, parti, omrade,
 * bedomning, overenskommelse (repeatable where several values are allowed).
 */
import { AGREEMENT_OUTCOMES, PARTIES, VERDICTS } from '@/schema/promise';
import type { AgreementOutcome } from '@/schema/promise';
import { AREAS } from '@/schema/areas';

type Verdict = (typeof VERDICTS)[number];

export interface LofterFilters {
  q: string;
  parties: string[];
  area: string;
  verdicts: Verdict[];
  outcomes: AgreementOutcome[];
}

export const EMPTY_FILTERS: LofterFilters = {
  q: '',
  parties: [],
  area: '',
  verdicts: [],
  outcomes: [],
};

export interface FilterableRow {
  parties: readonly string[];
  area: string;
  verdict: Verdict;
  outcome?: AgreementOutcome;
}

/** Keep only values from the allowed list, in the list's order; unknown values are dropped. */
function pick<T extends string>(values: string[], allowed: readonly T[]): T[] {
  return allowed.filter((a) => values.includes(a));
}

/** Parse a query string; unknown or invalid values are ignored so stale links still work. */
export function parseFilters(search: string): LofterFilters {
  const p = new URLSearchParams(search);
  const area = p.get('omrade') ?? '';
  return {
    q: p.get('q') ?? '',
    parties: pick(p.getAll('parti'), PARTIES),
    area: (AREAS as readonly string[]).includes(area) ? area : '',
    verdicts: pick(p.getAll('bedomning'), VERDICTS),
    outcomes: pick(p.getAll('overenskommelse'), AGREEMENT_OUTCOMES),
  };
}

/** Serialise to a query string (with leading `?`, or empty when no filter is set). */
export function serializeFilters(f: LofterFilters): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set('q', f.q.trim());
  for (const v of f.parties) p.append('parti', v);
  if (f.area) p.set('omrade', f.area);
  for (const v of f.verdicts) p.append('bedomning', v);
  for (const v of f.outcomes) p.append('overenskommelse', v);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function hasActiveFilters(f: LofterFilters): boolean {
  return (
    f.q.trim() !== '' ||
    f.parties.length > 0 ||
    f.area !== '' ||
    f.verdicts.length > 0 ||
    f.outcomes.length > 0
  );
}

/** Non-text filters; each group is OR within itself and AND across groups. */
export function matchesFilters(row: FilterableRow, f: LofterFilters): boolean {
  return (
    (f.parties.length === 0 || row.parties.some((p) => f.parties.includes(p))) &&
    (f.area === '' || row.area === f.area) &&
    (f.verdicts.length === 0 || f.verdicts.includes(row.verdict)) &&
    (f.outcomes.length === 0 || (row.outcome !== undefined && f.outcomes.includes(row.outcome)))
  );
}

/** Toggle a value in a list, keeping the list free of duplicates. */
export function toggleValue<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}
