/**
 * Candidate format and validation for party-manifesto promises (logic; CLI in
 * tools/validate-manifesto-candidates.ts, workflow in docs/manifesto-extraction.md).
 *
 * Extraction is done by a Claude Code subagent, not the Anthropic API, so
 * nothing here calls a model. This module defines the rules the subagent
 * follows, the file format it writes, and the checks that file must pass.
 * Everything party-specific is derived from the source record.
 */

import { z } from 'zod';
import { COMMITTEES, slugify } from './tido-extract.ts';
import {
  PROMISE_TYPES,
  promiseSchema,
  type PromiseRecord,
  type Source,
  type Verdict,
} from './schema.ts';

export { COMMITTEES };

/** Instructions for the extraction subagent. Adapted from SYSTEM in tido-extract.ts. */
export const EXTRACTION_RULES = `You extract election promises from a Swedish party manifesto (valmanifest) so a human can review them as candidates.
A promise is a concrete commitment by the party to do, change, investigate, fund or achieve something if it gains influence. Skip background text, analysis and descriptive passages.
Rules:
- One candidate per distinct commitment; split bullet lists whose items are separate commitments, merge sentences that restate the same one.
- Skip pure value statements ("vi tror på frihet") and criticism of opponents. If such a passage still contains a commitment too unspecific to assess, keep it with type "vague".
- Write title, description and area in Swedish. Keep descriptions faithful to the text; do not add outcomes or judgements.
- "page" is the page number in the PDF (1-based, counting the cover as page 1), not a printed page label.
- "quote" must be verbatim from that page (copy it exactly; it is checked mechanically against the page text).
- "section" is the manifesto's own section heading above the promise. It is review-only context.
- type: ${PROMISE_TYPES.join(', ')}. legislative = needs a law change; inquiry = the promise is to investigate (utreda); budget = an amount or spending change; outcome = a measurable result; other_action = government action outside the Riksdag; vague = too unspecific to assess.
- committee: the Riksdag committee most likely to handle the matter, one of: ${COMMITTEES.join(', ')}.
- keywords: 3-6 Swedish terms useful for searching Riksdag documents.
- Do not link to the Tidö agreement here; that is a separate step.
Prefer recall over precision, but do not invent promises.`;

/** What the extraction subagent writes for one promise (before ids and roles are derived). */
export const rawManifestoCandidateSchema = z.object({
  slug: z.string().describe('Short lowercase ASCII slug with hyphens'),
  section: z.string().describe("The manifesto's own section heading (review-only)"),
  title: z.string(),
  description: z.string(),
  page: z.number().int().positive(),
  quote: z.string(),
  type: z.string(),
  area: z.string(),
  committee: z.string(),
  keywords: z.array(z.string()),
});
export type RawManifestoCandidate = z.infer<typeof rawManifestoCandidateSchema>;

/** Link proposal to Tidö promises, filled in by the linking step. `outcome` is validated elsewhere. */
export const candidateLinkSchema = z.object({
  promises: z.array(z.string()),
  outcome: z.string(),
  note: z.string().nullable(),
  rationale: z.string(),
});

/** One entry of src/data/2022-2026/candidates/<source-id>.json. */
export const manifestoEntrySchema = z.object({
  section: z.string(),
  promise: promiseSchema,
  link: candidateLinkSchema.optional(),
});
export type ManifestoEntry = z.infer<typeof manifestoEntrySchema>;

type Role = 'government' | 'support' | 'opposition';

/** Party roles per term. Parties not listed are in opposition. */
export const TERM_ROLES: Record<string, Record<string, Role>> = {
  '2022-2026': { M: 'government', KD: 'government', L: 'government', SD: 'support' },
};

export function rolesFor(term: string, parties: readonly string[]): Record<string, Role> {
  const table = TERM_ROLES[term];
  if (!table) throw new Error(`no role table for term ${term}; add it to TERM_ROLES`);
  return Object.fromEntries(parties.map((p) => [p, table[p] ?? 'opposition']));
}

/** `val2022-l` for a manifesto source dated 2022 with party L. */
export function idPrefix(source: Pick<Source, 'parties' | 'date'>): string {
  if (source.parties.length !== 1) {
    throw new Error(`manifesto source must have exactly one party, got [${source.parties}]`);
  }
  return `val${source.date.slice(0, 4)}-${source.parties[0].toLowerCase()}`;
}

/** Turn a raw candidate into a schema-valid draft promise (verdict unassessed). Throws on invalid data. */
export function toManifestoEntry(
  raw: RawManifestoCandidate,
  source: Pick<Source, 'id' | 'parties' | 'date'>,
  taken: Set<string>,
  verdictDate: string,
  term = '2022-2026',
): ManifestoEntry {
  if (!(PROMISE_TYPES as readonly string[]).includes(raw.type)) {
    throw new Error(`unknown type "${raw.type}"`);
  }
  const base = `${idPrefix(source)}-${slugify(raw.slug) || slugify(raw.title)}`;
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
  const verdict: Verdict = { value: 'unassessed', reasoning: '', date: verdictDate, history: [] };
  const promise: PromiseRecord = promiseSchema.parse({
    id,
    term,
    title: raw.title.trim(),
    description: raw.description.trim(),
    source: { id: source.id, page: raw.page, quote: raw.quote.trim() || undefined },
    parties: [...source.parties],
    roles: rolesFor(term, source.parties),
    type: raw.type,
    area: raw.area.trim(),
    committee: (COMMITTEES as readonly string[]).includes(raw.committee)
      ? raw.committee
      : undefined,
    keywords: raw.keywords.map((k) => k.trim()).filter(Boolean),
    verdict,
    evidence: [],
  });
  return { section: raw.section.trim(), promise };
}

/** Normalise PDF text or a quote for comparison: ligatures, quotes, dashes, hyphenation, whitespace. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/­/g, '')
    .replace(/[‘’‚`´]/g, "'")
    .replace(/[“”„«»]/g, '"')
    .replace(/[‐‑–—−]/g, '-')
    .replace(/(\p{L})-[ \t]*\r?\n\s*(\p{L})/gu, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strip every hyphen and space: the fallback when a real hyphen was split by a line break. */
function loose(s: string): string {
  return normalizeText(s).replace(/[-\s]/g, '');
}

/** True if the quote appears in the page text after normalisation. */
export function quoteMatches(pageText: string, quote: string): boolean {
  const q = normalizeText(quote);
  if (q === '') return false;
  if (normalizeText(pageText).includes(q)) return true;
  return loose(pageText).includes(loose(quote));
}

/**
 * Split pdftotext output into 1-based pages. pdftotext ends every page with a form feed,
 * so the trailing empty piece is dropped.
 */
export function splitPages(text: string): string[] {
  const pages = text.split('\f');
  if (pages.length > 0 && pages[pages.length - 1].trim() === '') pages.pop();
  return pages;
}

export interface ValidationContext {
  sourceId: string;
  /** Ids of existing files in promises/. */
  existingIds: ReadonlySet<string>;
  /** Ids of Tidö promises that links may point at. */
  tidoIds: ReadonlySet<string>;
  /** 1-based page texts (index 0 = page 1), or null to skip the quote check. */
  pages: readonly string[] | null;
  /** Expected id prefix, e.g. val2022-l. Skipped when omitted. */
  prefix?: string;
}

export interface ValidationResult {
  errors: string[];
  warnings: string[];
  count: number;
  linked: number;
}

/** Validate a parsed candidate file. Never throws on bad data; reports errors instead. */
export function validateCandidates(data: unknown, ctx: ValidationContext): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!Array.isArray(data)) {
    return { errors: ['candidate file must be a JSON array'], warnings, count: 0, linked: 0 };
  }
  const seen = new Set<string>();
  let linked = 0;
  for (const [i, item] of data.entries()) {
    const parsed = manifestoEntrySchema.safeParse(item);
    const label = `[${i}]`;
    if (!parsed.success) {
      const issues = parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`);
      errors.push(`${label} schema: ${issues.join('; ')}`);
      continue;
    }
    const { promise, link } = parsed.data;
    const where = `${label} ${promise.id}`;
    if (promise.source.id !== ctx.sourceId) {
      errors.push(`${where}: source.id is "${promise.source.id}", expected "${ctx.sourceId}"`);
    }
    if (ctx.prefix && !promise.id.startsWith(`${ctx.prefix}-`)) {
      errors.push(`${where}: id must start with "${ctx.prefix}-"`);
    }
    if (seen.has(promise.id)) errors.push(`${where}: duplicate id in candidate file`);
    seen.add(promise.id);
    if (ctx.existingIds.has(promise.id)) {
      errors.push(`${where}: id collides with an existing promise file`);
    }

    const { page, quote } = promise.source;
    if (ctx.pages) {
      if (page === undefined || quote === undefined) {
        errors.push(`${where}: source.page and source.quote are required for the quote check`);
      } else if (page > ctx.pages.length) {
        errors.push(`${where}: page ${page} is beyond the ${ctx.pages.length} pages of text`);
      } else if (!quoteMatches(ctx.pages[page - 1], quote)) {
        errors.push(`${where}: quote is not a verbatim substring of page ${page}: "${quote}"`);
      }
    }

    if (link) {
      linked++;
      for (const id of link.promises) {
        if (!ctx.tidoIds.has(id)) errors.push(`${where}: linked Tidö promise "${id}" not found`);
      }
    }
  }
  if (!ctx.pages) warnings.push('quote check skipped (no --pdf or --pages-text)');
  return { errors, warnings, count: data.length, linked };
}
