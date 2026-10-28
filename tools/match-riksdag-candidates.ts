/**
 * Match locally stored Riksdag documents against Tidö promises and merge the hits into
 * src/data/<term>/riksdag-candidates/<promise-id>.json (same format as search-riksdag-candidates.ts).
 *   node --experimental-strip-types tools/match-riksdag-candidates.ts [--term 2022-2026]
 *     [--rematch] [--promise <id>] [--store <path>] [--dry-run]
 *
 * Needs the store from ingest-riksdag.ts. Only documents ingested since the last match are
 * scored, except for promises whose keywords/committee changed (hash differs) or with --rematch,
 * which score every stored document. Existing candidate entries are kept; pairs in
 * rejected-candidates.json are skipped; files are only rewritten when something was added.
 * State: tools/out/riksdag-store/<term>.match.json (gitignored).
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadJson, writeJson } from './lib/json.ts';
import { candidateFileSchema, type SearchPromise } from './lib/riksdag-candidates.ts';
import { defaultStorePath, loadStore } from './lib/riksdag-ingest.ts';
import { mergeCandidates, promiseMatchHash } from './lib/riksdag-match.ts';
import { rejectedCandidatesFileSchema, rejectedKeys } from '../src/schema/rejected.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const { values } = parseArgs({
  options: {
    term: { type: 'string', default: '2022-2026' },
    rematch: { type: 'boolean', default: false },
    promise: { type: 'string' },
    store: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});
const term = values.term!;
const termDir = resolve(root, 'src/data', term);
const outDir = resolve(termDir, 'riksdag-candidates');
const storePath = values.store ? resolve(values.store) : defaultStorePath(root, term);
const statePath = storePath.replace(/\.json$/, '.match.json');

interface MatchState {
  /** Highest document `seq` already matched against the promises whose hash is unchanged. */
  matched_seq: number;
  /** Match hash per promise. */
  promises: Record<string, string>;
}

const state: MatchState = existsSync(statePath)
  ? (JSON.parse(readFileSync(statePath, 'utf-8')) as MatchState)
  : { matched_seq: 0, promises: {} };

function loadPromises(): SearchPromise[] {
  const dir = resolve(termDir, 'promises');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => loadJson(resolve(dir, f)) as SearchPromise & { source: { id: string } })
    .filter((p) => p.source.id === 'tidoavtalet')
    .map((p) => ({ id: p.id, term: p.term, keywords: p.keywords ?? [], committee: p.committee }));
}

if (!existsSync(storePath))
  throw new Error(`No store at ${storePath}; run ingest-riksdag.ts first`);
const store = loadStore(storePath, term);
const allDocs = Object.values(store.documents);
const rejected = rejectedKeys(
  rejectedCandidatesFileSchema.parse(loadJson(resolve(termDir, 'rejected-candidates.json'))),
);
const today = new Date().toISOString().slice(0, 10);
let promises = loadPromises();
if (values.promise) {
  promises = promises.filter((p) => p.id === values.promise);
  if (promises.length === 0) throw new Error(`No matchable promise with id ${values.promise}`);
}

mkdirSync(outDir, { recursive: true });
let changed = 0;
let full = 0;
for (const p of promises) {
  const hash = promiseMatchHash(p);
  const fullMatch = values.rematch || state.promises[p.id] !== hash;
  const docs = fullMatch ? allDocs : allDocs.filter((d) => d.seq > state.matched_seq);
  if (fullMatch) full++;
  const file = resolve(outDir, `${p.id}.json`);
  const existing = existsSync(file) ? candidateFileSchema.parse(loadJson(file)) : undefined;
  const result = mergeCandidates(p, existing, docs, rejected, today);
  if (result.changed) {
    changed++;
    console.error(`${p.id}: ${result.file.candidates.length} candidates`);
    if (!values['dry-run']) writeJson(file, result.file);
  }
  state.promises[p.id] = hash;
}
// With --promise only part of the promises were matched, so the global mark must not move.
if (!values.promise) state.matched_seq = store.next_seq - 1;
if (!values['dry-run']) writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
console.error(
  `Done. ${promises.length} promises (${full} fully re-matched), ${changed} candidate files ${values['dry-run'] ? 'would change' : 'written'}.`,
);
