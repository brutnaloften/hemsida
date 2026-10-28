/**
 * Local matching of stored Riksdag documents against promises (no network, no
 * LLM). Produces the same candidate file format as the per-promise API search
 * (`riksdag-candidates.ts`) and the same ranking: the number of distinct
 * "queries" that hit a document, then newest first. The labels are the same
 * too (`keyword:<k>`, `all-keywords`, `committee:<c>`), evaluated here over
 * title, subtitle and summary text instead of the API's full-text index. That
 * index is wider, so local matching finds fewer documents per keyword; the
 * matcher (4np.5) does the real judging.
 */

import { createHash } from 'node:crypto';
import { rejectedKey } from '../../src/schema/rejected.ts';
import {
  MAX_CANDIDATES,
  MAX_KEYWORDS,
  termWindow,
  CANDIDATE_DOKTYPER,
  type CandidateDocument,
  type CandidateFile,
  type SearchPromise,
} from './riksdag-candidates.ts';
import type { StoredDocument } from './riksdag-ingest.ts';

/** Keywords of at least this many characters match anywhere (Swedish compounds end in the key word). */
const SUBSTRING_MIN_LENGTH = 5;

export function normaliseKeywords(promise: SearchPromise): string[] {
  return promise.keywords
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, MAX_KEYWORDS);
}

export function keywordMatches(haystack: string, keyword: string): boolean {
  const h = haystack.toLowerCase();
  const k = keyword.toLowerCase();
  if (k.length >= SUBSTRING_MIN_LENGTH) return h.includes(k);
  // Short keywords only at the start of a word, so "väg" does not hit "slutavgift".
  return new RegExp(`(?<![\\p{L}\\p{N}])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u').test(h);
}

/** Labels of the "queries" a document would have been returned by. Empty = no match. */
export function matchLabels(promise: SearchPromise, doc: StoredDocument): string[] {
  const keywords = normaliseKeywords(promise);
  if (keywords.length === 0) return [];
  if (!(CANDIDATE_DOKTYPER as readonly string[]).includes(doc.doktyp)) return [];
  const window = termWindow(promise.term);
  if (doc.datum && (doc.datum < window.from || doc.datum > window.tom)) return [];

  const haystack = `${doc.titel} ${doc.text}`;
  const hits = keywords.filter((k) => keywordMatches(haystack, k));
  const labels = hits.map((k) => `keyword:${k}`);
  if (keywords.length > 1 && hits.length === keywords.length) labels.push('all-keywords');
  if (
    promise.committee &&
    doc.doktyp === 'bet' &&
    doc.organ.toLowerCase() === promise.committee.toLowerCase() &&
    hits.length === keywords.length
  ) {
    labels.push(`committee:${promise.committee}`);
  }
  return labels;
}

/** Hash of what determines a promise's matches; a change triggers a full re-match of that promise. */
export function promiseMatchHash(promise: SearchPromise): string {
  return createHash('sha1')
    .update(JSON.stringify([normaliseKeywords(promise), promise.committee ?? '', promise.term]))
    .digest('hex')
    .slice(0, 12);
}

function toCandidate(doc: StoredDocument, labels: string[]): CandidateDocument {
  return {
    dok_id: doc.dok_id,
    doktyp: doc.doktyp,
    rm: doc.rm,
    beteckning: doc.beteckning,
    datum: doc.datum,
    titel: doc.titel,
    organ: doc.organ,
    url: doc.url,
    found_by: labels,
    score: labels.length,
  };
}

export interface MergeResult {
  file: CandidateFile;
  /** True when the merge added candidates or created the file. */
  changed: boolean;
}

/**
 * Merge locally matched documents into a promise's candidate file.
 * Existing candidate entries are kept as they are (found_by, score and all);
 * only documents not yet listed are added. New hits are ranked as in the API search and only fill free slots up to
 * the cap, so a full file never changes. Pairs
 * in `rejected` are never added. Returns `changed: false` (and the existing
 * file untouched) when nothing was added.
 */
export function mergeCandidates(
  promise: SearchPromise,
  existing: CandidateFile | undefined,
  docs: Iterable<StoredDocument>,
  rejected: ReadonlySet<string>,
  today: string,
): MergeResult {
  const known = new Set(existing?.candidates.map((c) => c.dok_id));
  const additions: CandidateDocument[] = [];
  for (const doc of docs) {
    if (known.has(doc.dok_id) || rejected.has(rejectedKey(promise.id, doc.dok_id))) continue;
    const labels = matchLabels(promise, doc);
    if (labels.length > 0) additions.push(toCandidate(doc, labels));
  }
  const rank = (a: CandidateDocument, b: CandidateDocument) =>
    b.score - a.score || b.datum.localeCompare(a.datum);
  const before = existing?.candidates ?? [];
  // Existing entries are never reordered or evicted; new ones only fill free slots.
  const free = Math.max(0, MAX_CANDIDATES - before.length);
  const added = additions.sort(rank).slice(0, free);
  const candidates = [...before, ...added];

  if (existing && added.length === 0) return { file: existing, changed: false };
  return {
    changed: true,
    file: {
      promise_id: promise.id,
      searched_at: today,
      window: existing?.window ?? termWindow(promise.term),
      queries: existing?.queries ?? localQueryLabels(promise),
      candidates,
    },
  };
}

function localQueryLabels(promise: SearchPromise): string[] {
  const keywords = normaliseKeywords(promise);
  if (keywords.length === 0) return [];
  const labels = keywords.map((k) => `keyword:${k}`);
  if (keywords.length > 1) labels.push('all-keywords');
  if (promise.committee) labels.push(`committee:${promise.committee}`);
  return labels;
}
