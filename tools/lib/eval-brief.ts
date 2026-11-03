/**
 * Per-pair evidence briefs for the eval labeller (hemsida-4np.16). The labeller cannot judge
 * a promise/document pair from the stored snippet, so for each pair we read the document's
 * full text and report facts only: how often each term occurs (zero counts stated
 * explicitly), verbatim passages with section and speaker, parsed amounts, and for budget
 * documents the same for the prior-year counterpart. Never a suggested label or verdict.
 */
import { z } from 'zod';
import type { Paragraph } from './riksdag-text.ts';

/** File name of a pair's brief inside the output directory (pair ids contain `::`). */
export function briefPath(dir: string, pairId: string): string {
  return `${dir}/${pairId.replace(/[^A-Za-z0-9_.-]+/g, '_')}.json`;
}

export interface BriefPromise {
  id: string;
  title: string;
  keywords: string[];
  quote: string;
}

const STOPWORDS = new Set(
  (
    'ska skall samt eller även inom under genom efter före mellan så många tillgång regeringen ' +
    'riksdagen sverige svenska sverigedemokraterna moderaterna kristdemokraterna liberalerna ' +
    'tidöpartierna ska göras arbete olika andra andras mycket varje alla ' +
    'möjligt ska vara bli blir därför dessutom också'
  ).split(/\s+/),
);

const MIN_WORD = 6;

/**
 * Terms to count: the promise's keywords, plus distinctive words of its title and source
 * quote (length >= 6, not a stopword, not already covered by a keyword), plus optional
 * hand-picked extras. Lower-cased, deduplicated, keywords first.
 */
export function deriveTerms(promise: BriefPromise, extras: string[] = []): string[] {
  const terms: string[] = [];
  const add = (t: string) => {
    const term = t.toLowerCase().replace(/\s+/g, ' ').trim();
    if (term && !terms.includes(term)) terms.push(term);
  };
  promise.keywords.forEach(add);
  extras.forEach(add);
  const covered = (w: string) => terms.some((t) => t.includes(w) || w.includes(t));
  for (const text of [promise.title, promise.quote]) {
    for (const w of text.toLowerCase().match(/[\p{L}-]+/gu) ?? []) {
      if (w.length >= MIN_WORD && !STOPWORDS.has(w) && !covered(w)) add(w);
    }
  }
  return terms;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A term matches from a word start, so `förlossning` also finds `förlossningsvården`. */
export function termRegex(term: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(term).replace(/ /g, '\\s+')}`, 'giu');
}

export interface TermCount {
  term: string;
  count: number;
}

export function countTerms(
  paragraphs: readonly Paragraph[],
  terms: readonly string[],
): TermCount[] {
  return terms.map((term) => {
    const re = termRegex(term);
    let count = 0;
    for (const p of paragraphs) count += p.text.match(re)?.length ?? 0;
    return { term, count };
  });
}

export interface Amount {
  /** As written in the text, e.g. "1 000 000 000 kronor". */
  raw: string;
  kronor: number;
  /** First year (20xx) in the same sentence, else null. */
  year: number | null;
  /** True when the sentence says "per år" / "årligen". */
  per_year: boolean;
  /** True when the amount is preceded by "cirka" / "ca" / "omkring". */
  approx?: boolean;
}

const AMOUNT_RE =
  /(?<![\d\p{L}])(\d{1,3}(?: \d{3})+|\d+(?:,\d+)?)\s*(miljarder|miljard|miljoner|miljon|tusen)?\s*(kronor|kr)(?![\p{L}\p{N}])/giu;

const APPROX = /(?<![\p{L}])(?:cirka|ca\.?|omkring)\s+$/iu;

const UNIT: Record<string, number> = {
  miljarder: 1e9,
  miljard: 1e9,
  miljoner: 1e6,
  miljon: 1e6,
  tusen: 1e3,
};

/** Parse kronor amounts ("1 000 000 000 kronor", "127 miljarder kronor") with their year. */
export function parseAmounts(text: string): Amount[] {
  const out: Amount[] = [];
  for (const sentence of sentenceSpans(text).map((sp) => text.slice(sp.start, sp.end))) {
    const year = /\b(20\d\d)\b/.exec(sentence)?.[1];
    const perYear = /(?<!\p{L})(per år|årligen)(?!\p{L})/iu.test(sentence);
    for (const m of sentence.matchAll(AMOUNT_RE)) {
      const num = parseFloat(m[1]!.replace(/ /g, '').replace(',', '.'));
      const unit = m[2] ? UNIT[m[2].toLowerCase()]! : 1;
      out.push({
        raw: m[0],
        kronor: Math.round(num * unit),
        year: year ? Number(year) : null,
        per_year: perYear,
        ...(APPROX.test(sentence.slice(0, m.index)) ? { approx: true } : {}),
      });
    }
  }
  return out;
}

export interface Passage {
  /** Section heading and anslag the passage sits under. */
  section: string;
  anslag: string | null;
  speaker: string;
  /** Verbatim paragraph text, shortened around the first hit when very long. */
  text: string;
  matched_terms: string[];
  amounts: Amount[];
}

const MAX_PASSAGE_CHARS = 700;

/** Verbatim excerpt of at most MAX_PASSAGE_CHARS, centred on `at`, with ellipses when cut. */
export function excerpt(text: string, at: number, max = MAX_PASSAGE_CHARS): string {
  if (text.length <= max) return text;
  let start = Math.max(0, at - Math.floor(max / 3));
  let end = Math.min(text.length, start + max);
  start = Math.max(0, end - max);
  const space = text.indexOf(' ', start);
  if (start > 0 && space !== -1 && space < at) start = space + 1;
  const lastSpace = text.lastIndexOf(' ', end);
  if (end < text.length && lastSpace > at) end = lastSpace;
  return `${start > 0 ? '… ' : ''}${text.slice(start, end)}${end < text.length ? ' …' : ''}`;
}

/** Keywords and hand-picked extras: the terms specific to the promise (not title/quote words). */
export function distinctiveTerms(promise: BriefPromise, extras: string[] = []): string[] {
  const out: string[] = [];
  for (const t of [...promise.keywords, ...extras]) {
    const term = t.toLowerCase().replace(/\s+/g, ' ').trim();
    if (term && !out.includes(term)) out.push(term);
  }
  return out;
}

interface Sentence {
  start: number;
  end: number;
}

/**
 * Abbreviations whose full stop does not end a sentence ("prop. 2024/25:1", "rskr. 2015/16:155",
 * "bl.a. Sverige"). Matched after a non-letter, so "bäst." and "höst." still end a sentence.
 */
const ABBREVIATION =
  /(?<![\p{L}\p{N}])(?:prop|bet|rskr|bl\.a|t\.ex|m\.fl|m\.m|s\.k|dvs|nr|dnr|jfr|kap|ca|st)\.$/u;
/** "s. 34" (page reference): `s` is an abbreviation only before a digit. */
const PAGE = /(?<![\p{L}\p{N}])s\.$/u;

export function sentenceSpans(text: string): Sentence[] {
  const spans: Sentence[] = [];
  let start = 0;
  const re = /(?<=[.!?])\s+(?=[A-ZÅÄÖ0-9])/gu;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    const before = text.slice(start, m.index);
    const next = text[m.index + m[0].length]!;
    if (ABBREVIATION.test(before) || (PAGE.test(before) && /\d/.test(next))) continue;
    spans.push({ start, end: m.index });
    start = m.index + m[0].length;
  }
  spans.push({ start, end: text.length });
  return spans;
}

/**
 * Verbatim excerpt of whole sentences, at most `max` characters, starting from the sentence
 * that contains `at` and growing to its neighbours (next one first). A single sentence longer
 * than `max` falls back to {@link excerpt}. Ellipses mark cuts.
 */
export function sentenceExcerpt(text: string, at: number, max = MAX_PASSAGE_CHARS): string {
  if (text.length <= max) return text;
  const spans = sentenceSpans(text);
  let lo = spans.findIndex((sp) => at >= sp.start && at <= sp.end);
  if (lo < 0) return excerpt(text, at, max);
  let hi = lo;
  if (spans[lo]!.end - spans[lo]!.start > max) return excerpt(text, at, max);
  const size = () => spans[hi]!.end - spans[lo]!.start;
  for (;;) {
    let grew = false;
    if (hi + 1 < spans.length && spans[hi + 1]!.end - spans[lo]!.start <= max) {
      hi++;
      grew = true;
    }
    if (lo > 0 && spans[hi]!.end - spans[lo - 1]!.start <= max) {
      lo--;
      grew = true;
    }
    if (!grew || size() >= max) break;
  }
  const start = spans[lo]!.start;
  const end = spans[hi]!.end;
  return `${start > 0 ? '\u2026 ' : ''}${text.slice(start, end)}${end < text.length ? ' \u2026' : ''}`;
}

/** Slots in the passage cap reserved for amount-bearing passages (see {@link findPassages}). */
export const AMOUNT_SLOTS = 3;

/**
 * Paragraphs that mention at least one term, at most `limit`, returned in document order.
 * Headings are skipped. Up to AMOUNT_SLOTS of the slots go first to paragraphs where a
 * distinctive term sits in the same sentence as a kronor amount or in the sentence before one
 * (e.g. "Satsningen på kvinnors hälsa fortsätter. För 2026 avsätts 1 000 000 000 kronor."),
 * ranked among themselves with the government's and committee's own text before motions and
 * dissents. The rest are ranked by rarity-weighted term matches, so a very common term does
 * not outweigh a rare one. Long paragraphs are shown as the sentences around the amount (or
 * the first hit).
 */
export function findPassages(
  paragraphs: readonly Paragraph[],
  terms: readonly string[],
  limit: number,
  distinctive: readonly string[] = [],
): Passage[] {
  const regexes = terms.map((t) => [t, termRegex(t)] as const);
  const distinctRegexes = distinctive.map((t) => termRegex(t));
  const hits = paragraphs
    .filter((p) => !p.heading)
    .map((p) => {
      const matched: string[] = [];
      let at = Infinity;
      for (const [term, re] of regexes) {
        re.lastIndex = 0;
        const m = re.exec(p.text);
        if (m) {
          matched.push(term);
          at = Math.min(at, m.index);
        }
      }
      return { p, matched, at, amountAt: amountFocus(p.text, distinctRegexes) };
    })
    .filter((h) => h.matched.length > 0 || h.amountAt !== null);
  const counts = new Map(countTerms(paragraphs, terms).map((t) => [t.term, t.count]));
  const weight = (m: string[]) => m.reduce((s, t) => s + 1 / (1 + Math.log(counts.get(t) || 1)), 0);
  const own = (kind: string) =>
    kind === 'motion' || kind === 'reservation' || kind === 'special_statement' ? 1 : 0;

  const amountHits = hits
    .filter((h) => h.amountAt !== null)
    .sort(
      (a, b) =>
        own(a.p.speaker.kind) - own(b.p.speaker.kind) ||
        weight(b.matched) - weight(a.matched) ||
        a.p.index - b.p.index,
    );
  const picked = new Set(amountHits.slice(0, Math.min(AMOUNT_SLOTS, limit)));
  const rest = hits
    .filter((h) => !picked.has(h) && h.matched.length > 0)
    .sort((a, b) => weight(b.matched) - weight(a.matched) || a.p.index - b.p.index);
  for (const h of rest) {
    if (picked.size >= limit) break;
    picked.add(h);
  }
  return [...picked]
    .sort((a, b) => a.p.index - b.p.index)
    .map(({ p, matched, at, amountAt }) => ({
      section: p.section,
      anslag: p.anslag,
      speaker: p.speaker.label,
      text: sentenceExcerpt(p.text, amountAt ?? at),
      matched_terms: matched,
      amounts: parseAmounts(p.text),
    }));
}

/** Offset of a distinctive term that has a kronor amount in its sentence or the next one. */
function amountFocus(text: string, distinct: readonly RegExp[]): number | null {
  if (distinct.length === 0) return null;
  const spans = sentenceSpans(text);
  const hasAmount = spans.map((sp) => parseAmounts(text.slice(sp.start, sp.end)).length > 0);
  for (let i = 0; i < spans.length; i++) {
    if (!hasAmount[i] && !hasAmount[i + 1]) continue;
    const sentence = text.slice(spans[i]!.start, spans[i]!.end);
    for (const re of distinct) {
      re.lastIndex = 0;
      const m = re.exec(sentence);
      if (m) return spans[i]!.start + m.index;
    }
  }
  return null;
}

export interface StoreDoc {
  dok_id: string;
  doktyp: string;
  rm: string;
  beteckning: string;
  titel: string;
  datum: string;
  organ: string;
}

/** "2025/26" -> "2024/25"; a single year "2025" -> "2024"; otherwise null. */
export function previousRm(rm: string): string | null {
  const split = /^(\d{4})\/(\d{2})$/.exec(rm);
  if (split) {
    const y = Number(split[1]) - 1;
    return `${y}/${String(y + 1).slice(2)}`;
  }
  return /^\d{4}$/.test(rm) ? String(Number(rm) - 1) : null;
}

/** Title with years stripped, so budget propositions of different years compare equal. */
function titleKey(titel: string): string {
  return titel
    .toLowerCase()
    .replace(/\b\d{4}\/\d{2}\b|\b\d{4}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isBudgetDocument(doc: Pick<StoreDoc, 'doktyp' | 'titel'>): boolean {
  return (doc.doktyp === 'bet' || doc.doktyp === 'prop') && /utgiftsområde\s+\d+/i.test(doc.titel);
}

/**
 * Prior-year counterpart of a budget bet/prop: same doktyp, organ and title (years ignored; else
 * same utgiftsområde number), previous riksmöte. Only documents inside the store (= inside the term) count. Returns
 * null when there is none; the caller says so.
 */
export function findPriorYear(
  doc: StoreDoc,
  documents: Record<string, StoreDoc> | readonly StoreDoc[],
): StoreDoc | null {
  if (!isBudgetDocument(doc)) return null;
  const rm = previousRm(doc.rm);
  if (!rm) return null;
  const all = Array.isArray(documents) ? documents : Object.values(documents);
  const sameSlot = all.filter(
    (d) =>
      d.dok_id !== doc.dok_id && d.doktyp === doc.doktyp && d.rm === rm && d.organ === doc.organ,
  );
  // Same title first; utgiftsområden are sometimes renamed between years, so fall back to the
  // same utgiftsområde number.
  const key = titleKey(doc.titel);
  const number = areaNumber(doc.titel);
  const byId = (a: StoreDoc, b: StoreDoc) => a.dok_id.localeCompare(b.dok_id);
  const sameTitle = sameSlot.filter((d) => titleKey(d.titel) === key).sort(byId);
  const sameNumber = sameSlot
    .filter((d) => number !== null && areaNumber(d.titel) === number)
    .sort(byId);
  const candidates = [...sameTitle, ...sameNumber];
  return candidates[0] ?? null;
}

function areaNumber(titel: string): string | null {
  return /utgiftsområde\s+(\d+)/i.exec(titel)?.[1] ?? null;
}

export interface DocumentBrief {
  document_id: string;
  document_type: string;
  title: string;
  rm: string;
  date: string;
  url: string;
  /** False when the Riksdag has no full text for the document. */
  text_available: boolean;
  paragraph_count: number;
  terms: TermCount[];
  passages: Passage[];
}

export interface Brief {
  pair_id: string;
  promise_id: string;
  promise_title: string;
  document: DocumentBrief;
  /** Only for budget documents: `none` carries the reason. */
  prior_year:
    | { status: 'found'; document: DocumentBrief }
    | { status: 'none'; reason: string }
    | null;
}

export function buildDocumentBrief(
  meta: Omit<DocumentBrief, 'text_available' | 'paragraph_count' | 'terms' | 'passages'>,
  paragraphs: readonly Paragraph[] | null,
  terms: readonly string[],
  passageLimit: number,
  distinctive: readonly string[] = [],
): DocumentBrief {
  const ps = paragraphs ?? [];
  return {
    ...meta,
    text_available: paragraphs !== null && ps.length > 0,
    paragraph_count: ps.length,
    terms: countTerms(ps, terms),
    passages: findPassages(ps, terms, passageLimit, distinctive),
  };
}

/** Terms that occur in the document's amount-bearing passages (the scope of its amounts). */
export function scopeTerms(brief: DocumentBrief): string[] {
  const out = new Set<string>();
  for (const p of brief.passages) {
    if (p.amounts.length > 0) p.matched_terms.forEach((t) => out.add(t));
  }
  return [...out];
}

export function formatKr(n: number): string {
  return n.toLocaleString('sv-SE').replace(/ /g, ' ');
}

function renderAmount(a: Amount): string {
  const year = a.year ? ` ${a.year}` : '';
  return `${formatKr(a.kronor)} kr${year}${a.per_year ? ' per år' : ''}`;
}

function renderDocument(d: DocumentBrief, passageLabel: string): string[] {
  const lines: string[] = [];
  if (!d.text_available) {
    lines.push('Fulltext saknas hos Riksdagen för detta dokument; inget underlag att visa.');
    return lines;
  }
  const found = d.terms.filter((t) => t.count > 0);
  const zero = d.terms.filter((t) => t.count === 0);
  lines.push('(Sökord räknas från ordbörjan: "förlossning" räknar även "förlossningsvård".)');
  lines.push(
    `Sökord i fulltexten (${d.paragraph_count} stycken): ` +
      (found.length > 0 ? found.map((t) => `${t.term} ${t.count}`).join(', ') : 'inga träffar'),
  );
  if (zero.length > 0) {
    lines.push(`Förekommer inte i texten: ${zero.map((t) => t.term).join(', ')}`);
  }
  if (d.passages.length === 0) lines.push('Inga stycken med sökorden att visa.');
  d.passages.forEach((p, i) => {
    lines.push('');
    const where = [p.section, p.anslag && p.anslag !== p.section ? p.anslag : null]
      .filter(Boolean)
      .join(' / ');
    lines.push(`${passageLabel} ${i + 1} [${p.speaker}]${where ? ` under "${where}"` : ''}`);
    lines.push(`  "${p.text}"`);
    lines.push(`  (träffar: ${p.matched_terms.join(', ')})`);
    if (p.amounts.length > 0) lines.push(`  Belopp: ${p.amounts.map(renderAmount).join('; ')}`);
  });
  return lines;
}

/** Plain-text brief for the terminal. Contains facts only, never a label suggestion. */
export function renderBrief(b: Brief): string {
  const lines: string[] = ['--- UNDERLAG FRÅN FULLTEXTEN ---'];
  lines.push(...renderDocument(b.document, 'Stycke'));
  if (b.prior_year) {
    lines.push('', '--- FÖREGÅENDE ÅRS MOTSVARIGHET ---');
    if (b.prior_year.status === 'none') {
      lines.push(`Ingen: ${b.prior_year.reason}`);
    } else {
      const d = b.prior_year.document;
      lines.push(`[${d.document_type}] ${d.rm} ${d.title} (${d.date}) ${d.url}`);
      lines.push(...renderDocument(d, 'Tidigare stycke'));
    }
  }
  return lines.join('\n');
}

const termCountSchema = z.object({ term: z.string(), count: z.number() });
const amountSchema = z.object({
  raw: z.string(),
  kronor: z.number(),
  year: z.number().nullable(),
  per_year: z.boolean(),
  approx: z.boolean().optional(),
});
const passageSchema = z.object({
  section: z.string(),
  anslag: z.string().nullable(),
  speaker: z.string(),
  text: z.string(),
  matched_terms: z.array(z.string()),
  amounts: z.array(amountSchema),
});
const documentBriefSchema = z.object({
  document_id: z.string(),
  document_type: z.string(),
  title: z.string(),
  rm: z.string(),
  date: z.string(),
  url: z.string(),
  text_available: z.boolean(),
  paragraph_count: z.number(),
  terms: z.array(termCountSchema),
  passages: z.array(passageSchema),
});

/** Validates a brief file read by the labeller, so a stale or malformed one can be ignored. */
export const briefSchema: z.ZodType<Brief> = z.object({
  pair_id: z.string(),
  promise_id: z.string(),
  promise_title: z.string(),
  document: documentBriefSchema,
  prior_year: z
    .discriminatedUnion('status', [
      z.object({ status: z.literal('found'), document: documentBriefSchema }),
      z.object({ status: z.literal('none'), reason: z.string() }),
    ])
    .nullable(),
});
