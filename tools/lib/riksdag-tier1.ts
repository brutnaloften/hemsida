/**
 * Tier-1 extraction of Riksdag documents (hemsida-3fu): the part of a document that can show a promise
 * being acted on, as opposed to the 300k-token body of an inquiry. Works on the raw `.text` response
 * cached by `riksdag-text.ts`.
 *
 * - dir: everything (short).
 * - bet: the decision outcome from the XML plus the committee's own sections (förslag till riksdagsbeslut,
 *   ställningstagande, pågående arbete, ...). Opposition text and annexes are dropped.
 * - sou / ds / prop: sections picked from the table of contents (sammanfattning, förslag till
 *   riksdagsbeslut). Those documents are PDF conversions whose headings carry only font classes, so the
 *   structure comes from the ToC rows that link to `#page_N` (hemsida-z47). Without a usable ToC the
 *   start of the document is kept and `structure` says `none`.
 */
import {
  decodeEntities,
  annotateParagraphs,
  parseRiksdagText,
  type Paragraph,
} from './riksdag-text.ts';

export type Tier1Stage = 'definitive' | 'preparatory' | 'background';
export type BetOutcome = 'bifall' | 'avslag' | 'noted' | 'other' | 'unknown';
export type Structure = 'toc' | 'headings' | 'none';

export interface Tier1Section {
  heading: string;
  text: string;
  est_tokens: number;
}

export interface Tier1Doc {
  dok_id: string;
  doktyp: string;
  stage: Tier1Stage;
  /** Only for bet. */
  outcome?: BetOutcome;
  structure: Structure;
  sections: Tier1Section[];
  est_tokens: number;
}

const CHARS_PER_TOKEN = 3;
/** Fallback when a sou/ds/prop has no ToC: this much of the start of the body (after the front matter). */
export const FALLBACK_TOKENS = 6000;

export const tokensOf = (s: string): number => Math.round(s.length / CHARS_PER_TOKEN);

/** Decision text of a betänkande (`beslutssammanfattningusk`), or null when the response has none. */
export function betDecisionText(raw: string): string | null {
  const m =
    /<kod>beslutssammanfattningusk<\/kod>\s*<namn>[^<]*<\/namn>\s*<text>([\s\S]*?)<\/text>/.exec(
      raw,
    );
  return m ? decodeEntities(m[1]!).replace(/\s+/g, ' ').trim() || null : null;
}

export function classifyOutcome(decision: string | null): BetOutcome {
  if (!decision) return 'unknown';
  const d = decision.toLowerCase();
  if (/^(delvis )?bifall till (proposition|utskottets|regeringens|förslaget)/.test(d))
    return 'bifall';
  if (/^avslag på/.test(d)) return 'avslag';
  if (/läggs till handlingarna|^utskottet anmäler/.test(d)) return 'noted';
  if (/^bifall/.test(d) || /^riksdagen (beslutar|antar|godkänner)/.test(d)) return 'bifall';
  return 'other';
}

/** A decision that moves something is definitive; everything else a committee does is background. */
export function stageOf(doktyp: string, outcome?: BetOutcome): Tier1Stage {
  if (doktyp === 'bet') return outcome === 'bifall' ? 'definitive' : 'background';
  return 'preparatory';
}

// --- bet ---------------------------------------------------------------------------------------

const BET_KEEP =
  /förslag till riksdagsbeslut|utskottets förslag|ställningstagande|pågående arbete|^propositionen$|skrivelsen|redogörelsen|tillkännagivanden som redovisas/i;
const BET_SPEAKERS = new Set(['committee', 'government', 'inquiry', 'other']);

function groupBySection(ps: Paragraph[]): Tier1Section[] {
  const out: Tier1Section[] = [];
  for (const p of ps) {
    const last = out.at(-1);
    if (last && last.heading === p.section) {
      last.text += `\n${p.text}`;
      last.est_tokens = tokensOf(last.text);
    } else out.push({ heading: p.section, text: p.text, est_tokens: tokensOf(p.text) });
  }
  return out;
}

export function extractBet(raw: string): { sections: Tier1Section[]; structure: Structure } {
  const ps = annotateParagraphs(parseRiksdagText(raw), 'bet').filter(
    (p) => !p.heading && p.speaker.label !== 'Bilaga' && BET_SPEAKERS.has(p.speaker.kind),
  );
  // Budget bets decide per `Anslaget N:N`, so those paragraphs are kept whatever the heading says.
  const kept = ps.filter((p) => BET_KEEP.test(p.section) || p.anslag !== null);
  if (kept.length) return { sections: groupBySection(kept), structure: 'headings' };
  // No recognisable headings: keep everything the committee or government says.
  return {
    sections: groupBySection(ps),
    structure: ps.some((p) => p.section) ? 'headings' : 'none',
  };
}

// --- sou / ds / prop ---------------------------------------------------------------------------

export interface TocEntry {
  title: string;
  page: number;
}

const UNNUMBERED_TOP =
  /^(sammanfattning|summary|författningsförslag|förslag till|referenser|bilaga|förord|innehåll|förkortningar|beteckningar|kommittédirektiv|lagrådsremissens|betänkandets|promemorians|lagrådets|propositionens|författningskommentar|bilagor)/;

function tocTitle(t: string): string {
  return t
    .replace(/[\s.…]+$/, '')
    .replace(/^\d+(\.\d+)*\s*/, '')
    .trim()
    .toLowerCase();
}

/** Top-level ToC entries (chapters, plus the unnumbered front/back matter) with their page ids, in page order. */
export function parseToc(html: string): TocEntry[] {
  const entries: TocEntry[] = [];
  for (const row of html.match(/<TR>[\s\S]*?<\/TR>/g) ?? []) {
    const anchors = [...row.matchAll(/<A href="#page_(\d+)">([^<]*)<\/A>/g)].map(
      (m) => [Number(m[1]), m[2]!] as const,
    );
    const lead = anchors.find(([, t]) => t.includes('....'));
    if (!lead) continue;
    let num = '';
    for (const [, t] of anchors) {
      if (t.includes('....')) break;
      if (/^(Bilaga\s*)?\d+(\.\d+)*$/.test(t.trim())) num = t.trim();
    }
    const title = tocTitle(lead[1]);
    const top =
      num.startsWith('Bilaga') ||
      (num !== '' && !num.includes('.')) ||
      (num === '' && UNNUMBERED_TOP.test(title));
    if (top && title) entries.push({ title, page: lead[0] });
  }
  return entries.sort((a, b) => a.page - b.page);
}

/** Paragraphs of each `<DIV id="page_N">` of the converted PDF. */
export function pagesOf(html: string): Map<number, string> {
  const parts = html.split(/<DIV id="page_(\d+)">/);
  const pages = new Map<number, string>();
  for (let i = 1; i < parts.length; i += 2) pages.set(Number(parts[i]), parts[i + 1]!);
  return pages;
}

const SUMMARY = /^(sammanfattning|propositionens huvudsakliga innehåll)$/;
const DECISION = /^förslag till riksdagsbeslut$/;

export function wanted(doktyp: string, title: string): boolean {
  if (SUMMARY.test(title)) return true;
  return doktyp === 'prop' && DECISION.test(title);
}

function htmlOf(raw: string): string {
  const m = /<html>([\s\S]*)<\/html>/.exec(raw);
  return m ? decodeEntities(m[1]!) : raw;
}

export function extractConverted(
  raw: string,
  doktyp: string,
): { sections: Tier1Section[]; structure: Structure } {
  const html = htmlOf(raw);
  const toc = parseToc(html);
  const pages = pagesOf(html);
  const last = Math.max(0, ...pages.keys());
  const sections: Tier1Section[] = [];
  if (toc.length >= 2) {
    toc.forEach((e, i) => {
      if (!wanted(doktyp, e.title)) return;
      const end = toc[i + 1]?.page ?? last + 1;
      const body = [...pages.entries()]
        .filter(([n]) => n >= e.page && n < end)
        .map(([, h]) =>
          parseRiksdagText(h)
            .map((p) => p.text)
            .join('\n'),
        )
        .join('\n')
        .trim();
      if (body) sections.push({ heading: e.title, text: body, est_tokens: tokensOf(body) });
    });
    if (sections.length) return { sections, structure: 'toc' };
  }
  // No ToC or no wanted section in it: the start of the body, flagged.
  const text = parseRiksdagText(raw)
    .map((p) => p.text)
    .join('\n')
    .slice(0, FALLBACK_TOKENS * CHARS_PER_TOKEN);
  return {
    sections: text ? [{ heading: '(början av dokumentet)', text, est_tokens: tokensOf(text) }] : [],
    structure: 'none',
  };
}

// --- entry point -------------------------------------------------------------------------------

export function extractTier1(dokId: string, doktyp: string, raw: string): Tier1Doc {
  let outcome: BetOutcome | undefined;
  let r: { sections: Tier1Section[]; structure: Structure };
  if (doktyp === 'bet') {
    outcome = classifyOutcome(betDecisionText(raw));
    r = extractBet(raw);
  } else if (doktyp === 'dir') {
    const text = parseRiksdagText(raw)
      .map((p) => p.text)
      .join('\n');
    r = {
      sections: text ? [{ heading: '', text, est_tokens: tokensOf(text) }] : [],
      structure: 'none',
    };
  } else r = extractConverted(raw, doktyp);
  return {
    dok_id: dokId,
    doktyp,
    stage: stageOf(doktyp, outcome),
    ...(outcome ? { outcome } : {}),
    structure: r.structure,
    sections: r.sections,
    est_tokens: r.sections.reduce((n, s) => n + s.est_tokens, 0),
  };
}
