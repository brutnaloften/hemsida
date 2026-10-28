/**
 * Pure parsing and transform for the Statskontoret (ESV) årsutfall files.
 * Formats and gotchas: docs/budget-data.md. No network or file I/O here
 * except `readSingleZipEntry`, which shells out to the system `unzip`.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import type {
  BudgetMeta,
  BudgetStatus,
  Expenditure,
  OvrigtKey,
  Revenue,
  Series,
} from './schema.ts';

export const FIRST_YEAR = 2006;

/** Title-level revenue is preliminary until about 1.5 years after the budget year. Not in the data. */
export const DEFAULT_REVENUE_FINAL_THROUGH = 2023;

export const SOURCE_PAGE =
  'https://www.statskontoret.se/analys-och-statistik/oppna-data/arsutfall/';

export const EXPENDITURE_HEADER = [
  'Utgiftsområde',
  'Utgiftsområdesnamn',
  'Anslag',
  'Anslagsnamn',
  'År',
  'Ingående överföringsbelopp',
  'Statens budget',
  'Ändringsbudgetar',
  'Indragningar',
  'Utnyttjad del av medgivet överskridande',
  'Utfall',
  'Anslagskredit',
  'Utgående överföringsbelopp',
  'Utgiftsområde utfallsår',
  'Utgiftsområdesnamn utfallsår',
  'Anslag utfallsår',
  'Anslagsnamn utfallsår',
];

export const REVENUE_HEADER = [
  'Inkomsttyp',
  'Inkomsttypsnamn',
  'Inkomsthuvudgrupp',
  'Inkomsthuvudgruppsnamn',
  'Inkomsttitelgrupp',
  'Inkomsttitelgruppsnamn',
  'Inkomsttitel',
  'Inkomsttitelsnamn',
  'År',
  'Statens budget',
  'Utfall',
  'Inkomsttyp utfallsår',
  'Inkomsttypsnamn utfallsår',
  'Inkomsthuvudgrupp utfallsår',
  'Inkomsthuvudgruppsnamn utfallsår',
  'Inkomsttitelgrupp utfallsår',
  'Inkomsttitelgruppsnamn utfallsår',
  'Inkomsttitel utfallsår',
  'Inkomsttitelsnamn utfallsår',
];

/** Names of the non-UO rows (in `Utgiftsområdesnamn`, empty UO code) that we keep. */
export const OVRIGT_ROWS: Record<string, OvrigtKey> = {
  'Riksgäldskontorets nettoutlåning': 'nettoutlaning',
  'Kassamässig korrigering': 'kassamassigKorrigering',
  'Ålderspensionssystemet vid sidan av statens budget': 'alderspension',
  Utgiftstak: 'utgiftstak',
  'Marginal till utgiftstaket': 'marginal',
};

/** Non-UO rows that exist in the file but are not used (budget only, no outcome). */
const IGNORED_NON_UO_ROWS = new Set(['Förändring av anslagsbehållningar']);

// --- CSV -------------------------------------------------------------------

/**
 * Parse a ';'-separated CSV with CRLF or LF line endings. The ESV files have
 * no quoting; a double quote anywhere means the format changed, so fail loudly.
 */
export function parseCsv(text: string): string[][] {
  if (text.includes('"')) throw new Error('CSV contains a double quote; quoting is not supported');
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.map((line) => line.split(';'));
}

/** Decimal comma, empty cell is null (not 0). Rounded to one decimal; never returns -0. */
export function parseAmount(cell: string): number | null {
  const s = cell.trim();
  if (s === '') return null;
  const n = Number(s.replace(',', '.'));
  if (!Number.isFinite(n)) throw new Error(`Not a number: "${cell}"`);
  const rounded = Math.round(n * 10) / 10;
  return rounded === 0 ? 0 : rounded;
}

function assertHeader(actual: string[], expected: string[], what: string): void {
  const same = actual.length === expected.length && expected.every((h, i) => h === actual[i]);
  if (!same) {
    throw new Error(
      `Unexpected ${what} header. The annual and monthly endpoints differ and the annual one ` +
        `silently returns the annual file, so check the URL. Got: ${actual.join(';').slice(0, 200)}`,
    );
  }
}

function parseYear(cell: string, line: number): number {
  const y = Number(cell);
  if (!Number.isInteger(y)) throw new Error(`Bad year "${cell}" on line ${line}`);
  return y;
}

function sortBy<T>(items: T[], key: (item: T) => string): T[] {
  return [...items].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

// --- Expenditure -------------------------------------------------------------

/**
 * Display designation of a restated anslag code. Current 7-digit codes are UO (2) + group (2) +
 * number (3) and become "<group>:<number>" without leading zeros; discontinued anslag carry a
 * " <last year>" suffix. Old discontinued anslag have six-character codes (`020104 2008`,
 * `14D003 1998`) whose structure does not reliably follow the UO column, so no UO or designation
 * is derived for them (null). Throws on any other shape.
 */
export function parseAnslagKod(kod: string): {
  beteckning: string | null;
  uo: number | null;
  upphort: number | null;
} {
  const m = /^(\d{2})(\d{2})(\d{3})(?: (\d{4}))?$/.exec(kod);
  if (m) {
    return {
      uo: Number(m[1]),
      beteckning: `${Number(m[2])}:${Number(m[3])}`,
      upphort: m[4] ? Number(m[4]) : null,
    };
  }
  const legacy = /^[0-9A-Z]{6} (\d{4})$/.exec(kod);
  if (legacy) return { uo: null, beteckning: null, upphort: Number(legacy[1]) };
  throw new Error(`Unexpected anslag code "${kod}"`);
}

export function parseExpenditure(csv: string): Expenditure {
  const rows = parseCsv(csv);
  assertHeader(rows[0] ?? [], EXPENDITURE_HEADER, 'expenditure');
  const H = (name: string) => EXPENDITURE_HEADER.indexOf(name);
  const iUo = H('Utgiftsområde');
  const iUoNamn = H('Utgiftsområdesnamn');
  const iAnslag = H('Anslag');
  const iAnslagNamn = H('Anslagsnamn');
  const iYear = H('År');
  const iBudget = H('Statens budget');
  const iAndrad = H('Ändringsbudgetar');
  const iUtfall = H('Utfall');

  const dataRows: { cells: string[]; year: number; line: number }[] = [];
  for (const [i, cells] of rows.slice(1).entries()) {
    if (cells.length !== EXPENDITURE_HEADER.length) {
      throw new Error(
        `Line ${i + 2}: expected ${EXPENDITURE_HEADER.length} cells, got ${cells.length}`,
      );
    }
    const year = parseYear(cells[iYear], i + 2);
    if (year >= FIRST_YEAR) dataRows.push({ cells, year, line: i + 2 });
  }
  if (dataRows.length === 0) throw new Error('No expenditure rows from ' + FIRST_YEAR);

  const latest = Math.max(...dataRows.map((r) => r.year));
  const years = range(FIRST_YEAR, latest);
  const yearIdx = (y: number) => y - FIRST_YEAR;
  const blank = (): Series => years.map(() => null);

  type AnslagAcc = {
    kod: string;
    uo: number;
    beteckning: string | null;
    upphort: number | null;
    namn: string;
    namnYear: number;
    budget: Series;
    andrad: Series;
    utfall: Series;
  };
  const anslag = new Map<string, AnslagAcc>();
  const uoNames = new Map<number, { namn: string; year: number }>();
  const ovrigt: Record<OvrigtKey, Series> = {
    nettoutlaning: blank(),
    kassamassigKorrigering: blank(),
    alderspension: blank(),
    utgiftstak: blank(),
    marginal: blank(),
  };
  const ovrigtSeen = new Set<string>();
  const anslagSeen = new Set<string>();

  for (const { cells, year, line } of dataRows) {
    const uoCell = cells[iUo];
    if (uoCell === '') {
      const name = cells[iUoNamn];
      const key = OVRIGT_ROWS[name];
      if (!key) {
        if (IGNORED_NON_UO_ROWS.has(name)) continue;
        throw new Error(`Line ${line}: unknown non-UO row "${name}"`);
      }
      const seenKey = `${key}:${year}`;
      if (ovrigtSeen.has(seenKey)) throw new Error(`Line ${line}: duplicate ${name} for ${year}`);
      ovrigtSeen.add(seenKey);
      ovrigt[key][yearIdx(year)] = parseAmount(cells[iUtfall]);
      continue;
    }

    const kod = cells[iAnslag];
    const parsed = parseAnslagKod(kod);
    const uo = Number(uoCell);
    if (parsed.uo !== null && uo !== parsed.uo)
      throw new Error(`Line ${line}: anslag ${kod} does not belong to UO ${uo}`);

    const prevUo = uoNames.get(uo);
    if (!prevUo || prevUo.year <= year) uoNames.set(uo, { namn: cells[iUoNamn], year });

    let acc = anslag.get(kod);
    if (!acc) {
      acc = {
        kod,
        uo,
        beteckning: parsed.beteckning,
        upphort: parsed.upphort,
        namn: cells[iAnslagNamn],
        namnYear: year,
        budget: blank(),
        andrad: blank(),
        utfall: blank(),
      };
      anslag.set(kod, acc);
    }
    if (acc.uo !== uo) throw new Error(`Line ${line}: anslag ${kod} appears under two UOs`);
    if (year >= acc.namnYear) {
      acc.namn = cells[iAnslagNamn];
      acc.namnYear = year;
    }
    const idx = yearIdx(year);
    const dupKey = `${kod}:${year}`;
    if (anslagSeen.has(dupKey)) throw new Error(`Line ${line}: duplicate (${kod}, ${year})`);
    anslagSeen.add(dupKey);
    acc.budget[idx] = parseAmount(cells[iBudget]);
    acc.andrad[idx] = parseAmount(cells[iAndrad]);
    acc.utfall[idx] = parseAmount(cells[iUtfall]);
  }

  return {
    years,
    uo: [...uoNames.entries()].sort((a, b) => a[0] - b[0]).map(([nr, { namn }]) => ({ nr, namn })),
    anslag: sortBy([...anslag.values()], (a) => a.kod).map((a) => ({
      kod: a.kod,
      uo: a.uo,
      beteckning: a.beteckning,
      namn: a.namn,
      upphort: a.upphort,
      budget: a.budget,
      andrad: a.andrad,
      utfall: a.utfall,
    })),
    ovrigt,
  };
}

// --- Revenue -----------------------------------------------------------------

export function parseRevenue(csv: string): Revenue {
  const rows = parseCsv(csv);
  assertHeader(rows[0] ?? [], REVENUE_HEADER, 'revenue');
  const H = (name: string) => REVENUE_HEADER.indexOf(name);
  const iYear = H('År');
  const iBudget = H('Statens budget');
  const iUtfall = H('Utfall');

  const data: { cells: string[]; year: number; line: number }[] = [];
  for (const [i, cells] of rows.slice(1).entries()) {
    if (cells.length !== REVENUE_HEADER.length) {
      throw new Error(
        `Line ${i + 2}: expected ${REVENUE_HEADER.length} cells, got ${cells.length}`,
      );
    }
    const year = parseYear(cells[iYear], i + 2);
    if (year >= FIRST_YEAR) data.push({ cells, year, line: i + 2 });
  }
  if (data.length === 0) throw new Error('No revenue rows from ' + FIRST_YEAR);

  const latest = Math.max(...data.map((r) => r.year));
  const years = range(FIRST_YEAR, latest);
  const blank = (): Series => years.map(() => null);

  // Each level: code -> latest name (+ parent, which must be consistent over time).
  type Node = { kod: string; parent: string; namn: string; year: number };
  const levels = {
    typ: new Map<string, Node>(),
    huvudgrupp: new Map<string, Node>(),
    titelgrupp: new Map<string, Node>(),
    titel: new Map<string, Node>(),
  };
  const touch = (
    level: Map<string, Node>,
    kod: string,
    parent: string,
    namn: string,
    year: number,
    line: number,
  ) => {
    if (kod === '') throw new Error(`Line ${line}: empty revenue code`);
    const prev = level.get(kod);
    if (prev && prev.parent !== parent) {
      throw new Error(`Line ${line}: ${kod} has two parents (${prev.parent}, ${parent})`);
    }
    if (!prev || year >= prev.year) level.set(kod, { kod, parent, namn, year });
  };

  const budget = new Map<string, Series>();
  const utfall = new Map<string, Series>();
  const seen = new Set<string>();

  for (const { cells, year, line } of data) {
    const [typ, typNamn, hg, hgNamn, tg, tgNamn, titel, titelNamn] = cells;
    touch(levels.typ, typ, '', typNamn, year, line);
    touch(levels.huvudgrupp, hg, typ, hgNamn, year, line);
    // Some titles (e.g. in type 6000) have no titelgrupp; they hang directly under their huvudgrupp.
    if (tg !== '') touch(levels.titelgrupp, tg, hg, tgNamn, year, line);
    touch(levels.titel, titel, `${hg}/${tg}`, titelNamn, year, line);
    const key = `${titel}:${year}`;
    if (seen.has(key)) throw new Error(`Line ${line}: duplicate (${titel}, ${year})`);
    seen.add(key);
    if (!budget.has(titel)) {
      budget.set(titel, blank());
      utfall.set(titel, blank());
    }
    const idx = year - FIRST_YEAR;
    budget.get(titel)![idx] = parseAmount(cells[iBudget]);
    utfall.get(titel)![idx] = parseAmount(cells[iUtfall]);
  }

  const sorted = (level: Map<string, Node>) => sortBy([...level.values()], (n) => n.kod);
  return {
    years,
    typ: sorted(levels.typ).map((n) => ({ kod: n.kod, namn: n.namn })),
    huvudgrupp: sorted(levels.huvudgrupp).map((n) => ({ kod: n.kod, typ: n.parent, namn: n.namn })),
    titelgrupp: sorted(levels.titelgrupp).map((n) => ({
      kod: n.kod,
      huvudgrupp: n.parent,
      namn: n.namn,
    })),
    titlar: sorted(levels.titel).map((n) => {
      const [huvudgrupp, titelgrupp] = n.parent.split('/');
      return {
        kod: n.kod,
        huvudgrupp,
        titelgrupp: titelgrupp === '' ? null : titelgrupp,
        namn: n.namn,
        budget: budget.get(n.kod)!,
        utfall: utfall.get(n.kod)!,
      };
    }),
  };
}

// --- Meta --------------------------------------------------------------------

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** status: final for every year up to and including `finalThrough`, preliminary after. */
export function yearStatuses(years: number[], finalThrough: number): Record<string, BudgetStatus> {
  return Object.fromEntries(
    years.map((y): [string, BudgetStatus] => [
      String(y),
      y <= finalThrough ? 'final' : 'preliminary',
    ]),
  );
}

export type ReleaseFile = { url: string; release: string; status: string; csv: string };

export function buildMeta(args: {
  expenditure: Expenditure;
  revenue: Revenue;
  expenditureFile: ReleaseFile;
  revenueFile: ReleaseFile;
  revenueFinalThrough: number;
  today: string;
  previous?: BudgetMeta | null;
}): BudgetMeta {
  const { expenditure, revenue, previous } = args;
  if (expenditure.years.join() !== revenue.years.join()) {
    throw new Error('Expenditure and revenue cover different years');
  }
  const info = (f: ReleaseFile) => ({
    url: f.url,
    release: f.release,
    status: f.status,
    sha256: sha256(f.csv),
  });
  const files = { expenditure: info(args.expenditureFile), revenue: info(args.revenueFile) };
  // Keep the old fetched date when the downloaded content is identical, so a
  // refresh with no new data yields no diff.
  const unchanged =
    previous &&
    previous.files.expenditure.sha256 === files.expenditure.sha256 &&
    previous.files.revenue.sha256 === files.revenue.sha256;
  const latest = expenditure.years[expenditure.years.length - 1];
  return {
    source: SOURCE_PAGE,
    licence: 'CC0-1.0',
    fetched: unchanged ? previous.fetched : args.today,
    unit: 'mn kr',
    years: expenditure.years,
    files,
    yearStatus: {
      expenditure: yearStatuses(expenditure.years, latest),
      revenue: yearStatuses(revenue.years, args.revenueFinalThrough),
    },
  };
}

// --- Discovery and unzip -----------------------------------------------------

export type ListedFile = {
  documentType: 'Utgift' | 'Inkomst';
  url: string;
  fileName: string;
  year: number;
  status: string;
};

/** Higher is newer within a year: Definitiv beats Preliminär 3 > 2 > 1. */
export function statusRank(status: string): number {
  if (status === 'Definitiv') return 100;
  const m = /(\d+)\s*$/.exec(status);
  return m ? Number(m[1]) : 0;
}

/** Extract the Zip download links from the årsutfall listing page. */
export function parseListing(html: string, base = 'https://www.statskontoret.se'): ListedFile[] {
  const files: ListedFile[] = [];
  for (const m of html.matchAll(/href="([^"]*GetFile\?[^"]*)"/g)) {
    const href = m[1].replaceAll('&amp;', '&');
    const url = new URL(href, base);
    if (url.searchParams.get('fileType') !== 'Zip') continue;
    const documentType = url.searchParams.get('documentType');
    if (documentType !== 'Utgift' && documentType !== 'Inkomst') continue;
    files.push({
      documentType,
      url: url.toString(),
      fileName: url.searchParams.get('fileName') ?? '',
      year: Number(url.searchParams.get('Year')),
      status: url.searchParams.get('status') ?? '',
    });
  }
  return files;
}

/** Newest file of a type: latest year, then latest status. */
export function pickNewest(files: ListedFile[], documentType: 'Utgift' | 'Inkomst'): ListedFile {
  const candidates = files.filter((f) => f.documentType === documentType);
  if (candidates.length === 0) throw new Error(`No ${documentType} zip on the listing page`);
  return [...candidates].sort(
    (a, b) => b.year - a.year || statusRank(b.status) - statusRank(a.status),
  )[0];
}

/** Release title without extension, e.g. "Årsutfall inkomster 2006 - 2025, andra preliminära". */
export function releaseName(fileName: string): string {
  return fileName
    .replace(/\.zip$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/,\s+/g, ', ')
    .trim();
}

/**
 * Read the one entry of a zip with the system `unzip -p`. Never matches by
 * name: entry names are CP437-garbled and the extraction is locale dependent.
 */
export function readSingleZipEntry(zipPath: string): string {
  const list = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf-8' })
    .split('\n')
    .filter((l) => l !== '');
  if (list.length !== 1)
    throw new Error(`${zipPath}: expected one zip entry, found ${list.length}`);
  return execFileSync('unzip', ['-p', zipPath], {
    encoding: 'utf-8',
    maxBuffer: 256 * 1024 * 1024,
  });
}

// --- Serialisation -----------------------------------------------------------

/**
 * Deterministic JSON with objects expanded and arrays of primitives on one
 * line, so one series is one diff line.
 */
export function stringifyCompact(value: unknown, indent = ''): string {
  if (Array.isArray(value)) {
    if (value.every((v) => v === null || typeof v !== 'object')) {
      return '[' + value.map((v) => JSON.stringify(v)).join(', ') + ']';
    }
    const inner = indent + '  ';
    return (
      '[\n' + value.map((v) => inner + stringifyCompact(v, inner)).join(',\n') + '\n' + indent + ']'
    );
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    const inner = indent + '  ';
    return (
      '{\n' +
      entries
        .map(([k, v]) => `${inner}${JSON.stringify(k)}: ${stringifyCompact(v, inner)}`)
        .join(',\n') +
      '\n' +
      indent +
      '}'
    );
  }
  return JSON.stringify(value);
}
