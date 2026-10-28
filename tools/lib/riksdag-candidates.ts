/**
 * Candidate document search: for one promise, find Riksdag documents that might
 * be evidence for it. Pure logic over an injected `list` function, so tests
 * never touch the network.
 *
 * Output layout: one file per promise, `src/data/<term>/riksdag-candidates/<promise-id>.json`.
 * The matcher (classification of promise/document pairs) works per promise
 * (the promise text is the cached prompt prefix and the documents vary), a
 * re-search of one promise rewrites one file and stays a small diff, and the
 * file's existence doubles as a "searched, nothing found" record. Candidates
 * are data only: nothing here writes promise evidence or verdicts.
 *
 * Query strategy (see docs/riksdag-api.md, "Candidate search"): the API's `sok`
 * parameter ranks by relevance but long multi-word queries are too narrow, and
 * very common single words are too broad, so each keyword is queried on its own
 * and documents are ranked by how many distinct queries returned them. Extra
 * queries add (a) all keywords together and (b) the promise's committee on
 * betänkanden, since that is where decisions on the topic are made.
 */

import { z } from 'zod';
import type { DocumentPage, ListDocumentsParams, RiksdagDocument } from './riksdag.ts';
import { rejectedKey } from '../../src/schema/rejected.ts';

/** Types worth proposing as evidence. Motions, questions and votes are left out on purpose. */
export const CANDIDATE_DOKTYPER = ['dir', 'sou', 'ds', 'prop', 'bet'] as const;

export const MAX_KEYWORDS = 5;
export const MAX_CANDIDATES = 15;
const PAGE_SIZE = 10;

export const candidateDocumentSchema = z.object({
  dok_id: z.string().min(1),
  doktyp: z.string(),
  rm: z.string(),
  beteckning: z.string(),
  datum: z.string(),
  titel: z.string(),
  organ: z.string(),
  url: z.string(),
  /** Which queries returned the document, e.g. `keyword:reservkraft`, `all-keywords`, `committee:NU`. */
  found_by: z.array(z.string()).min(1),
  /** Number of distinct queries that returned it (the ranking key). */
  score: z.number().int().positive(),
});
export type CandidateDocument = z.infer<typeof candidateDocumentSchema>;

export const candidateFileSchema = z.object({
  promise_id: z.string().min(1),
  /** Date of the search, YYYY-MM-DD. */
  searched_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** The date window and queries used, so a reader can reproduce the search. */
  window: z.object({ from: z.string(), tom: z.string() }),
  queries: z.array(z.string()),
  candidates: z.array(candidateDocumentSchema),
});
export type CandidateFile = z.infer<typeof candidateFileSchema>;

export interface SearchPromise {
  id: string;
  term: string;
  keywords: string[];
  committee?: string;
}

export interface PlannedQuery {
  label: string;
  params: ListDocumentsParams;
}

/** Date window for a term "2022-2026": from 1 September of the first year to 30 September of the last. */
export function termWindow(term: string): { from: string; tom: string } {
  const [start, end] = term.split('-');
  return { from: `${start}-09-01`, tom: `${end}-09-30` };
}

/** Quote multi-word keywords so the API treats them as a phrase. */
function quote(keyword: string): string {
  return /\s/.test(keyword) ? `"${keyword}"` : keyword;
}

export function planQueries(promise: SearchPromise): PlannedQuery[] {
  const keywords = promise.keywords
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, MAX_KEYWORDS);
  if (keywords.length === 0) return [];
  const window = termWindow(promise.term);
  const base = { ...window, sort: 'rel', sz: PAGE_SIZE, p: 1 } as const;
  const queries: PlannedQuery[] = keywords.map((k) => ({
    label: `keyword:${k}`,
    params: { ...base, doktyp: [...CANDIDATE_DOKTYPER], sok: quote(k) },
  }));
  if (keywords.length > 1) {
    queries.push({
      label: 'all-keywords',
      params: { ...base, doktyp: [...CANDIDATE_DOKTYPER], sok: keywords.map(quote).join(' ') },
    });
  }
  if (promise.committee) {
    queries.push({
      label: `committee:${promise.committee}`,
      params: {
        ...base,
        doktyp: 'bet',
        org: promise.committee,
        sok: keywords.map(quote).join(' '),
      },
    });
  }
  return queries;
}

export type ListFn = (params: ListDocumentsParams) => Promise<DocumentPage>;

function toCandidate(d: RiksdagDocument, label: string): CandidateDocument {
  return {
    dok_id: d.dok_id,
    doktyp: d.doktyp,
    rm: d.rm,
    beteckning: d.beteckning,
    datum: d.datum.slice(0, 10),
    titel: d.titel,
    organ: d.organ,
    url: d.dokument_url_html,
    found_by: [label],
    score: 1,
  };
}

/**
 * Run the planned queries for one promise and merge hits by `dok_id`.
 * Pairs in `rejected` (keys from `rejectedKey`) are dropped. Ranked by score,
 * then newest first, and capped at {@link MAX_CANDIDATES}.
 */
export async function searchPromise(
  promise: SearchPromise,
  list: ListFn,
  rejected: ReadonlySet<string>,
  today: string,
): Promise<CandidateFile> {
  const plan = planQueries(promise);
  const merged = new Map<string, CandidateDocument>();
  for (const q of plan) {
    const page = await list(q.params);
    for (const doc of page.documents) {
      if (!doc.dok_id || rejected.has(rejectedKey(promise.id, doc.dok_id))) continue;
      const existing = merged.get(doc.dok_id);
      if (!existing) {
        merged.set(doc.dok_id, toCandidate(doc, q.label));
      } else if (!existing.found_by.includes(q.label)) {
        existing.found_by.push(q.label);
        existing.score++;
      }
    }
  }
  const candidates = [...merged.values()]
    .sort((a, b) => b.score - a.score || b.datum.localeCompare(a.datum))
    .slice(0, MAX_CANDIDATES);
  return {
    promise_id: promise.id,
    searched_at: today,
    window: termWindow(promise.term),
    queries: plan.map((q) => q.label),
    candidates,
  };
}
