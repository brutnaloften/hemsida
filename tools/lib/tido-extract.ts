/**
 * Candidate extraction from the Tidöavtalet PDF (logic; CLI in
 * tools/extract-tidoavtalet.ts). Kept separate so it can be tested with a
 * mocked client and no API key.
 *
 * The whole PDF is sent as a document block (cached) for every chunk, and the
 * prompt restricts extraction to a page range. That keeps page references
 * reliable without a PDF-splitting dependency, and makes each chunk an
 * independently resumable unit.
 */

import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { loggedParse } from './claude.ts';
import { PROMISE_TYPES, promiseSchema, type PromiseRecord } from './schema.ts';

export const MODEL = 'claude-opus-5-5';
export const SOURCE_ID = 'tidoavtalet';
export const TERM = '2022-2026';

/** Riksdag committee codes the model may pick from (matches data.riksdagen.se `org`). */
export const COMMITTEES = [
  'AU',
  'CU',
  'FiU',
  'FöU',
  'JuU',
  'KU',
  'KrU',
  'MJU',
  'NU',
  'SfU',
  'SkU',
  'SoU',
  'TU',
  'UbU',
  'UFöU',
  'UU',
] as const;

/** What the model returns for one promise. Deliberately simple (no regexes) for structured outputs. */
export const rawCandidateSchema = z.object({
  slug: z
    .string()
    .describe('Short lowercase ASCII slug with hyphens, e.g. skarpta-straff-gangbrott'),
  title: z.string().describe('Short Swedish title'),
  description: z.string().describe('The promise in Swedish, self-contained, in our own words'),
  page: z.number().int().describe('1-based PDF page number where the promise appears'),
  quote: z.string().describe('Short verbatim quote from the document supporting the promise'),
  // Plain strings: the SDK does not enforce enum values, and an off-list value would
  // make messages.parse throw after the chunk was paid for. Validated per item in toEntry.
  type: z.string().describe(`One of: ${PROMISE_TYPES.join(', ')}`),
  area: z.string().describe('Policy area in Swedish, e.g. Kriminalpolitik'),
  ministry: z.string().describe('Responsible ministry in Swedish, e.g. Justitiedepartementet'),
  committee: z
    .string()
    .describe(`Riksdag committee most likely to handle it, one of: ${COMMITTEES.join(', ')}`),
  keywords: z.array(z.string()).describe('3-6 Swedish search terms for a Riksdag full-text search'),
});

export const extractionSchema = z.object({ candidates: z.array(rawCandidateSchema) });
export type RawCandidate = z.infer<typeof rawCandidateSchema>;

/** One entry of the review file: a ready-to-move promise draft plus review-only fields. */
export const candidateEntrySchema = z.object({
  chunk: z.string(),
  ministry: z.string(),
  promise: promiseSchema,
});
export type CandidateEntry = z.infer<typeof candidateEntrySchema>;

export interface Chunk {
  key: string;
  firstPage: number;
  lastPage: number;
}

export function makeChunks(totalPages: number, pagesPerChunk: number): Chunk[] {
  const chunks: Chunk[] = [];
  for (let first = 1; first <= totalPages; first += pagesPerChunk) {
    const last = Math.min(first + pagesPerChunk - 1, totalPages);
    chunks.push({ key: `p${first}-${last}`, firstPage: first, lastPage: last });
  }
  return chunks;
}

/** Heuristic page count from the raw PDF (works for PDFs without compressed object streams). */
export function countPdfPages(pdf: Buffer): number | null {
  const n = pdf.toString('latin1').match(/\/Type\s*\/Page(?![a-zA-Z])/g)?.length ?? 0;
  return n > 0 ? n : null;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/å|ä/g, 'a')
    .replace(/ö/g, 'o')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

const PARTIES = ['M', 'KD', 'L', 'SD'] as const;

/** Turn a raw candidate into a schema-valid draft promise (verdict not_started). Throws on invalid data. */
export function toEntry(
  raw: RawCandidate,
  chunk: Chunk,
  taken: Set<string>,
  verdictDate: string,
): CandidateEntry {
  if (!(PROMISE_TYPES as readonly string[]).includes(raw.type)) {
    throw new Error(`unknown type "${raw.type}"`);
  }
  const base = 'tido-' + (slugify(raw.slug) || slugify(raw.title));
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
  const promise: PromiseRecord = promiseSchema.parse({
    id,
    term: TERM,
    title: raw.title.trim(),
    description: raw.description.trim(),
    source: { id: SOURCE_ID, page: raw.page, quote: raw.quote.trim() || undefined },
    parties: [...PARTIES],
    roles: { M: 'government', KD: 'government', L: 'government', SD: 'support' },
    type: raw.type,
    area: raw.area.trim(),
    committee: (COMMITTEES as readonly string[]).includes(raw.committee)
      ? raw.committee
      : undefined,
    keywords: raw.keywords.map((k) => k.trim()).filter(Boolean),
    verdict: { value: 'not_started', reasoning: '', date: verdictDate, history: [] },
    evidence: [],
  });
  return { chunk: chunk.key, ministry: raw.ministry.trim(), promise };
}

const SYSTEM = `You extract political promises from the Swedish government agreement "Tidöavtalet: Överenskommelse för Sverige" (2022, M, KD, L and SD).
A promise is a concrete commitment by the parties to do, change, investigate, fund or achieve something. Skip background text, analysis and purely descriptive passages.
Rules:
- One candidate per distinct commitment; split bullet lists whose items are separate commitments, merge sentences that restate the same one.
- Write title, description, area and ministry in Swedish. Keep descriptions faithful to the text; do not add outcomes or judgements.
- "page" is the page number in the PDF (1-based, counting the cover as page 1), not a printed page label.
- "quote" must be verbatim from the document.
- type: legislative = needs a law change; inquiry = the promise is to investigate (utreda); budget = an amount or spending change; outcome = a measurable result; other_action = government action outside the Riksdag; vague = too unspecific to assess.
- committee: the Riksdag committee most likely to handle the matter.
- keywords: Swedish terms useful for searching Riksdag documents.
This output is a candidate list that a human will review, so prefer recall over precision but do not invent promises.`;

export function buildParams(pdfBase64: string, chunk: Chunk) {
  return {
    model: MODEL,
    max_tokens: 32000,
    system: SYSTEM,
    output_config: { effort: 'high', format: zodOutputFormat(extractionSchema) },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
            cache_control: { type: 'ephemeral' },
          },
          {
            type: 'text',
            text: `Extract all promises that appear on PDF pages ${chunk.firstPage} to ${chunk.lastPage} (inclusive). Ignore promises on other pages, even if the text there is visible to you.`,
          },
        ],
      },
    ],
  } satisfies Anthropic.MessageCreateParamsNonStreaming;
}

export function pdfToBase64(path: string): string {
  return readFileSync(path).toString('base64');
}

/**
 * Run one chunk. Returns validated entries; items failing schema validation or
 * lying outside the chunk's page range are logged and dropped.
 */
export async function extractChunk(
  client: Anthropic,
  pdfBase64: string,
  chunk: Chunk,
  takenIds: Set<string>,
  verdictDate: string,
): Promise<CandidateEntry[]> {
  let response;
  try {
    response = await loggedParse(client, `tidoavtalet ${chunk.key}`, buildParams(pdfBase64, chunk));
  } catch (err) {
    // A response truncated at max_tokens leaves invalid JSON, so the SDK throws a
    // parse error from finalMessage() before stop_reason can be inspected.
    if (err instanceof Anthropic.APIError) throw err;
    throw new Error(
      `Chunk ${chunk.key} could not be parsed (often truncated at max_tokens); try a smaller --pages-per-chunk. Cause: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
  if (response.stop_reason === 'refusal') throw new Error(`Model refused chunk ${chunk.key}`);
  const parsed = extractionSchema.parse(response.parsed_output);
  const entries: CandidateEntry[] = [];
  for (const raw of parsed.candidates) {
    if (raw.page < chunk.firstPage || raw.page > chunk.lastPage) {
      console.error(`Dropping "${raw.title}": page ${raw.page} outside ${chunk.key}`);
      continue;
    }
    try {
      const entry = toEntry(raw, chunk, takenIds, verdictDate);
      takenIds.add(entry.promise.id);
      entries.push(entry);
    } catch (err) {
      console.error(`Dropping "${raw.title}": ${err instanceof Error ? err.message : err}`);
    }
  }
  return entries;
}

/** True if the entry's source page lies within the chunk's page range. */
export function inChunkRange(e: CandidateEntry, chunk: Chunk): boolean {
  const page = e.promise.source.page ?? 0;
  return page >= chunk.firstPage && page <= chunk.lastPage;
}

/**
 * Replace all entries on the chunk's pages with `fresh` (idempotent re-runs,
 * also when --pages-per-chunk changed since an earlier run) and keep a stable order.
 */
export function mergeChunk(
  existing: CandidateEntry[],
  chunk: Chunk,
  fresh: CandidateEntry[],
): CandidateEntry[] {
  return [...existing.filter((e) => !inChunkRange(e, chunk)), ...fresh].sort(
    (a, b) =>
      (a.promise.source.page ?? 0) - (b.promise.source.page ?? 0) ||
      a.promise.id.localeCompare(b.promise.id),
  );
}
