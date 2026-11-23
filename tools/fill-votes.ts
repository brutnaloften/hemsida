/**
 * Fill party votes on `bet` evidence from the Riksdag open data.
 *   node --experimental-strip-types tools/fill-votes.ts [--term 2022-2026] [--id-prefix tido-]
 *     [--id <promise id>] [--limit N] [--refresh] [--dry-run] [--cache <dir>] [--out <report.json>]
 *
 * For every bet evidence entry without `votes` it finds the committee point that disposes of the
 * promise's proposition, takes the recorded decision vote (sakfråga, not motivfråga) and writes the
 * party positions as `votes`. Ambiguous cases (no or several candidate points, unclear vote kind)
 * and acklamation points are reported, never guessed. See tools/lib/fill-votes.ts for the rules and
 * docs/riksdag-api.md ("Voteringar"). Requests are sequential at 1/s; every response is cached in
 * tools/out/votes-cache/ so a re-run only fetches what is missing. Run with --dry-run first. Votes
 * never change a verdict.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { fillBetVotes } from './lib/fill-votes.ts';
import type { FillOutcome } from './lib/fill-votes.ts';
import { writeJsonAtomic } from './lib/json.ts';
import { createRiksdagClient } from './lib/riksdag.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIN_INTERVAL_MS = 1000;

const { values } = parseArgs({
  options: {
    term: { type: 'string', default: '2022-2026' },
    'id-prefix': { type: 'string' },
    id: { type: 'string' },
    limit: { type: 'string' },
    refresh: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    cache: { type: 'string', default: resolve(root, 'tools/out/votes-cache') },
    out: { type: 'string', default: resolve(root, 'tools/out/fill-votes-report.json') },
  },
});
const dryRun = values['dry-run']!;
const cacheDir = resolve(values.cache!);
mkdirSync(cacheDir, { recursive: true });

let lastNetwork = Number.NEGATIVE_INFINITY;
let networkCalls = 0;
/** Disk-cached fetch: only successful bodies are cached; the 1 req/s pause applies to the network only. */
const cachedFetch: typeof fetch = async (input, init) => {
  const requestUrl = String(input);
  const file = join(cacheDir, `${createHash('sha1').update(requestUrl).digest('hex')}.json`);
  if (existsSync(file)) return new Response(readFileSync(file, 'utf-8'), { status: 200 });
  const wait = lastNetwork + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNetwork = Date.now();
  networkCalls++;
  const res = await fetch(input, init);
  const body = await res.text();
  if (res.ok) writeFileSync(file, body);
  return new Response(body, { status: res.status });
};
const client = createRiksdagClient({ fetch: cachedFetch, minIntervalMs: 0 });

const dir = resolve(root, 'src/data', values.term!, 'promises');
let files = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .sort();
if (values['id-prefix']) files = files.filter((f) => f.startsWith(values['id-prefix']!));
if (values.id) files = files.filter((f) => f === `${values.id}.json`);
if (values.limit) files = files.slice(0, Number.parseInt(values.limit, 10));

interface Row {
  promise: string;
  dok_id: string;
  designation: string;
  outcome: FillOutcome;
}
const rows: Row[] = [];
let changed = 0;

for (const f of files) {
  const path = join(dir, f);
  const promise = JSON.parse(readFileSync(path, 'utf-8'));
  const evidence: any[] = promise.evidence ?? [];
  let touched = false;
  for (const e of evidence) {
    if (e.kind !== 'bet' || (e.votes !== undefined && !values.refresh)) continue;
    const outcome = await fillBetVotes(client, e, evidence);
    rows.push({ promise: promise.id, dok_id: e.dok_id, designation: e.designation, outcome });
    if (outcome.status === 'filled') {
      e.votes = outcome.votes;
      touched = true;
    }
  }
  if (touched) {
    changed++;
    if (!dryRun) writeJsonAtomic(path, promise);
  }
}

const count = (s: FillOutcome['status']) => rows.filter((r) => r.outcome.status === s).length;
for (const r of rows) {
  if (r.outcome.status === 'filled') continue;
  console.log(`${r.outcome.status}: ${r.promise} ${r.designation}: ${r.outcome.reason}`);
}
console.log(
  `${dryRun ? '[dry-run] ' : ''}${rows.length} bet entries: ${count('filled')} filled (${changed} promise files ${dryRun ? 'would change' : 'written'}), ` +
    `${count('no-recorded-vote')} without recorded vote, ${count('ambiguous')} ambiguous; ${networkCalls} requests`,
);
writeJsonAtomic(resolve(values.out!), rows);
