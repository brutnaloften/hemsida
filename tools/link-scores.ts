/**
 * Turn a scoring run's results into riksdag-candidates files plus a recall report.
 *   node --experimental-strip-types tools/link-scores.ts --run <name> [--term 2022-2026]
 *     [--threshold 0.55] [--top-k 10] [--promise <id>] [--store <path>] [--results <path>]
 *     [--allow-incomplete] [--dry-run]
 *
 * Reads tools/out/runs/<name>/results.json (from `pnpm score`) and the document metadata in the
 * ingest store. For every promise it appends up to --top-k documents scoring at least --threshold
 * to src/data/<term>/riksdag-candidates/<promise-id>.json (found_by `score:<name>`, `relevance` =
 * the score), keeps existing entries (adding `relevance` where the run scored them) and skips
 * pairs in rejected-candidates.json. Writes tools/out/runs/<name>/link-report.json and prints a
 * summary: how many high-scoring pairs the keyword files miss and how many keyword candidates
 * score low. Nothing is written with --dry-run. Candidate files change in a normal data PR.
 */

import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { loadJson, writeJson } from './lib/json.ts';
import { candidateFileSchema, type SearchPromise } from './lib/riksdag-candidates.ts';
import { defaultStorePath, loadStore } from './lib/riksdag-ingest.ts';
import {
  DEFAULT_THRESHOLD,
  DEFAULT_TOP_K,
  formatSummary,
  linkPromise,
  resultsFileSchema,
  scoresByPromise,
  summarise,
  type PromiseReport,
} from './lib/score-link.ts';
import { rejectedCandidatesFileSchema, rejectedKeys } from '../src/schema/rejected.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const { values } = parseArgs({
  options: {
    run: { type: 'string' },
    term: { type: 'string', default: '2022-2026' },
    threshold: { type: 'string', default: String(DEFAULT_THRESHOLD) },
    'top-k': { type: 'string', default: String(DEFAULT_TOP_K) },
    promise: { type: 'string' },
    store: { type: 'string' },
    results: { type: 'string' },
    'allow-incomplete': { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
  },
});
if (!values.run) throw new Error('--run <name> is required (a directory under tools/out/runs)');
const runName = values.run;
const term = values.term!;
const threshold = Number(values.threshold);
const topK = Number.parseInt(values['top-k']!, 10);
if (!(threshold >= 0 && threshold <= 1)) throw new Error('--threshold must be between 0 and 1');
if (!Number.isInteger(topK) || topK < 0) throw new Error('--top-k must be a non-negative integer');

const runDir = resolve(root, 'tools/out/runs', runName);
const resultsPath = values.results ? resolve(values.results) : resolve(runDir, 'results.json');
const termDir = resolve(root, 'src/data', term);
const outDir = resolve(termDir, 'riksdag-candidates');
const storePath = values.store ? resolve(values.store) : defaultStorePath(root, term);

if (!existsSync(resultsPath)) throw new Error(`No results at ${resultsPath}; run pnpm score first`);
if (!existsSync(storePath))
  throw new Error(`No store at ${storePath}; run ingest-riksdag.ts first`);

const resultsFile = resultsFileSchema.parse(loadJson(resultsPath));
if (!resultsFile.complete && !values['allow-incomplete']) {
  throw new Error(
    'results.json is incomplete (some requests are missing). Finish the run or pass --allow-incomplete.',
  );
}
const store = loadStore(storePath, term);
const rejected = rejectedKeys(
  rejectedCandidatesFileSchema.parse(loadJson(resolve(termDir, 'rejected-candidates.json'))),
);
const byPromise = scoresByPromise(resultsFile.results);
const today = new Date().toISOString().slice(0, 10);

const promiseDir = resolve(termDir, 'promises');
const promiseFiles = readdirSync(promiseDir)
  .filter((f) => f.endsWith('.json'))
  .sort();
const promiseRowSchema = z.object({ id: z.string().min(1), term: z.string().min(1) });
const allPromises = promiseFiles.map((f) =>
  promiseRowSchema.parse(loadJson(resolve(promiseDir, f))),
);
const knownIds = new Set(allPromises.map((p) => p.id));
let promises: SearchPromise[] = allPromises
  .filter((p) => byPromise.has(p.id))
  .map((p) => ({ id: p.id, term: p.term, keywords: [] }));
if (values.promise) {
  promises = promises.filter((p) => p.id === values.promise);
  if (promises.length === 0) throw new Error(`No scored promise with id ${values.promise}`);
}
const unknownPromises = [...byPromise.keys()].filter((id) => !knownIds.has(id));
if (unknownPromises.length > 0) {
  console.error(`${unknownPromises.length} scored promise ids have no promise file; ignored.`);
}

const opts = { runName, threshold, topK, today };
const reports: PromiseReport[] = [];
let changed = 0;
for (const p of promises) {
  const file = resolve(outDir, `${p.id}.json`);
  const existing = existsSync(file) ? candidateFileSchema.parse(loadJson(file)) : undefined;
  const result = linkPromise(p, existing, byPromise.get(p.id)!, store.documents, rejected, opts);
  reports.push(result.report);
  if (result.changed) {
    changed++;
    if (!values['dry-run']) writeJson(file, result.file);
  }
}

const summary = summarise(reports, opts, Object.keys(resultsFile.results).length);
console.error(formatSummary(summary));
console.error(
  `${changed} candidate files ${values['dry-run'] ? 'would change' : 'written'} in ${outDir}.`,
);
if (!values['dry-run']) {
  const reportPath = resolve(runDir, 'link-report.json');
  writeJson(reportPath, {
    summary,
    promises: reports.filter((r) => r.high > 0 || r.keyword_low.length > 0),
  });
  console.error(`Report: ${reportPath}`);
}
