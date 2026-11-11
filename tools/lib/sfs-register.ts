/**
 * Parsers and store schema for Regeringskansliets SFS-register (rkrattsbaser.gov.se/sfsr).
 *
 * The register is plain server-rendered HTML with no JSON API. Each base act (grundförfattning)
 * page lists its amendments with Rubrik, Omfattning, Ikraft and Förarbeten; that last field is the
 * only machine-readable link from a proposition to the law it produced. See docs/riksdag-api.md
 * ("SFS register").
 */

import { z } from 'zod/v4';
import { decodeEntities } from './riksdag-text.ts';

export const SFSR_BASE_URL = 'https://rkrattsbaser.gov.se';

export function searchUrl(rm: string, nr: string): string {
  return `${SFSR_BASE_URL}/sfsr/adv?fritext=${rm}:${nr}`;
}

export function registerUrl(sfs: string): string {
  return `${SFSR_BASE_URL}/sfsr?bet=${sfs}`;
}

/** Official per-act page, `2025:625` -> `.../doc/2025625.html`. Covers 2018 and later. */
export function sfsDocUrl(sfs: string): string {
  return `https://svenskforfattningssamling.se/doc/${sfs.replace(':', '')}.html`;
}

/** `2025:625` -> `sfs-2025-625`, the dok_id pattern data.riksdagen.se uses for sfs documents. */
export function sfsKey(sfs: string): string {
  return `sfs-${sfs.replace(':', '-')}`;
}

export interface Forarbeten {
  props: string[];
  bets: string[];
  rskr: string[];
  other: string[];
}

export interface RegisterEntry {
  sfs: string;
  title: string;
  /** Only amendments have an Omfattning (which provisions change). */
  omfattning: string | null;
  /** Earliest in-force date as YYYY-MM-DD; null when none is given. */
  ikraft: string | null;
  forarbeten: Forarbeten;
}

export interface RegisterPage {
  base: RegisterEntry;
  amendments: RegisterEntry[];
}

function clean(s: string): string {
  const named = s
    .replace(/&eacute;/g, 'é')
    .replace(/&aring;/g, 'å')
    .replace(/&auml;/g, 'ä')
    .replace(/&ouml;/g, 'ö');
  return decodeEntities(named).replace(/\s+/g, ' ').trim();
}

/** Base act SFS numbers of an advanced-search result page (`SFS-nummer: 2010:800`). */
export function parseSearchResults(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/SFS-nummer:\s*(\d{4}:\d+)/g)) {
    if (!out.includes(m[1]!)) out.push(m[1]!);
  }
  return out;
}

/** Hits per page of `/sfsr/adv`. */
export const SEARCH_PAGE_SIZE = 30;

export type SearchPage =
  | { kind: 'none' }
  /** Exactly one hit: the register redirects straight to that act's register page. */
  | { kind: 'direct' }
  | { kind: 'list'; total: number; bases: string[] };

/**
 * Classify the first page of an advanced search: no hits, a single hit shown as the register page
 * itself (marker `SFS-nummer ·`, no `Totalt`), or a list with `Totalt N träffar` (30 per page, the
 * rest behind `&page=N`). Anything else throws, so a markup change never silently loses hits.
 */
export function classifySearchPage(html: string): SearchPage {
  if (html.includes('Inga träffar')) return { kind: 'none' };
  const total = /Totalt\s*<strong>(\d+)<\/strong>\s*tr/.exec(html)?.[1];
  if (total) {
    const bases = parseSearchResults(html);
    if (bases.length === 0 || bases.length > SEARCH_PAGE_SIZE) {
      throw new Error(`search page lists ${bases.length} hits for a total of ${total}`);
    }
    return { kind: 'list', total: Number(total), bases };
  }
  if (/SFS-nummer\s*·/.test(html.replace(/<[^>]+>/g, ' '))) return { kind: 'direct' };
  throw new Error('unrecognised SFS register search page (no Totalt, no register page, no hits)');
}

export interface SearchHits {
  /** Base acts to fetch a register page for. */
  bases: string[];
  /** Register pages the search itself returned (a single hit, alone or as the last page). */
  direct: RegisterPage[];
  total: number;
}

/**
 * All hits of a search given its first page and a way to fetch page `n`. A search with one hit,
 * and a last page with one remaining hit, come back as that act's register page and not as a list.
 * Throws when the listed hits do not add up to the reported total.
 */
export async function collectSearchHits(
  firstHtml: string,
  fetchPage: (n: number) => Promise<string>,
): Promise<SearchHits> {
  const first = classifySearchPage(firstHtml);
  if (first.kind === 'none') return { bases: [], direct: [], total: 0 };
  if (first.kind === 'direct')
    return { bases: [], direct: [parseRegisterPage(firstHtml)], total: 1 };
  const bases = [...first.bases];
  const direct: RegisterPage[] = [];
  const pageCount = Math.ceil(first.total / SEARCH_PAGE_SIZE);
  for (let n = 2; n <= pageCount; n++) {
    const html = await fetchPage(n);
    const more = classifySearchPage(html);
    if (more.kind === 'direct') direct.push(parseRegisterPage(html));
    else if (more.kind === 'list') {
      for (const b of more.bases) if (!bases.includes(b)) bases.push(b);
    } else throw new Error(`page ${n} of ${pageCount} has no hits`);
  }
  if (bases.length + direct.length !== first.total) {
    throw new Error(
      `search reports ${first.total} hits but ${bases.length + direct.length} were listed`,
    );
  }
  return { bases, direct, total: first.total };
}

/** URL of result page `page` (1-based) of a search. */
export function searchPageUrl(rm: string, nr: string, page: number): string {
  return page <= 1 ? searchUrl(rm, nr) : `${searchUrl(rm, nr)}&page=${page}`;
}

const REF =
  /\b([Pp]rop|[Bb]et|[Rr]skr)\b\.?|(\d{4}\/\d{2})(?::\s*|(?=[A-ZÅÄÖ]))([A-Za-zÅÄÖåäö]*\d+)|(?<=(?:\d{4}\/\d{2}:|\boch\s+)[A-Za-zÅÄÖåäö]*\d+\s*)(?:\boch|,)\s+((?:[A-ZÅÄÖ][A-Za-zåäö]*)?\d+)\b(?![/:])/g;

/**
 * Split a Förarbeten line into propositions, betänkanden and riksdagsskrivelser. Each reference
 * belongs to the keyword in front of it, so `Prop. 2024/25:143 och prop. 2024/25:160` yields two
 * props and `rskr. 2024/25:160` is never a prop. The register is hand-typed, so the parser also
 * accepts a keyword without a dot (`bet 2024/25:NU6`), the typo `rop.`, a shorthand continuation
 * in the same riksmöte (`Prop. 2004/05:170 och 172`), and a leading reference with no keyword
 * (`2023/24:164 och prop. 2023/24:166`), which is the proposition whose `Prop.` was dropped.
 * Everything that is not such a reference (EU directives, `utg.omr.` notes) goes to `other`.
 */
export function parseForarbeten(raw: string): Forarbeten {
  const text = clean(raw).replace(/\brop\./g, 'Prop.');
  const result: Forarbeten = { props: [], bets: [], rskr: [], other: [] };
  const target = { prop: result.props, bet: result.bets, rskr: result.rskr } as const;
  let current: keyof typeof target | null = null;
  let rm: string | null = null;
  const add = (kind: keyof typeof target, ref: string) => {
    if (!target[kind].includes(ref)) target[kind].push(ref);
  };
  for (const m of text.matchAll(REF)) {
    if (m[1]) {
      current = m[1].toLowerCase() as keyof typeof target;
    } else if (m[2]) {
      rm = m[2];
      add(current ?? 'prop', `${m[2]}:${m[3]}`);
    } else if (m[4] && current && rm) {
      add(current, `${rm}:${m[4]}`);
    }
  }
  result.other = text
    .split(/,| och /)
    .map((s) => s.trim().replace(/\.$/, ''))
    .filter(
      (s) =>
        s &&
        !/^(prop|bet|rskr)\b\.?\s*([A-Za-zÅÄÖ]*\d|\d{4}\/\d{2})/i.test(s) &&
        !/^\d{4}\/\d{2}[:A-ZÅÄÖ]/.test(s) &&
        !/^(?:[A-ZÅÄÖ][A-Za-zåäö]*)?\d+$/.test(s) &&
        !/^(prop|bet|rskr)\.?$/i.test(s),
    );
  return result;
}

/** Earliest YYYY-MM-DD in an Ikraft value (`2026-01-15 överg.best.`), or null. */
export function parseIkraft(raw: string): string | null {
  const dates = [...raw.matchAll(/\d{4}-\d{2}-\d{2}/g)].map((m) => m[0]).sort();
  return dates[0] ?? null;
}

function fields(block: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of block.matchAll(/<span class="bold">([^<:]+):<\/span>([\s\S]*?)<\/div>/g)) {
    const key = clean(m[1]!);
    if (!out.has(key)) out.set(key, clean(m[2]!.replace(/<[^>]+>/g, ' ')));
  }
  return out;
}

function entry(sfs: string, title: string, block: string): RegisterEntry {
  const f = fields(block);
  return {
    sfs,
    title,
    omfattning: f.get('Omfattning') ?? null,
    ikraft: parseIkraft(f.get('Ikraft') ?? ''),
    forarbeten: parseForarbeten(f.get('Förarbeten') ?? ''),
  };
}

/** Parse a `/sfsr?bet=<sfs>` page: the base act header plus every amendment box. */
export function parseRegisterPage(html: string): RegisterPage {
  const start = html.indexOf('search-results-content');
  if (start < 0) throw new Error('not an SFS register page (no search-results-content)');
  const body = html.slice(start);
  const parts = body.split('result-inner-sub-box-container');
  const head = parts[0]!;
  const sfsMatch = /SFS-nummer\s*·\s*(\d{4}:\d+)/.exec(clean(head.replace(/<[^>]+>/g, ' ')));
  const titleMatch = /<span class="bold">([^<]*\(\d{4}:\d+\)[^<]*)<\/span>/.exec(head);
  if (!sfsMatch || !titleMatch) throw new Error('SFS register page without a base act header');
  const base = entry(sfsMatch[1]!, clean(titleMatch[1]!), head);
  const amendments: RegisterEntry[] = [];
  for (const part of parts.slice(1)) {
    const header =
      /result-inner-sub-box-header">\s*(?:Ändring|&#196;ndring|[^,<]*),\s*SFS\s*(\d{4}:\d+)/.exec(
        part,
      );
    if (!header) continue;
    const f = fields(part);
    amendments.push(entry(header[1]!, f.get('Rubrik') ?? '', part));
  }
  return { base, amendments };
}

// ---- store ----

export const sfsLawSchema = z.object({
  sfs: z.string().regex(/^\d{4}:\d+$/),
  title: z.string(),
  /** The base act this law amends; its own number when the law is a base act. */
  base_sfs: z.string(),
  omfattning: z.string().nullable(),
  ikraft: z.string().nullable(),
  /** Store dok_ids of the propositions cited in Förarbeten that exist in the riksdag store. */
  props: z.array(z.string()),
  bets: z.array(z.string()),
  rskr: z.array(z.string()),
  url: z.string(),
});
export type SfsLaw = z.infer<typeof sfsLawSchema>;

export const sfsStoreSchema = z.object({
  version: z.literal(1),
  term: z.string(),
  fetchedAt: z.string(),
  laws: z.record(z.string(), sfsLawSchema),
  byProp: z.record(z.string(), z.array(z.string())),
});
export type SfsStore = z.infer<typeof sfsStoreSchema>;

/**
 * Keep the entries of a register page that cite exactly `prop` (e.g. `2024/25:160`) as a
 * proposition, as law records. `resolveProp` maps a `rm:nr` reference to a store dok_id.
 */
export function matchingLaws(
  page: RegisterPage,
  prop: string,
  resolveProp: (ref: string) => string | undefined,
): SfsLaw[] {
  const out: SfsLaw[] = [];
  for (const e of [page.base, ...page.amendments]) {
    if (!e.forarbeten.props.includes(prop)) continue;
    out.push({
      sfs: e.sfs,
      title: e.title,
      base_sfs: page.base.sfs,
      omfattning: e.omfattning,
      ikraft: e.ikraft,
      props: e.forarbeten.props.map(resolveProp).filter((x): x is string => !!x),
      bets: e.forarbeten.bets,
      rskr: e.forarbeten.rskr,
      url: sfsDocUrl(e.sfs),
    });
  }
  return out;
}

/**
 * Merge two records of the same law (an act can appear on several register pages: its own, and
 * the "upph." entry on the page of the act it replaced). The record where the act is its own base
 * wins; empty fields (title, in-force date) are filled from the other, and the
 * proposition, bet and rskr lists are unioned.
 */
export function mergeLaw(a: SfsLaw, b: SfsLaw): SfsLaw {
  const [main, other] = b.sfs === b.base_sfs && a.sfs !== a.base_sfs ? [b, a] : [a, b];
  const union = (x: string[], y: string[]) => [...new Set([...x, ...y])];
  return {
    ...main,
    title: main.title || other.title,
    omfattning: main.omfattning,
    ikraft: main.ikraft ?? other.ikraft,
    props: union(main.props, other.props),
    bets: union(main.bets, other.bets),
    rskr: union(main.rskr, other.rskr),
  };
}
