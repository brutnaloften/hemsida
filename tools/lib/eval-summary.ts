/**
 * Readable summary ("Nyckelfynd") of a pair's evidence brief for the eval labeller
 * (hemsida-4np.17). Rules, not judgement: sentences where a distinctive promise term and a
 * kronor amount sit in the same or the next sentence, government first, committee next,
 * opposition collapsed to one line per party; a zero-hit line per promise term for both
 * years; terms highlighted with ANSI bold. Never a verdict or a suggested label.
 *
 * `buildSummary` runs at brief-build time on the parsed paragraphs and its result is stored in
 * the brief file; `renderSummary` is pure formatting and runs in the labeller.
 */
import { z } from 'zod';
import {
  formatKr,
  parseAmounts,
  sentenceSpans,
  termRegex,
  type Amount,
  type Brief,
} from './eval-brief.ts';
import type { Paragraph, SpeakerKind } from './riksdag-text.ts';

export interface Finding {
  kind: SpeakerKind;
  /** Party codes for reservations, special statements and motions. */
  parties: string[];
  section: string;
  /** Verbatim sentence containing the term, shortened around the first hit when long. */
  text: string;
  /** Distinctive terms found in the sentence (prefix-subsumed ones removed). */
  terms: string[];
  /** Amounts from the matched sentence or, failing that, the next one. */
  amounts: Amount[];
}

export interface TermLine {
  term: string;
  count: number;
  /** First sentence containing the term (only filled when the count is above zero). */
  sample: string | null;
}

export interface DocSummary {
  /** `amounts`: findings have amounts; `sentences`: term sentences only; `none`: no term sentence. */
  mode: 'amounts' | 'sentences' | 'none';
  /** Government / committee / inquiry findings. */
  main: Finding[];
  /** Opposition findings, one per party group. */
  opposition: Finding[];
  /** Opposition parties left out by the cap. */
  opposition_more: number;
  /** One entry per promise (curated) term after prefix merging. */
  terms: TermLine[];
}

const OPPOSITION: ReadonlySet<SpeakerKind> = new Set([
  'motion',
  'reservation',
  'special_statement',
]);
const MAX_MAIN = 3;
const MAX_OPPOSITION = 3;
const MAX_SENTENCE = 240;
/** A derived (non-curated) term is generic above this count or share of paragraphs. */
const GENERIC_MIN_COUNT = 15;
const GENERIC_SHARE = 0.02;

/** `a` is a word-start prefix of `b`, so counting `a` also counts `b` (förlossning/förlossningsvård). */
function subsumes(a: string, b: string): boolean {
  return a !== b && b.startsWith(a);
}

/** Keep one term per prefix family (the longest, most specific one) for scoring a sentence. */
function mostSpecific(terms: readonly string[]): string[] {
  return terms.filter((t) => !terms.some((o) => subsumes(t, o)));
}

/** Verbatim sentence of at most MAX_SENTENCE characters, shortened around `at` with ellipses. */
export function clip(sentence: string, at: number, max = MAX_SENTENCE): string {
  if (sentence.length <= max) return sentence;
  let start = Math.max(0, at - Math.floor(max / 3));
  const end0 = Math.min(sentence.length, start + max);
  start = Math.max(0, end0 - max);
  const sp = sentence.indexOf(' ', start);
  if (start > 0 && sp !== -1 && sp < at) start = sp + 1;
  let end = end0;
  const last = sentence.lastIndexOf(' ', end);
  if (end < sentence.length && last > at) end = last;
  return `${start > 0 ? '… ' : ''}${sentence.slice(start, end)}${end < sentence.length ? ' …' : ''}`;
}

interface Candidate {
  p: Paragraph;
  finding: Finding;
  score: number;
  /** 0 amount in the sentence itself, 1 in the next one, 2 none. */
  amountRank: number;
}

function speakerRank(kind: SpeakerKind): number {
  return kind === 'government' ? 0 : kind === 'committee' ? 1 : kind === 'inquiry' ? 2 : 3;
}

/**
 * Terms that carry signal for sentence matching: the curated ones (keywords and hand-picked
 * extras) if the promise has any, else the derived terms that are not generic (count above
 * GENERIC_MIN_COUNT and GENERIC_SHARE of the paragraphs).
 */
export function signalTerms(
  paragraphs: readonly Paragraph[],
  terms: readonly string[],
  curated: readonly string[],
): string[] {
  if (curated.length > 0) return [...curated];
  const cutoff = Math.max(GENERIC_MIN_COUNT, GENERIC_SHARE * paragraphs.length);
  return terms.filter((t) => {
    const re = termRegex(t);
    let n = 0;
    for (const p of paragraphs) n += p.text.match(re)?.length ?? 0;
    return n > 0 && n <= cutoff;
  });
}

export function buildSummary(
  paragraphs: readonly Paragraph[],
  terms: readonly string[],
  curated: readonly string[],
): DocSummary {
  const signal = signalTerms(paragraphs, terms, curated);
  const regexes = signal.map((t) => [t, termRegex(t)] as const);
  const body = paragraphs.filter((p) => !p.heading);

  // Hit count and first sentence of every signal term: rarity weighting and the zero-hit lines.
  const counts = new Map<string, number>();
  const samples = new Map<string, string>();
  for (const [t, re] of regexes) {
    let n = 0;
    for (const p of body) {
      re.lastIndex = 0;
      const hits = p.text.match(re)?.length ?? 0;
      n += hits;
      if (hits > 0 && !samples.has(t)) {
        re.lastIndex = 0;
        const m = re.exec(p.text)!;
        const sp = sentenceSpans(p.text).find((s) => m.index >= s.start && m.index <= s.end)!;
        samples.set(t, clip(p.text.slice(sp.start, sp.end), m.index - sp.start));
      }
    }
    counts.set(t, n);
  }
  const weight = (t: string) => 1 / (1 + Math.log(counts.get(t) || 1));

  const candidates: Candidate[] = [];
  for (const p of body) {
    const sentences = sentenceSpans(p.text).map((s) => p.text.slice(s.start, s.end));
    const amounts = sentences.map((s) => parseAmounts(s));
    sentences.forEach((sentence, i) => {
      const matched: string[] = [];
      let at = Infinity;
      for (const [t, re] of regexes) {
        re.lastIndex = 0;
        const m = re.exec(sentence);
        if (m) {
          matched.push(t);
          at = Math.min(at, m.index);
        }
      }
      if (matched.length === 0) return;
      const own = amounts[i]!;
      const next = amounts[i + 1] ?? [];
      const specific = mostSpecific(matched);
      const clipped = clip(sentence, at);
      candidates.push({
        p,
        amountRank: own.length > 0 ? 0 : next.length > 0 ? 1 : 2,
        score: specific.reduce((s, t) => s + weight(t), 0),
        finding: {
          kind: p.speaker.kind,
          parties: p.speaker.parties,
          section: p.section,
          text: clipped,
          terms: specific,
          // Amounts of the matched sentence that are visible in the shortened quote; for the
          // government and committee the next sentence's amounts when this one has none.
          amounts:
            own.length > 0 || OPPOSITION.has(p.speaker.kind)
              ? own.filter((a) => clipped.includes(a.raw))
              : next,
        },
      });
    });
  }

  const byScore = (a: Candidate, b: Candidate) =>
    a.amountRank - b.amountRank || b.score - a.score || a.p.index - b.p.index;
  const seen = new Set<string>();
  const fresh = (c: Candidate) => {
    const key = c.finding.text.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };

  const own = candidates.filter((c) => !OPPOSITION.has(c.finding.kind));
  const withAmount = own.filter((c) => c.amountRank < 2);
  const pool = withAmount.length > 0 ? withAmount : own;
  const mode: DocSummary['mode'] =
    withAmount.length > 0 ? 'amounts' : own.length > 0 ? 'sentences' : 'none';
  // Government first, committee next, then the rest: the best candidate per speaker kind.
  const main: Finding[] = [];
  const kinds = [...new Set(pool.map((c) => c.finding.kind))].sort(
    (a, b) => speakerRank(a) - speakerRank(b),
  );
  for (const kind of kinds) {
    const best = pool
      .filter((c) => c.finding.kind === kind)
      .sort(byScore)
      .find(fresh);
    if (best && main.length < MAX_MAIN) main.push(best.finding);
  }

  // Opposition: the best sentence per party group (more and rarer terms first, then amounts).
  const byTerms = (a: Candidate, b: Candidate) =>
    b.score - a.score || a.amountRank - b.amountRank || a.p.index - b.p.index;
  const perParty = new Map<string, Candidate>();
  for (const c of candidates.filter((x) => OPPOSITION.has(x.finding.kind))) {
    const key = c.finding.parties.join('+') || c.p.speaker.label;
    const cur = perParty.get(key);
    if (!cur || byTerms(c, cur) < 0) perParty.set(key, c);
  }
  const oppAll = [...perParty.values()].sort(
    (a, b) => byTerms(a, b) || a.finding.parties.join().localeCompare(b.finding.parties.join()),
  );
  const opposition = oppAll
    .filter(fresh)
    .slice(0, MAX_OPPOSITION)
    .map((c) => c.finding);

  // Promise (curated) terms, prefix-merged: a longer term is dropped when the shorter one has no
  // hits (it cannot occur either); when the shorter has hits both stay, so the zero shows.
  const uniq = [...new Set(curated.length > 0 ? curated : signal)];
  const lineTerms = uniq.filter(
    (t) => !uniq.some((o) => subsumes(o, t) && (counts.get(o) ?? 0) === 0),
  );
  return {
    mode,
    main,
    opposition,
    opposition_more: Math.max(0, oppAll.length - opposition.length),
    terms: lineTerms.map((term) => ({
      term,
      count: counts.get(term) ?? 0,
      sample: samples.get(term) ?? null,
    })),
  };
}

const findingSchema = z.object({
  kind: z.enum([
    'government',
    'committee',
    'reservation',
    'special_statement',
    'motion',
    'inquiry',
    'other',
  ]),
  parties: z.array(z.string()),
  section: z.string(),
  text: z.string(),
  terms: z.array(z.string()),
  amounts: z.array(
    z.object({
      raw: z.string(),
      kronor: z.number(),
      year: z.number().nullable(),
      per_year: z.boolean(),
    }),
  ),
});
const docSummarySchema = z.object({
  mode: z.enum(['amounts', 'sentences', 'none']),
  main: z.array(findingSchema),
  opposition: z.array(findingSchema),
  opposition_more: z.number(),
  terms: z.array(z.object({ term: z.string(), count: z.number(), sample: z.string().nullable() })),
});

/** Optional `summary` key of a brief file (written by build-eval-briefs.ts). */
export const briefSummarySchema = z.object({
  summary: z.object({ current: docSummarySchema, prior: docSummarySchema.nullable() }).optional(),
});
export type BriefSummary = NonNullable<z.infer<typeof briefSummarySchema>['summary']>;

// ---------------------------------------------------------------------------------------------
// Rendering

export interface RenderOptions {
  /** Terminal width in columns. */
  width: number;
  /** Highlight matched terms with ANSI bold. */
  color: boolean;
}

/** Colour is on for a TTY unless NO_COLOR is set (any non-empty value, per no-color.org). */
export function useColor(
  isTTY: boolean | undefined,
  env: Record<string, string | undefined>,
): boolean {
  return Boolean(isTTY) && !env.NO_COLOR;
}

const BOLD = '\u001b[1m';
const UNBOLD = '\u001b[22m';
const ANSI_RE = /\u001b\[[0-9;]*m/g;

export function visibleLength(s: string): number {
  return s.replace(ANSI_RE, '').length;
}

/** Wrap on spaces to `width` visible columns; continuation lines get `indent` spaces. */
export function wrap(text: string, width: number, indent: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const w of text.split(' ')) {
    if (line !== '' && visibleLength(line) + 1 + visibleLength(w) > width) {
      lines.push(line);
      line = ' '.repeat(indent) + w;
    } else {
      line = line === '' ? w : `${line} ${w}`;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

/** Bold every occurrence of the terms (extended to the end of the word). */
export function highlight(text: string, terms: readonly string[], color: boolean): string {
  if (!color || terms.length === 0) return text;
  const ranges: [number, number][] = [];
  for (const t of terms) {
    for (const m of text.matchAll(termRegex(t))) {
      let end = m.index + m[0].length;
      while (end < text.length && /[\p{L}\p{N}-]/u.test(text[end]!)) end++;
      ranges.push([m.index, end]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  let out = '';
  let pos = 0;
  for (const [s, e] of merged) {
    out += text.slice(pos, s) + BOLD + text.slice(s, e) + UNBOLD;
    pos = e;
  }
  return out + text.slice(pos);
}

/** A budget riksmöte "2025/26" is the budget year 2026; anything else is shown as written. */
export function yearLabel(rm: string, date: string, budget: boolean): string {
  const split = /^(\d{4})\/(\d{2})$/.exec(rm);
  if (split) return budget ? String(Number(split[1]) + 1) : rm;
  return rm || date.slice(0, 4) || '?';
}

const KIND_LABEL: Record<SpeakerKind, string> = {
  government: 'Regeringen',
  committee: 'Utskottet',
  inquiry: 'Utredningen',
  reservation: 'reservation',
  special_statement: 'särskilt yttrande',
  motion: 'motion',
  other: 'Bilaga',
};

function speakerLabel(f: Finding): string {
  if (OPPOSITION.has(f.kind)) {
    const who = f.parties.length > 0 ? f.parties.join('+') : '?';
    return `${who} (${KIND_LABEL[f.kind]})`;
  }
  return KIND_LABEL[f.kind];
}

function amountsLabel(f: Finding): string {
  const shown = f.amounts
    .slice(0, 3)
    .map((a) => `${formatKr(a.kronor)} kr${a.per_year ? '/år' : ''}`);
  const more = f.amounts.length - shown.length;
  return shown.join(', ') + (more > 0 ? ` +${more}` : '');
}

interface Row {
  year: string;
  who: string;
  amounts: string;
  text: string;
  terms: string[];
}

function rowsOf(year: string, findings: readonly Finding[]): Row[] {
  return findings.map((f) => ({
    year,
    who: speakerLabel(f),
    amounts: amountsLabel(f),
    text: f.text,
    terms: f.terms,
  }));
}

function renderRows(rows: readonly Row[], o: RenderOptions): string[] {
  const whoW = Math.max(0, ...rows.map((r) => r.who.length));
  const amW = Math.max(0, ...rows.map((r) => r.amounts.length));
  const yearW = Math.max(0, ...rows.map((r) => r.year.length));
  const out: string[] = [];
  for (const r of rows) {
    const head =
      `  ${r.year.padEnd(yearW)}  ${r.who.padEnd(whoW)}  ` +
      (amW > 0 ? `${r.amounts.padEnd(amW)}  ` : '');
    const room = o.width - head.length;
    const quote = `«${highlight(r.text, r.terms, o.color)}»`;
    if (room >= 30) {
      const lines = wrap(quote, room, 0);
      out.push(head + lines[0]!, ...lines.slice(1).map((l) => ' '.repeat(head.length) + l));
    } else {
      out.push(head.trimEnd());
      out.push(...wrap(quote, o.width - 6, 0).map((l) => `      ${l}`));
    }
  }
  return out;
}

/** Wrap `text` under a left margin of `margin` spaces, continuation lines indented 4 more. */
function indented(text: string, margin: number, width: number): string[] {
  return wrap(text, width - margin, 4).map((l) => ' '.repeat(margin) + l);
}

const hits = (n: number) => `${n} ${n === 1 ? 'träff' : 'träffar'}`;

function zeroLines(
  cur: DocSummary,
  prior: DocSummary | null,
  curYear: string,
  priorYear: string,
  o: RenderOptions,
): string[] {
  const out: string[] = [];
  const priorByTerm = new Map(prior?.terms.map((t) => [t.term, t]));
  for (const t of cur.terms) {
    const p = priorByTerm.get(t.term);
    if (t.count > 0 && (!p || p.count > 0)) continue;
    let line: string;
    let extra: string | null = null;
    if (!prior || !p) {
      line = `«${t.term}»: ${hits(t.count)}`;
    } else if (t.count === 0 && p.count === 0) {
      line = `«${t.term}»: 0 träffar (båda åren)`;
    } else {
      line = `«${t.term}»: ${hits(t.count)} ${curYear}, ${hits(p.count)} ${priorYear}`;
      const withHits = t.count > 0 ? t : p;
      if (withHits.sample) {
        extra = `${t.count > 0 ? curYear : priorYear}: «${highlight(withHits.sample, [t.term], o.color)}»`;
      }
    }
    out.push(...indented(line, 2, o.width));
    if (extra) out.push(...indented(extra, 6, o.width));
  }
  return out;
}

/**
 * The Nyckelfynd block, or null when the brief has no stored summary (an older brief: the
 * caller falls back to the full detail view). Facts only; never a suggested label.
 */
export function renderSummary(
  brief: Brief,
  summary: BriefSummary | undefined,
  o: RenderOptions,
): string | null {
  if (!summary) return null;
  const d = brief.document;
  const lines = ['NYCKELFYND (utan bedömning)'];
  if (!d.text_available) {
    lines.push('  Fulltext saknas hos Riksdagen för detta dokument; inget underlag att visa.');
    return lines.join('\n');
  }
  const budget = brief.prior_year !== null;
  const curYear = yearLabel(d.rm, d.date, budget);
  const priorDoc = brief.prior_year?.status === 'found' ? brief.prior_year.document : null;
  const prior = priorDoc?.text_available ? summary.prior : null;
  const priorYear = priorDoc ? yearLabel(priorDoc.rm, priorDoc.date, true) : '';

  const rows = [
    ...rowsOf(curYear, summary.current.main),
    ...(prior ? rowsOf(priorYear, prior.main) : []),
    ...rowsOf(curYear, summary.current.opposition),
    ...(prior ? rowsOf(priorYear, prior.opposition) : []),
  ];
  if (rows.length === 0) lines.push('  Inga meningar med löftets sökord hittades i texten.');
  else lines.push(...renderRows(rows, o));
  const more = summary.current.opposition_more + (prior?.opposition_more ?? 0);
  if (more > 0) lines.push(`  (+${more} oppositionspartier med träff i detaljvyn)`);

  lines.push(...zeroLines(summary.current, prior, curYear, priorYear, o));
  if (brief.prior_year?.status === 'none') {
    lines.push(
      ...indented(`Föregående år: ingen motsvarighet (${brief.prior_year.reason}).`, 2, o.width),
    );
  } else if (priorDoc && !priorDoc.text_available) {
    lines.push('  Föregående år: fulltext saknas hos Riksdagen.');
  }
  lines.push(
    ...indented(
      'Sökord räknas från ordbörjan: "skatt" räknar även "skatten" och "skattelättnad".',
      2,
      o.width,
    ),
  );
  return lines.join('\n');
}
