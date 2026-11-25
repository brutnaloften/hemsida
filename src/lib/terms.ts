/**
 * Term helpers for the period bar and term-scoped URLs.
 *
 * Pure functions over the term records and a per-term promise count, so they
 * can be tested without Astro. Paths are relative to the site base (no leading
 * slash), e.g. `2022-2026/partier/m`.
 */
import { PARTIES } from '@/schema/promise';
import type { Term } from '@/schema/term';

export type PageKind = 'start' | 'partier' | 'party' | 'lofter' | 'agreement';

export type Role = NonNullable<Term['roles'][keyof Term['roles']]>;

export const ROLE_LABELS: Record<Role, string> = {
  government: 'Regeringsparti',
  support: 'Stödparti',
  opposition: 'Opposition',
};

export interface TermInfo {
  id: string;
  /** Number of promises collected for the term. */
  promiseCount: number;
  /** Hand-set flag from the term record: the term is fully collected and may be the default. */
  published?: boolean;
  /** True when the term has promises and none is `unassessed` (see `isTermComplete`). */
  complete?: boolean;
}

/** Term id of a promise, taken from its file path `.../<term>/promises/<file>.json`. */
export function termOfFilePath(filePath: string): string | undefined {
  return /(?:^|\/)(\d{4}-\d{4})\/promises\//.exec(filePath)?.[1];
}

/** Terms sorted oldest to newest. */
export function sortTerms<T extends { id: string }>(terms: readonly T[]): T[] {
  return [...terms].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * The default term: the latest one flagged `published` in its term record. If none is flagged,
 * falls back to the latest term that has promises, then to the latest term overall.
 */
export function defaultTerm(terms: readonly TermInfo[]): string {
  const sorted = sortTerms(terms);
  const pick =
    sorted.filter((t) => t.published).at(-1) ??
    sorted.filter((t) => t.promiseCount > 0).at(-1) ??
    sorted.at(-1);
  if (!pick) throw new Error('No terms defined');
  return pick.id;
}

/** Data status subtitle for overview pages. */
export function dataStatusLabel(info: TermInfo): string {
  if (info.promiseCount === 0) return 'Insamling pågår';
  return info.complete ? 'Avslutad, alla löften granskade' : 'Löften insamlade';
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

/**
 * Hrefs of the term-dependent main navigation links: the page's own term, or the default term on
 * pages that have none.
 */
export function navTermHrefs(
  base: string,
  pageTerm: string | undefined,
  defaultTermId: string,
): { partier: string; lofter: string } {
  const term = pageTerm ?? defaultTermId;
  return {
    partier: `${base}${termPagePath('partier', term)}`,
    lofter: `${base}${termPagePath('lofter', term)}`,
  };
}

/** Role of a party at the start of a term, when the record lists it. */
export function partyRole(term: Pick<Term, 'roles'>, party: string): Role | undefined {
  return term.roles[party as keyof Term['roles']];
}

/**
 * The parties of a term with their role. Normally the term record's roles (its order). While
 * `rolesPending` there are no roles: the parties are the ones named by the term's promises, in
 * the canonical party order, each without a role.
 */
export function termParties(
  term: Pick<Term, 'roles' | 'rolesPending'>,
  promises: readonly { parties: readonly string[] }[],
): { party: string; role: Role | undefined }[] {
  if (!term.rolesPending) {
    return (Object.entries(term.roles) as [string, Role][]).map(([party, role]) => ({
      party,
      role,
    }));
  }
  const named = new Set(promises.flatMap((p) => p.parties));
  return PARTIES.filter((p) => named.has(p)).map((party) => ({ party, role: undefined }));
}
