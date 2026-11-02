/**
 * Term helpers for the period bar and term-scoped URLs.
 *
 * Pure functions over the term records and a per-term promise count, so they
 * can be tested without Astro. Paths are relative to the site base (no leading
 * slash), e.g. `2022-2026/partier/m`.
 */
import type { Term } from '@/schema/term';

export type PageKind = 'start' | 'partier' | 'party' | 'lofter' | 'agreement';

export type Role = Term['roles'][keyof Term['roles']];

export const ROLE_LABELS: Record<Role, string> = {
  government: 'Regeringsparti',
  support: 'Stödparti',
  opposition: 'Opposition',
};

export interface TermInfo {
  id: string;
  /** Number of promises collected for the term. */
  promiseCount: number;
}

/** Term id of a promise, taken from its file path `.../<term>/promises/<file>.json`. */
export function termOfFilePath(filePath: string): string | undefined {
  return /(?:^|\/)(\d{4}-\d{4})\/promises\//.exec(filePath)?.[1];
}

/** Terms sorted oldest to newest. */
export function sortTerms<T extends { id: string }>(terms: readonly T[]): T[] {
  return [...terms].sort((a, b) => a.id.localeCompare(b.id));
}

/** Latest term that has promises; falls back to the latest term overall. */
export function defaultTerm(terms: readonly TermInfo[]): string {
  const sorted = sortTerms(terms);
  const withData = sorted.filter((t) => t.promiseCount > 0);
  const pick = withData.at(-1) ?? sorted.at(-1);
  if (!pick) throw new Error('No terms defined');
  return pick.id;
}

/** Data status subtitle for overview pages. */
export function dataStatusLabel(info: TermInfo): string {
  return info.promiseCount > 0 ? 'Löften insamlade' : 'Insamling pågår';
}

/** Site-relative path of a term-dependent page. */
export function termPagePath(kind: PageKind, term: string, param?: string): string {
  switch (kind) {
    case 'start':
      return `${term}/`;
    case 'partier':
      return `${term}/partier`;
    case 'party':
      return `${term}/partier/${(param ?? '').toLowerCase()}`;
    case 'lofter':
      return `${term}/lofter`;
    case 'agreement':
      return `${term}/overenskommelse/${param ?? ''}`;
  }
}

/** Role of a party at the start of a term, when the record lists it. */
export function partyRole(term: Pick<Term, 'roles'>, party: string): Role | undefined {
  return term.roles[party as keyof Term['roles']];
}
