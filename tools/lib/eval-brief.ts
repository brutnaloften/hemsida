/**
 * Per-pair evidence briefs for the eval labeller (hemsida-4np.16). The labeller cannot judge
 * a promise/document pair from the stored snippet, so for each pair we read the document's
 * full text and report facts only: how often each term occurs (zero counts stated
 * explicitly), verbatim passages with section and speaker, parsed amounts, and for budget
 * documents the same for the prior-year counterpart. Never a suggested label or verdict.
 */
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
}

const AMOUNT_RE =
  /(\d{1,3}(?: \d{3})+|\d+(?:,\d+)?)\s*(miljarder|miljard|miljoner|miljon|tusen)?\s*(kronor|kr)\b/giu;

const UNIT: Record<string, number> = {
  miljarder: 1e9,
  miljard: 1e9,
  miljoner: 1e6,
  miljon: 1e6,
  tusen: 1e3,
};

function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=[A-ZÅÄÖ0-9])/u);
}

/** Parse kronor amounts ("1 000 000 000 kronor", "127 miljarder kronor") with their year. */
export function parseAmounts(text: string): Amount[] {
  const out: Amount[] = [];
  for (const sentence of sentencesOf(text)) {
    const year = /\b(20\d\d)\b/.exec(sentence)?.[1];
    const perYear = /\bper år\b|\bårligen\b/i.test(sentence);
    for (const m of sentence.matchAll(AMOUNT_RE)) {
      const num = parseFloat(m[1]!.replace(/ /g, '').replace(',', '.'));
      const unit = m[2] ? UNIT[m[2].toLowerCase()]! : 1;
      out.push({
        raw: m[0],
        kronor: Math.round(num * unit),
        year: year ? Number(year) : null,
        per_year: perYear,
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

/**
 * Paragraphs that mention at least one term, best first (most distinct terms, then document
 * order), at most `limit`, returned in document order. Headings are skipped.
 */
export function findPassages(
  paragraphs: readonly Paragraph[],
  terms: readonly string[],
  limit: number,
): Passage[] {
  const regexes = terms.map((t) => [t, termRegex(t)] as const);
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
      return { p, matched, at };
    })
    .filter((h) => h.matched.length > 0);
  // Rank by rarity-weighted term matches so a very common term (e.g. "nationell") does not
  // outweigh a rare, specific one.
  const counts = new Map(countTerms(paragraphs, terms).map((t) => [t.term, t.count]));
  const weight = (m: string[]) => m.reduce((s, t) => s + 1 / (1 + Math.log(counts.get(t) || 1)), 0);
  hits.sort((a, b) => weight(b.matched) - weight(a.matched) || a.p.index - b.p.index);
  return hits
    .slice(0, limit)
    .sort((a, b) => a.p.index - b.p.index)
    .map(({ p, matched, at }) => ({
      section: p.section,
      anslag: p.anslag,
      speaker: p.speaker.label,
      text: excerpt(p.text, at),
      matched_terms: matched,
      amounts: parseAmounts(p.text),
    }));
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
  const candidates = [
    ...sameSlot.filter((d) => titleKey(d.titel) === key),
    ...sameSlot.filter((d) => number !== null && areaNumber(d.titel) === number),
  ];
  candidates.sort((a, b) => a.dok_id.localeCompare(b.dok_id));
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
): DocumentBrief {
  const ps = paragraphs ?? [];
  return {
    ...meta,
    text_available: paragraphs !== null && ps.length > 0,
    paragraph_count: ps.length,
    terms: countTerms(ps, terms),
    passages: findPassages(ps, terms, passageLimit),
  };
}

function formatKr(n: number): string {
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
