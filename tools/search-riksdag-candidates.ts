/**
 * Find Riksdag documents that might be evidence for each Tidö promise.
 *   node --experimental-strip-types tools/search-riksdag-candidates.ts [--term 2022-2026]
 *     [--limit N] [--promise <id>] [--dry-run]
 *
 * Writes src/data/<term>/riksdag-candidates/<promise-id>.json (candidates only: promise
 * evidence and verdicts are never touched). Skips pairs in rejected-candidates.json. Resumable:
 * attempted promises are recorded in tools/out/riksdag-candidates.<term>.processed (delete it to
 * redo everything; `--promise` always re-searches). Raw API responses are cached in
 * tools/out/riksdag-cache/ (gitignored). Requests are sequential, 1 per second.
 * --dry-run prints the planned queries and makes no request or write.
 * Only promises sourced from the Tidöavtalet are searched; manifesto promises (val2022-*) are
 * matched through their links to Tidö promises.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadJson, writeJson } from './lib/json.ts';
import { processResumable } from './lib/resume.ts';
import { createRiksdagClient, type DocumentPage, type ListDocumentsParams } from './lib/riksdag.ts';
import {
  planQueries,
  searchPromise,
  type ListFn,
  type SearchPromise,
} from './lib/riksdag-candidates.ts';
import { rejectedCandidatesFileSchema, rejectedKeys } from '../src/schema/rejected.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const { values } = parseArgs({
  options: {
    term: { type: 'string', default: '2022-2026' },
    limit: { type: 'string' },
    promise: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});
const term = values.term!;
const termDir = resolve(root, 'src/data', term);
const outDir = resolve(termDir, 'riksdag-candidates');
const cacheDir = resolve(root, 'tools/out/riksdag-cache');
const cursorPath = resolve(root, `tools/out/riksdag-candidates.${term}.processed`);

function loadPromises(): SearchPromise[] {
  const dir = resolve(termDir, 'promises');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => loadJson(resolve(dir, f)) as SearchPromise & { source: { id: string } })
    .filter((p) => p.source.id === 'tidoavtalet')
    .map((p) => ({ id: p.id, term: p.term, keywords: p.keywords ?? [], committee: p.committee }));
}

/** Disk-cached listDocuments: identical queries are never sent twice. */
function cachedList(real: (p: ListDocumentsParams) => Promise<DocumentPage>, dir: string): ListFn {
  return async (params) => {
    const key = createHash('sha1').update(JSON.stringify(params)).digest('hex');
    const file = resolve(dir, `${key}.json`);
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf-8')) as DocumentPage;
    const page = await real(params);
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(page));
    return page;
  };
}

let promises = loadPromises();
if (values.promise) {
  promises = promises.filter((p) => p.id === values.promise);
  if (promises.length === 0) throw new Error(`No searchable promise with id ${values.promise}`);
}
const limit = values.limit ? Number.parseInt(values.limit, 10) : undefined;

if (values['dry-run']) {
  const shown = promises.slice(0, limit ?? promises.length);
  let requests = 0;
  for (const p of shown) {
    const plan = planQueries(p);
    requests += plan.length;
    console.log(`${p.id}: ${plan.map((q) => q.label).join(' | ') || '(no keywords)'}`);
  }
  console.log(
    `\n${shown.length} promises, up to ${requests} requests (~${requests}s). Nothing written.`,
  );
  process.exit(0);
}

const rejectedPath = resolve(termDir, 'rejected-candidates.json');
const rejected = rejectedKeys(rejectedCandidatesFileSchema.parse(loadJson(rejectedPath)));
const client = createRiksdagClient();
const list = cachedList((p) => client.listDocuments(p), cacheDir);
const today = new Date().toISOString().slice(0, 10);

mkdirSync(outDir, { recursive: true });
mkdirSync(dirname(cursorPath), { recursive: true });

let written = 0;
async function run(p: SearchPromise): Promise<void> {
  const result = await searchPromise(p, list, rejected, today);
  writeJson(resolve(outDir, `${p.id}.json`), result);
  written++;
  console.error(`${p.id}: ${result.candidates.length} candidates`);
}

if (values.promise) {
  await run(promises[0]!); // an explicit promise is always re-searched
} else {
  const summary = await processResumable(limitIterable(promises, limit, cursorPath), {
    cursorPath,
    key: (p) => p.id,
    process: run,
  });
  console.error(`Done. ${written} written, ${summary.alreadyDone} already done.`);
}

/**
 * Apply `--limit` to the not-yet-attempted promises, so repeated `--limit 10`
 * runs walk forward through the list.
 */
function* limitIterable(
  items: SearchPromise[],
  max: number | undefined,
  cursor: string | undefined,
): Generator<SearchPromise> {
  const done =
    cursor && existsSync(cursor)
      ? new Set(readFileSync(cursor, 'utf-8').split('\n'))
      : new Set<string>();
  let n = 0;
  for (const item of items) {
    if (done.has(item.id)) {
      yield item; // counted as already done by processResumable
      continue;
    }
    if (max !== undefined && n >= max) return;
    n++;
    yield item;
  }
}
