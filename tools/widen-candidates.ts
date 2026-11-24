/**
 * Add candidates for promises the keyword search missed, by ranking the whole local Riksdag store.
 *   node --experimental-strip-types tools/widen-candidates.ts --terms tools/widen-terms/<x>.json
 *     [--term 2022-2026] [--per 6] [--min-score 1000: only phrase hits] [--dry-run]
 * The terms file maps promise ids to hand-written synonyms and law names ({"<id>": ["säkerhetszoner"]}).
 * New hits are appended to src/data/<term>/riksdag-candidates/<id>.json with `found_by`
 * `widen:<terms>` and a high score so `link-pairs` judges them first. Documents already in the file
 * or in rejected-candidates.json are skipped. Needs the store from `tools/ingest-riksdag.ts`.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { loadJson, writeJson } from './lib/json.ts';
import { candidateFileSchema, type CandidateFile } from './lib/riksdag-candidates.ts';
import { defaultStorePath, storeSchema } from './lib/riksdag-ingest.ts';
import { buildIdf, widenSearch } from './lib/widen-candidates.ts';
import { rejectedCandidatesFileSchema } from '../src/schema/rejected.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
  options: {
    terms: { type: 'string' },
    term: { type: 'string', default: '2022-2026' },
    per: { type: 'string', default: '6' },
    'min-score': { type: 'string', default: '0' },
    'dry-run': { type: 'boolean', default: false },
  },
});
if (!values.terms) throw new Error('usage: widen-candidates.ts --terms <file> [--dry-run]');
const term = values.term!;
const per = Number(values.per);
const minScore = Number(values['min-score']);
if (!Number.isFinite(per) || per < 1) throw new Error('--per must be a positive number');
if (!Number.isFinite(minScore) || minScore < 0)
  throw new Error('--min-score must be a number >= 0');
const extra = z
  .record(z.string(), z.array(z.string()))
  .parse(loadJson(resolve(root, values.terms)));
const promiseShape = z.object({
  title: z.string(),
  description: z.string(),
  keywords: z.array(z.string()).optional(),
});
const store = storeSchema.parse(JSON.parse(readFileSync(defaultStorePath(root, term), 'utf8')));
const docs = Object.values(store.documents).filter((d) => d.datum !== '');
const idf = buildIdf(docs);
const rejected = rejectedCandidatesFileSchema.parse(
  loadJson(resolve(root, 'src/data', term, 'rejected-candidates.json')),
);

for (const [id, terms] of Object.entries(extra)) {
  const promise = promiseShape.parse(
    loadJson(resolve(root, 'src/data', term, 'promises', `${id}.json`)),
  );
  const file = resolve(root, 'src/data', term, 'riksdag-candidates', `${id}.json`);
  const existing: CandidateFile | null = existsSync(file)
    ? candidateFileSchema.parse(loadJson(file))
    : null;
  const skip = new Set([
    ...(existing?.candidates.map((c) => c.dok_id) ?? []),
    ...rejected.filter((r) => r.promise_id === id).map((r) => r.dok_id),
  ]);
  const hits = widenSearch(
    {
      id,
      title: promise.title,
      description: promise.description,
      keywords: promise.keywords ?? [],
      extra: terms,
    },
    docs,
    idf,
    skip,
    per,
  ).filter((h) => h.score >= minScore);
  console.log(`${id}: ${hits.length} new`);
  for (const h of hits)
    console.log(
      `  ${h.doc.dok_id} ${h.doc.doktyp} ${h.doc.datum} ${h.doc.titel.slice(0, 90)} [${h.score.toFixed(1)}]`,
    );
  if (values['dry-run'] || hits.length === 0) continue;
  const label = `widen:${terms.join('|') || 'promise-text'}`;
  const next: CandidateFile = existing ?? {
    promise_id: id,
    searched_at: new Date().toISOString().slice(0, 10),
    window: { from: `${term.split('-')[0]}-09-01`, tom: `${term.split('-')[1]}-09-30` },
    queries: [],
    candidates: [],
  };
  next.queries = [...next.queries.filter((q) => !q.startsWith('widen:')), label];
  next.candidates = [
    ...hits.map((h) => ({
      dok_id: h.doc.dok_id,
      doktyp: h.doc.doktyp,
      rm: h.doc.rm,
      beteckning: h.doc.beteckning,
      datum: h.doc.datum,
      titel: h.doc.titel,
      organ: h.doc.organ,
      url: h.doc.url,
      found_by: [label],
      score: 10,
    })),
    ...next.candidates,
  ];
  writeJson(file, next);
}
