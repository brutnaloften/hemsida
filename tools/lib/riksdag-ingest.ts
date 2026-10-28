/**
 * Incremental ingest of Riksdag document metadata into a local store.
 *
 * Pure logic over an injected `list` function (tests never touch the network).
 * The store is one JSON file per term under `tools/out/` (gitignored): a map of
 * documents by `dok_id` plus one cursor per document type. A run fetches, per
 * type, only documents dated at or after `cursor - lookback` in ascending date
 * order, saves after every page, and advances the cursor to the last date seen,
 * so a killed run resumes where it stopped. See docs/riksdag-api.md
 * ("Incremental ingest") for why this uses the paged API and not bulk dumps.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import type { DocumentPage, ListDocumentsParams, RiksdagDocument } from './riksdag.ts';
import { CANDIDATE_DOKTYPER, termWindow } from './riksdag-candidates.ts';

/** Types ingested. Same set the candidate search proposes. */
export const INGEST_DOKTYPER = CANDIDATE_DOKTYPER;

/** Days re-fetched before the cursor, to catch documents published late with an earlier `datum`. */
export const DEFAULT_LOOKBACK_DAYS = 14;

const SNIPPET_MAX = 1500;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const storedDocumentSchema = z.object({
  /** Ingest order, assigned once when the document is first stored. Drives incremental matching. */
  seq: z.number().int().positive(),
  dok_id: z.string().min(1),
  doktyp: z.string(),
  rm: z.string(),
  beteckning: z.string(),
  titel: z.string(),
  datum: isoDate.or(z.literal('')),
  organ: z.string(),
  url: z.string(),
  /** Subtitle, summary and notice text joined, tags stripped, capped. For keyword matching. */
  text: z.string(),
});
export type StoredDocument = z.infer<typeof storedDocumentSchema>;

export const storeSchema = z.object({
  version: z.literal(1),
  term: z.string(),
  /** Latest `datum` swept so far, per document type. */
  cursors: z.record(z.string(), isoDate),
  next_seq: z.number().int().positive(),
  documents: z.record(z.string(), storedDocumentSchema),
});
export type Store = z.infer<typeof storeSchema>;

export function emptyStore(term: string): Store {
  return { version: 1, term, cursors: {}, next_seq: 1, documents: {} };
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function snippetOf(d: RiksdagDocument): string {
  const parts = [d.undertitel, d.notisrubrik, d.summary, d.notis]
    .map((p) => stripTags(p ?? ''))
    .filter(Boolean);
  // `notisrubrik` often repeats `titel`; keep each distinct piece once.
  return [...new Set(parts)].join(' ').slice(0, SNIPPET_MAX);
}

function toStored(d: RiksdagDocument, seq: number): StoredDocument {
  return {
    seq,
    dok_id: d.dok_id,
    doktyp: d.doktyp,
    rm: d.rm,
    beteckning: d.beteckning,
    titel: d.titel,
    datum: d.datum.slice(0, 10),
    organ: d.organ,
    url: d.dokument_url_html,
    text: snippetOf(d),
  };
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type IngestListFn = (params: ListDocumentsParams) => Promise<DocumentPage>;

export interface IngestOptions {
  term: string;
  list: IngestListFn;
  /** Called after every page; persist the store here. */
  save: (store: Store) => void;
  /** Today, YYYY-MM-DD. The cursor never moves past it. */
  today: string;
  lookbackDays?: number;
  /** Stop a type after this many pages (live checks). */
  maxPages?: number;
  /** Override the window start (YYYY-MM-DD), e.g. for a small live check. */
  from?: string;
  /** Override the window end. */
  tom?: string;
  log?: (msg: string) => void;
}

export interface IngestSummary {
  requests: number;
  added: number;
  updated: number;
}

/** Ingest one document type. Mutates `store` and calls `save` after every page. */
export async function ingestDoktyp(
  store: Store,
  doktyp: string,
  opts: IngestOptions,
): Promise<IngestSummary> {
  const window = termWindow(opts.term);
  const tom = opts.tom ?? window.tom;
  const cursor = store.cursors[doktyp];
  const floor = opts.from ?? window.from;
  const lookback = opts.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  const from = cursor && !opts.from ? maxDate(floor, addDays(cursor, -lookback)) : floor;
  const summary: IngestSummary = { requests: 0, added: 0, updated: 0 };

  for (let p = 1; ; p++) {
    const page = await opts.list({
      doktyp,
      from,
      tom,
      sort: 'datum',
      sortorder: 'asc',
      sz: 200,
      p,
    });
    summary.requests++;
    let last = store.cursors[doktyp];
    for (const doc of page.documents) {
      if (!doc.dok_id) continue;
      const existing = store.documents[doc.dok_id];
      const stored = toStored(doc, existing?.seq ?? store.next_seq);
      if (!existing) {
        store.next_seq++;
        summary.added++;
      } else if (JSON.stringify(existing) !== JSON.stringify(stored)) {
        summary.updated++;
      }
      store.documents[doc.dok_id] = stored;
      if (stored.datum && (!last || stored.datum > last)) last = stored.datum;
    }
    if (last) store.cursors[doktyp] = minDate(last, opts.today);
    opts.save(store);
    opts.log?.(
      `${doktyp} from ${from}: page ${page.page}/${page.pages} (${page.total} hits), ${summary.added} added`,
    );
    if (p >= page.pages || page.documents.length === 0) break;
    if (opts.maxPages !== undefined && p >= opts.maxPages) break;
  }
  return summary;
}

function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

// ---------------------------------------------------------------------------
// Store file I/O
// ---------------------------------------------------------------------------

export function defaultStorePath(root: string, term: string): string {
  return resolve(root, 'tools/out/riksdag-store', `${term}.json`);
}

export function loadStore(path: string, term: string): Store {
  if (!existsSync(path)) return emptyStore(term);
  const store = storeSchema.parse(JSON.parse(readFileSync(path, 'utf-8')));
  if (store.term !== term) throw new Error(`Store ${path} is for term ${store.term}, not ${term}`);
  return store;
}

/** Write via a temp file and rename, so a crash never leaves a half-written store. */
export function saveStore(path: string, store: Store): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(store));
  renameSync(tmp, path);
}
