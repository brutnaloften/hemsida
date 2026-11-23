/**
 * Full text of Riksdag documents for the eval labeller (hemsida-4np.16) and, later, the
 * year-over-year comparison sheet. `data.riksdagen.se/dokument/<id>.text` returns a
 * dokumentstatus-style XML whose `<html>` element holds the document as XML-escaped HTML,
 * with numeric entities (soft hyphens, non-breaking spaces) and `<span>` runs inside words.
 *
 * This module fetches it (sequentially, 1 req/s, cached on disk), turns it into plain
 * paragraphs and annotates each paragraph with its section and speaker (government,
 * committee majority, reservation or special statement by party, motion by party).
 * Pure functions are separate from the fetcher so they can be tested on fixtures.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { RIKSDAG_BASE_URL } from './riksdag.ts';

export interface RawParagraph {
  text: string;
  /** True for headings (h1-h6 or a heading paragraph class). */
  heading: boolean;
  /** PDF page (`<DIV id="page_N">`) the paragraph sits on, for PDF-to-HTML documents. */
  page?: number;
}

export type SpeakerKind =
  | 'government'
  | 'committee'
  | 'reservation'
  | 'special_statement'
  | 'motion'
  | 'inquiry'
  | 'other';

export interface Speaker {
  kind: SpeakerKind;
  /** Party codes for reservations, special statements and motions. */
  parties: string[];
  /** Swedish label for display. */
  label: string;
}

export interface Paragraph extends RawParagraph {
  index: number;
  /** Nearest preceding heading (empty before the first one). */
  section: string;
  /** Nearest preceding `Anslaget N:N ...` heading, if any. */
  anslag: string | null;
  speaker: Speaker;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  shy: '­',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#x')) return String.fromCodePoint(parseInt(body.slice(2), 16));
    if (body.startsWith('#')) return String.fromCodePoint(parseInt(body.slice(1), 10));
    return NAMED_ENTITIES[body] ?? whole;
  });
}

function cleanText(s: string): string {
  return decodeEntities(s).replace(/­/g, '').replace(/[   ]/g, ' ').replace(/\s+/g, ' ').trim();
}

const BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'tr', 'div', 'br']);
const HEADING_CLASS = /^R\d$|rubrik|^Heading/i;
const DROP_CLASS = /^(TOC\d*|Mellanrum)$/i;

function toHtml(raw: string): string {
  let html = raw;
  const m = /<html>([\s\S]*)<\/html>/.exec(raw);
  if (m) html = decodeEntities(m[1]!);
  return html.replace(/<(style|script)[\s\S]*?<\/\1>/gi, '');
}

/** One top-level table-of-contents row: a numbered section or a named unnumbered one. */
export interface TocEntry {
  /** Section number ("3"), or null for unnumbered rows like Sammanfattning. */
  number: string | null;
  title: string;
  /** PDF page the row links to (`#page_N`). */
  page: number;
}

/** A page with this many ToC links starts the ToC; body pages hold at most a few cross-references. */
export const TOC_PAGE_LINKS = 5;
/** A page after the first ToC page still belongs to the ToC with this many links (the last page is short). */
const TOC_CONTINUE_LINKS = 3;

/** The ToC run must start on one of the first pages. */
const TOC_MAX_START_PAGE = 20;

/** `#page_N` links on a page, ignoring links to the page itself (footnote markers). */
export function pageLinkCount(pageHtml: string, page: number): number {
  let n = 0;
  for (const m of pageHtml.matchAll(/href="#page_(\d+)"/gi)) if (Number(m[1]) !== page) n++;
  return n;
}

/**
 * The leading run of table-of-contents pages, with their offsets in `html`. Only the leading run
 * counts: later pages with several links are body pages (cross-references), not ToC.
 */
function tocSpans(html: string): { pages: Set<number>; spans: [number, number][] } {
  const pages = new Set<number>();
  const spans: [number, number][] = [];
  const re = /<DIV id="page_(\d+)"[^>]*>/gi;
  const marks = [...html.matchAll(re)].map((m) => ({ page: Number(m[1]), at: m.index }));
  let inRun = false;
  for (let i = 0; i < marks.length; i++) {
    const mk = marks[i]!;
    const end = marks[i + 1]?.at ?? html.length;
    const n = pageLinkCount(html.slice(mk.at, end), mk.page);
    // The ToC sits at the front: a run cannot start deep into the document.
    if (!inRun && mk.page > TOC_MAX_START_PAGE) break;
    if (inRun ? n < TOC_CONTINUE_LINKS : n < TOC_PAGE_LINKS) {
      if (inRun) break;
      continue;
    }
    inRun = true;
    pages.add(mk.page);
    spans.push([mk.at, end]);
  }
  return { pages, spans };
}

function plain(s: string): string {
  return cleanText(s.replace(/<[^>]*>/g, ' '));
}

function stripLeaders(s: string): string {
  return s
    .replace(/\s*\.{3,}.*$/, '')
    .replace(/\s+\d{1,4}$/, '')
    .trim();
}

/**
 * Top-level entries of the table of contents of a PDF-to-HTML document (SOU, Ds, prop,
 * skr): rows with a `#page_N` link and a bare number ("3"), plus unnumbered rows that
 * link to a new page (Sammanfattning, Författningsförslag, Referenser, Bilaga). Sub-entries
 * ("3.1") and wrapped continuation lines are skipped. Returns [] when there is no ToC.
 */
export function extractToc(raw: string): TocEntry[] {
  const html = toHtml(raw);
  const { pages, spans } = tocSpans(html);
  if (pages.size === 0) return [];
  // Rows: table rows, or anchored paragraphs outside tables.
  const rowRe =
    /<tr[\s>][\s\S]*?<\/tr>|<p[\s>](?:(?!<\/p>)[\s\S])*?href="#page_\d+"[\s\S]*?<\/p>/gi;
  const entries: TocEntry[] = [];
  let lastTarget = -1;
  let lastWasTop = false;
  for (let r = rowRe.exec(html); r !== null; r = rowRe.exec(html)) {
    const row = r[0];
    if (!spans.some(([a, b]) => r!.index >= a && r!.index < b)) continue;
    const target = /href="#page_(\d+)"/i.exec(row);
    if (!target) {
      lastWasTop = false;
      continue;
    }
    const page = Number(target[1]);
    const cells =
      row.startsWith('<TR') || row.startsWith('<tr')
        ? [...row.matchAll(/<t[dh][\s>][\s\S]*?<\/t[dh]>/gi)].map((c) => plain(c[0]))
        : [plain(row)];
    const nonEmpty = cells.filter((c) => c !== '');
    if (nonEmpty.length === 0) continue;
    let number: string | null = null;
    let rest = nonEmpty;
    if (/^\d{1,2}$/.test(nonEmpty[0]!) && nonEmpty.length > 1) {
      number = nonEmpty[0]!;
      rest = nonEmpty.slice(1);
    } else if (nonEmpty.length === 1) {
      const m = /^(\d{1,2})\s*([A-ZÅÄÖa-zåäö].*)$/.exec(nonEmpty[0]!);
      if (m) {
        number = m[1]!;
        rest = [m[2]!];
      }
    }
    if (/^\d+\.\d/.test(nonEmpty[0]!)) {
      lastTarget = page;
      lastWasTop = false;
      continue;
    }
    let title = stripLeaders(rest.join(' '));
    if (number === null) {
      const m = /^(\d{1,2})\s+(\S.*)$/.exec(title);
      if (m) {
        number = m[1]!;
        title = m[2]!;
      }
    }
    // Law-text sections ("2 b §"), body sentences and lowercase continuations are not sections.
    const isContinuation = number === null && page === lastTarget;
    if (
      title.length > 160 ||
      /§|[.,;:]$/.test(title) ||
      (!isContinuation && !/^[A-ZÅÄÖ]/.test(title))
    ) {
      lastWasTop = false;
      continue;
    }
    const prev = entries[entries.length - 1];
    if (prev && page < prev.page) {
      lastWasTop = false;
      continue;
    }
    if (number !== null) {
      if (title) entries.push({ number, title, page });
      lastTarget = page;
      lastWasTop = true;
    } else if (page === lastTarget) {
      // Wrapped continuation of the previous row.
      if (lastWasTop && title && !/^\d+$/.test(title)) {
        const e = entries[entries.length - 1]!;
        e.title = `${e.title} ${title}`;
      }
    } else {
      // A new unnumbered target after a numbered sub-tree.
      if (title && !/^\d+$/.test(title)) {
        entries.push({ number: null, title, page });
        lastWasTop = true;
      } else lastWasTop = false;
      lastTarget = page;
    }
  }
  return entries;
}

const UNNUMBERED_HEADING =
  /^(Sammanfattning|Summary|Författningsförslag|Förslag till riksdagsbeslut|Referenser|Källförteckning|Bilaga \d+|Bilagor)\b/;
/** Footnote lines ("1 Jfr ...") look like numbered headings but are not. */
const FOOTNOTE_START =
  /^\d{1,2} (Jfr|Se|Prop|SOU|Ds|Bet|Dir|SFS|Not|Lag|Förordning|A\.a|Ibid|Dnr|Skr|Rskr|Mot|Kommittédirektiv|EU|Europaparlamentets)\b/;

/**
 * Fallback for documents without a parseable ToC: top-level headings are short
 * paragraphs that start with the next running number ("3 Utredningens uppdrag") or are
 * a known unnumbered name (Sammanfattning, Författningsförslag, Bilaga N). Numbers must
 * run 1, 2, 3, ... so page headers and list items do not match.
 */
export function guessHeadings(paras: RawParagraph[]): Set<number> {
  const hits = new Set<number>();
  const seen = new Set<string>();
  let next = 1;
  paras.forEach((p, i) => {
    const t = p.text;
    if (t.length > 100 || /[.:;,]$/.test(t)) return;
    // Unlinked ToC lines end in a page number ("1 Inledning 9"); they must not use up a number.
    if (/\s\d{1,4}$/.test(t) && !/^Bilaga \d+$/.test(t)) return;
    if (UNNUMBERED_HEADING.test(t) && t.length <= 60) {
      // Repeated "Bilaga 1" page headers: only the first occurrence is the section start.
      const key = norm(t);
      if (!seen.has(key)) hits.add(i);
      seen.add(key);
      return;
    }
    if (FOOTNOTE_START.test(t)) return;
    const m = /^(\d{1,2})(?!\d)\s*([A-ZÅÄÖ][^.]*)$/.exec(t);
    if (m && Number(m[1]) === next) {
      hits.add(i);
      next++;
    }
  });
  // A lone numbered hit is more likely a coincidence than a structure.
  const numbered = [...hits].filter((i) => /^\d/.test(paras[i]!.text));
  if (numbered.length < 2) for (const i of numbered) hits.delete(i);
  // A guess that puts most of the text under one heading is wrong (the real headings were missed);
  // no headings are better than a misleading one.
  const total = paras.reduce((n, p) => n + p.text.length, 0);
  const starts = [...hits].sort((a, b) => a - b);
  let biggest =
    starts.length > 0 ? paras.slice(0, starts[0]).reduce((n, p) => n + p.text.length, 0) : total;
  starts.forEach((st, k) => {
    const end = starts[k + 1] ?? paras.length;
    biggest = Math.max(
      biggest,
      paras.slice(st, end).reduce((n, p) => n + p.text.length, 0),
    );
  });
  if (total > 0 && biggest / total > 0.7) return new Set();
  return hits;
}

/** Drop a running page header ("Prop. 2023/24:64 ") and a leading section number ("3", "3.1", glued or not). */
export function stripNumberAndHeader(text: string): string {
  return text
    .replace(/^(Prop|Skr)\. \d{4}\/\d{2}:\d+\s*/, '')
    .replace(/^\d{1,2}(?!\d)(\.\d+)*\s*/, '');
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * Mark top-level sections in a document whose headings carry no heading markup. Existing
 * paragraphs that match a ToC entry (or the fallback guess) become headings; a ToC entry
 * with no matching paragraph gets a synthetic heading at its first page.
 */
export function applyTocSections(paras: RawParagraph[], toc: TocEntry[]): RawParagraph[] {
  if (paras.filter((p) => p.heading).length >= 3) return paras;
  if (toc.length < 2) {
    const guessed = guessHeadings(paras);
    return paras.map((p, i) => (guessed.has(i) ? { ...p, heading: true } : p));
  }
  const out = paras.map((p) => ({ ...p }));
  const inserts: { at: number; para: RawParagraph }[] = [];
  let from = 0;
  for (const e of toc) {
    const key = norm(e.title).slice(0, 25);
    const label = e.number ? `${e.number} ${e.title}` : e.title;
    let first = -1;
    let match = -1;
    for (let i = from; i < out.length; i++) {
      const pg = out[i]!.page ?? 0;
      if (pg < e.page) continue;
      if (first < 0) first = i;
      if (pg > e.page) break;
      const body = norm(stripNumberAndHeader(out[i]!.text));
      if (key.length > 3 && body.startsWith(key) && out[i]!.text.length < 160) {
        match = i;
        break;
      }
    }
    if (match >= 0) {
      out[match]!.heading = true;
      from = match + 1;
    } else if (first >= 0) {
      const at = Math.max(first, from);
      inserts.push({ at, para: { text: label, heading: true, page: out[first]!.page } });
      from = at;
    }
  }
  for (const { at, para } of inserts.sort((a, b) => b.at - a.at)) out.splice(at, 0, para);
  return out;
}

/** Turn the `.text` response (or plain HTML) into paragraphs, dropping the table of contents. */
export function parseRiksdagText(raw: string): RawParagraph[] {
  const html = toHtml(raw);
  const { pages } = tocSpans(html);
  const out = parseBlocks(html, pages);
  // Only PDF conversions (page divs) lack heading markup; real HTML documents keep their own.
  if (!/<DIV id="page_\d+"/i.test(html)) return out;
  return applyTocSections(out, pages.size > 0 ? extractToc(raw) : []);
}

function parseBlocks(html: string, toc: Set<number>): RawParagraph[] {
  const out: RawParagraph[] = [];
  let buf = '';
  let heading = false;
  let drop = false;
  let page: number | undefined;
  const flush = () => {
    const text = cleanText(buf.replace(/<[^>]*>/g, ''));
    const onToc = page !== undefined && toc.has(page);
    if (text && !drop && !onToc && !/^\d+\.$/.test(text)) {
      out.push(page === undefined ? { text, heading } : { text, heading, page });
    }
    buf = '';
  };

  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g;
  let last = 0;
  for (let t = re.exec(html); t !== null; t = re.exec(html)) {
    buf += html.slice(last, t.index);
    last = re.lastIndex;
    const name = t[2]!.toLowerCase();
    if (!BLOCK_TAGS.has(name)) {
      if (name === 'td' || name === 'th') buf += ' ';
      continue;
    }
    flush();
    if (t[1] === '/' || name === 'br') {
      heading = false;
      drop = false;
      continue;
    }
    const pg = name === 'div' ? /\bid="page_(\d+)"/i.exec(t[3]!) : null;
    if (pg) page = Number(pg[1]);
    const cls = /class="([^"]*)"/.exec(t[3]!)?.[1] ?? '';
    heading = /^h[1-6]$/.test(name) || HEADING_CLASS.test(cls);
    drop = DROP_CLASS.test(cls);
  }
  buf += html.slice(last);
  flush();
  return out;
}

const PARTY_NAMES: Record<string, string> = {
  socialdemokraterna: 'S',
  vänsterpartiet: 'V',
  centerpartiet: 'C',
  miljöpartiet: 'MP',
  'miljöpartiet de gröna': 'MP',
  sverigedemokraterna: 'SD',
  moderaterna: 'M',
  kristdemokraterna: 'KD',
  liberalerna: 'L',
};

/** Party codes inside a trailing parenthesis, e.g. "... punkt 2 (S, V)" -> S, V. */
export function trailingParties(heading: string): string[] {
  const m = /\(([A-ZÅÄÖ]{1,2}(?:\s*(?:,|och)\s*[A-ZÅÄÖ]{1,2})*)\)\s*:?\s*$/.exec(heading);
  if (!m) return [];
  return m[1]!.match(/MP|SD|KD|[SVCML]/g) ?? [];
}

const DISSENT_START =
  /^(\d+\.\s*)?(Reservation|Reservationer|Särskilt yttrande|Särskilda yttranden|Avvikande mening|Avvikande meningar)\b/i;
const DISSENT_END = /^(Bilaga|Bilagor|Utskottets|Regeringens|Förslag|Beslut|Motion|Ärendet)/i;

/** Headings that end the per-anslag part of a budget document. */
const ANSLAG_END = /^(Motionerna|Utskottets|Särskilda|Reservation|Bilaga|Förslag|Beslut)/i;

/** Headings that end a section-level speaker context. */
const CTX_END = /^(Utskottets|Motionerna|Motionen|Förslag|Beslut)/i;
const ANNEX_START = /^(Bilaga|Bilagor|Förteckning över behandlade förslag)/i;

const GOV_PARA = /^Regeringen (föreslår|bedömer|anser|avser|har)|^Regeringens (förslag|bedömning)/;
const COMMITTEE_PARA = /^Utskottet\b/;

function partyList(parties: string[]): string {
  return parties.length > 0 ? ` (${parties.join(', ')})` : '';
}

/**
 * Annotate paragraphs with section, anslag and speaker. `doktyp` sets the default speaker:
 * prop and dir are the government, sou/ds an inquiry, bet the committee majority.
 */
export function annotateParagraphs(raw: RawParagraph[], doktyp: string): Paragraph[] {
  const base: Speaker =
    doktyp === 'prop' || doktyp === 'dir'
      ? { kind: 'government', parties: [], label: 'Regeringen' }
      : doktyp === 'sou' || doktyp === 'ds'
        ? { kind: 'inquiry', parties: [], label: 'Utredningen' }
        : doktyp === 'bet'
          ? { kind: 'committee', parties: [], label: 'Utskottet (majoriteten)' }
          : { kind: 'other', parties: [], label: 'Okänd avsändare' };

  const govRef: Speaker = { kind: 'government', parties: [], label: 'Regeringen (refererad)' };
  const annexOther: Speaker = { kind: 'other', parties: [], label: 'Bilaga' };
  const dissentOf = (kind: SpeakerKind, parties: string[]): Speaker => ({
    kind,
    parties,
    label: `${kind === 'reservation' ? 'Reservation' : 'Särskilt yttrande'}${partyList(parties)}`,
  });

  let section = '';
  let anslag: string | null = null;
  let dissent: Speaker | null = null;
  // Section-level speaker: the committee summarising the government's proposal ("Propositionen",
  // "Tillkännagivanden som redovisas ...") or a party's motion. Lasts until the committee's own
  // heading, the motions heading or a dissent.
  let ctx: Speaker | null = null;
  let annex = false;
  const out: Paragraph[] = [];

  raw.forEach((p, index) => {
    let speaker: Speaker;
    if (p.heading) {
      section = p.text;
      const parties = trailingParties(p.text);
      const party = PARTY_NAMES[p.text.toLowerCase()];
      if (ANNEX_START.test(p.text)) {
        annex = true;
        dissent = null;
        ctx = null;
        anslag = null;
      } else if (DISSENT_START.test(p.text)) {
        dissent = dissentOf(
          /yttrande/i.test(p.text) ? 'special_statement' : 'reservation',
          parties,
        );
        ctx = null;
        anslag = null;
      } else if (dissent) {
        if (parties.length > 0) dissent = dissentOf(dissent.kind, parties);
        else if (DISSENT_END.test(p.text)) dissent = null;
      }
      if (!dissent) {
        if (/^Anslaget \d+:\d+/.test(p.text)) anslag = p.text;
        else if (ANSLAG_END.test(p.text) || party) anslag = null;
        if (/^Propositionen$|^Tillkännagivanden som redovisas/i.test(p.text)) ctx = govRef;
        else if (annex && parties.length > 0 && /^\d{4}\/\d{2}:\d+ av /.test(p.text)) {
          ctx = { kind: 'motion', parties, label: `Motion${partyList(parties)}` };
        } else if (annex) {
          if (/^Motioner/i.test(p.text)) ctx = null;
        } else if (party) {
          ctx = { kind: 'motion', parties: [party], label: `Motion (${party})` };
        } else if (CTX_END.test(p.text)) ctx = null;
      }
      speaker = dissent ?? ctx ?? (annex ? annexOther : { ...base });
    } else if (dissent) {
      speaker = dissent;
    } else if (annex) {
      speaker = ctx ?? annexOther;
    } else if (
      ctx &&
      (ctx.kind !== 'motion' || (!GOV_PARA.test(p.text) && !COMMITTEE_PARA.test(p.text)))
    ) {
      speaker = ctx;
    } else if (base.kind === 'committee' && (anslag !== null || GOV_PARA.test(p.text))) {
      // Per-anslag sections of a budget betänkande restate the government's proposal.
      speaker = govRef;
    } else {
      speaker = { ...base };
    }
    out.push({ ...p, index, section, anslag, speaker });
  });
  return out;
}

export interface FetchTextOptions {
  cacheDir: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  minIntervalMs?: number;
  userAgent?: string;
  baseUrl?: string;
}

/**
 * Fetches `<dok_id>.text` into the cache (gitignored `tools/out/riksdag-text/`) unless
 * already there. Requests are spaced `minIntervalMs` apart (default 1000), retried on
 * 429/5xx. Returns the raw response, or null when the document has no text (404/empty).
 */
export function createTextFetcher(
  options: FetchTextOptions,
): (dokId: string) => Promise<string | null> {
  const doFetch = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const interval = options.minIntervalMs ?? 1000;
  const ua = options.userAgent ?? 'brutna-loften-tools (https://github.com/brutnaloften)';
  const base = options.baseUrl ?? RIKSDAG_BASE_URL;
  let lastStart = Number.NEGATIVE_INFINITY;

  return async (dokId) => {
    if (!/^[\p{L}\p{N}_-]+$/u.test(dokId)) throw new Error(`Bad dok_id: ${dokId}`);
    const file = resolve(options.cacheDir, `${dokId}.xml`);
    if (existsSync(file)) return readFileSync(file, 'utf8') || null;

    let delay = 1000;
    for (let attempt = 0; ; attempt++) {
      const wait = lastStart + interval - Date.now();
      if (wait > 0) await sleep(wait);
      lastStart = Date.now();
      let res: Response;
      try {
        res = await doFetch(`${base}/dokument/${encodeURIComponent(dokId)}.text`, {
          headers: { 'User-Agent': ua },
        });
      } catch (err) {
        if (attempt >= 2) throw err;
        await sleep(delay);
        delay *= 2;
        continue;
      }
      if (res.ok) {
        const text = await res.text();
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, text);
        return text.trim() === '' ? null : text;
      }
      await res.body?.cancel().catch(() => undefined);
      if (res.status === 404) return null;
      if (attempt < 2 && (res.status === 429 || res.status >= 500)) {
        await sleep(delay);
        delay *= 2;
        continue;
      }
      throw new Error(`HTTP ${res.status} for ${dokId}.text`);
    }
  };
}
