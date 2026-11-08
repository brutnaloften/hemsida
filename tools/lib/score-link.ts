/**
 * Link a scoring run's results to riksdag-candidates files (hemsida-4np.19).
 *
 * Input: `tools/out/runs/<name>/results.json` (document -> promise -> best chunk
 * score) plus document metadata from the ingest store. Output: for each promise,
 * the candidate file with high-scoring documents added (existing entries are
 * kept, rejected pairs skipped), and a recall report comparing the scores with
 * the keyword candidates already in the files. Pure logic; the CLI is
 * `tools/link-scores.ts`. Nothing here sets evidence or a verdict.
 */

import { z } from 'zod';
import { rejectedKey } from '../../src/schema/rejected.ts';
import {
  termWindow,
  type CandidateDocument,
  type CandidateFile,
  type SearchPromise,
} from './riksdag-candidates.ts';
import type { StoredDocument } from './riksdag-ingest.ts';
import type { ScoreResults } from './score/results.ts';

/** From the eval-set report (docs/jev-spike.md): 0.5-0.6 gave 30/33 positives with 3/18 false positives. */
export const DEFAULT_THRESHOLD = 0.55;
/** Maximum number of documents added per promise from scores. */
export const DEFAULT_TOP_K = 10;

export const resultsFileSchema = z.object({
  plan_hash: z.string(),
  complete: z.boolean(),
  results: z.record(
    z.string(),
    z.record(z.string(), z.object({ score: z.number(), best_chunk: z.number() })),
  ),
});
export type ResultsFile = z.infer<typeof resultsFileSchema>;

export function scoreLabel(runName: string): string {
  return `score:${runName}`;
}

export interface LinkOptions {
  runName: string;
  threshold: number;
  topK: number;
  today: string;
}

/** Round to 3 decimals so files do not churn on float noise. */
function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function toScoredCandidate(
  doc: StoredDocument,
  label: string,
  relevance: number,
): CandidateDocument {
  return {
    dok_id: doc.dok_id,
    doktyp: doc.doktyp,
    rm: doc.rm,
    beteckning: doc.beteckning,
    datum: doc.datum,
    titel: doc.titel,
    organ: doc.organ,
    url: doc.url,
    found_by: [label],
    score: 1,
    relevance: round(relevance),
  };
}

/** True if the document may be proposed for the term: candidate type and inside the term window. */
function inWindow(promise: SearchPromise, doc: StoredDocument): boolean {
  const w = termWindow(promise.term);
  return !doc.datum || (doc.datum >= w.from && doc.datum <= w.tom);
}

export interface PromiseReport {
  promise_id: string;
  /** Documents scored >= threshold (before the top-k cap and the rejected filter). */
  high: number;
  /** Of those, how many are already keyword candidates. */
  high_in_keywords: number;
  /** High scorers missing from the keyword file (the recall gain). */
  high_missed: { dok_id: string; score: number }[];
  /** Keyword candidates that scored below the threshold. */
  keyword_low: { dok_id: string; score: number }[];
  /** Keyword candidates the run has no score for (document not in the run). */
  keyword_unscored: number;
  keyword_total: number;
  /** Documents added to the file by this link. */
  added: number;
  /** High scorers skipped because they are rejected pairs. */
  skipped_rejected: number;
  /** High scorers skipped because the document is not in the store or outside the term window. */
  skipped_unknown: number;
}

export interface LinkResult {
  file: CandidateFile;
  changed: boolean;
  report: PromiseReport;
}

/**
 * Merge one promise's scores into its candidate file.
 * Existing entries stay in place; if the run scored them, `relevance` and the
 * `score:<run>` label are added to them. Up to `topK` unlisted documents scoring
 * at least the threshold are appended, best first (the 15 cap of the keyword
 * files does not apply to them).
 */
export function linkPromise(
  promise: SearchPromise,
  existing: CandidateFile | undefined,
  scoresByDoc: ReadonlyMap<string, number>,
  docs: Record<string, StoredDocument>,
  rejected: ReadonlySet<string>,
  opts: LinkOptions,
): LinkResult {
  const label = scoreLabel(opts.runName);
  const before = existing?.candidates ?? [];
  const known = new Set(before.map((c) => c.dok_id));

  const highAll = [...scoresByDoc.entries()]
    .filter(([, s]) => s >= opts.threshold)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const report: PromiseReport = {
    promise_id: promise.id,
    high: highAll.length,
    high_in_keywords: highAll.filter(([id]) => known.has(id)).length,
    high_missed: [],
    keyword_low: [],
    keyword_unscored: 0,
    keyword_total: before.length,
    added: 0,
    skipped_rejected: 0,
    skipped_unknown: 0,
  };
  for (const c of before) {
    const s = scoresByDoc.get(c.dok_id);
    if (s === undefined) report.keyword_unscored++;
    else if (s < opts.threshold) report.keyword_low.push({ dok_id: c.dok_id, score: round(s) });
  }

  let changed = false;
  // Annotate existing entries (additive only).
  const annotated = before.map((c) => {
    const s = scoresByDoc.get(c.dok_id);
    if (s === undefined) return c;
    const relevance = c.found_by.includes(label) ? (c.relevance ?? round(s)) : round(s);
    const found_by = c.found_by.includes(label) ? c.found_by : [...c.found_by, label];
    if (relevance === c.relevance && found_by === c.found_by) return c;
    changed = true;
    return { ...c, found_by, relevance };
  });

  const additions: CandidateDocument[] = [];
  for (const [id, s] of highAll) {
    if (known.has(id)) continue;
    report.high_missed.push({ dok_id: id, score: round(s) });
    if (rejected.has(rejectedKey(promise.id, id))) {
      report.skipped_rejected++;
      continue;
    }
    const doc = docs[id];
    if (!doc || !inWindow(promise, doc)) {
      report.skipped_unknown++;
      continue;
    }
    if (additions.length < opts.topK) additions.push(toScoredCandidate(doc, label, s));
  }
  report.added = additions.length;
  if (additions.length > 0) changed = true;

  if (!changed) {
    return {
      changed: false,
      report,
      file: existing ?? emptyFile(promise, opts.today),
    };
  }
  const file: CandidateFile = {
    promise_id: promise.id,
    searched_at: existing?.searched_at ?? opts.today,
    window: existing?.window ?? termWindow(promise.term),
    queries: existing?.queries.includes(label)
      ? existing.queries
      : [...(existing?.queries ?? []), label],
    candidates: [...annotated, ...additions],
  };
  return { changed: true, report, file };
}

function emptyFile(promise: SearchPromise, today: string): CandidateFile {
  return {
    promise_id: promise.id,
    searched_at: today,
    window: termWindow(promise.term),
    queries: [],
    candidates: [],
  };
}

/** Invert `document -> promise -> score` into `promise -> document -> score`. */
export function scoresByPromise(results: ScoreResults): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const [docId, byPromise] of Object.entries(results)) {
    for (const [promiseId, { score }] of Object.entries(byPromise)) {
      let m = out.get(promiseId);
      if (!m) out.set(promiseId, (m = new Map()));
      m.set(docId, score);
    }
  }
  return out;
}

export interface RecallSummary {
  run: string;
  threshold: number;
  top_k: number;
  promises: number;
  documents_scored: number;
  high_pairs: number;
  high_in_keywords: number;
  high_missed: number;
  keyword_candidates: number;
  keyword_low: number;
  keyword_unscored: number;
  added: number;
  skipped_rejected: number;
  skipped_unknown: number;
  /** Share of high-scoring pairs the keyword files already contain (null if there are none). */
  keyword_recall_of_high: number | null;
  /** Promises with at least one missed high-scoring document. */
  promises_with_gain: number;
}

export function summarise(
  reports: PromiseReport[],
  opts: LinkOptions,
  documentsScored: number,
): RecallSummary {
  const sum = (f: (r: PromiseReport) => number) => reports.reduce((n, r) => n + f(r), 0);
  const high = sum((r) => r.high);
  const inKw = sum((r) => r.high_in_keywords);
  return {
    run: opts.runName,
    threshold: opts.threshold,
    top_k: opts.topK,
    promises: reports.length,
    documents_scored: documentsScored,
    high_pairs: high,
    high_in_keywords: inKw,
    high_missed: sum((r) => r.high_missed.length),
    keyword_candidates: sum((r) => r.keyword_total),
    keyword_low: sum((r) => r.keyword_low.length),
    keyword_unscored: sum((r) => r.keyword_unscored),
    added: sum((r) => r.added),
    skipped_rejected: sum((r) => r.skipped_rejected),
    skipped_unknown: sum((r) => r.skipped_unknown),
    keyword_recall_of_high: high === 0 ? null : round(inKw / high),
    promises_with_gain: reports.filter((r) => r.high_missed.length > 0).length,
  };
}

export function formatSummary(s: RecallSummary): string {
  const pct = (n: number, d: number) => (d === 0 ? 'n/a' : `${((100 * n) / d).toFixed(0)}%`);
  return [
    `Run ${s.run}: ${s.documents_scored} documents scored, ${s.promises} promises, threshold ${s.threshold}, top-k ${s.top_k}`,
    `High-scoring pairs: ${s.high_pairs}; already keyword candidates: ${s.high_in_keywords} (${pct(s.high_in_keywords, s.high_pairs)}); missed by keywords: ${s.high_missed} across ${s.promises_with_gain} promises`,
    `Keyword candidates: ${s.keyword_candidates}; below threshold: ${s.keyword_low} (${pct(s.keyword_low, s.keyword_candidates)}); not in run: ${s.keyword_unscored}`,
    `Added to files: ${s.added}; skipped as rejected: ${s.skipped_rejected}; skipped as unknown or outside the term window: ${s.skipped_unknown}`,
  ].join('\n');
}
