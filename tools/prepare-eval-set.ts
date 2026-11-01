/**
 * Build the hand-labelling set for the matcher eval (hemsida-4np.4).
 *   node --experimental-strip-types tools/prepare-eval-set.ts [--term 2022-2026]
 *     [--count 50] [--seed 20260401]
 *
 * Samples promise/document pairs from src/data/<term>/riksdag-candidates/ (stratified by
 * document type and candidate score band, see lib/eval-set.ts) and writes
 * src/data/<term>/eval/pairs.json. Labels already entered for pairs that are sampled
 * again are kept. Label with tools/label-eval-set.ts; see docs/eval-set.md.
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadJson, writeJsonAtomic } from './lib/json.ts';
import {
  buildPool,
  droppedLabelled,
  mergeLabels,
  samplePairs,
  toEvalPair,
  type EvalPromise,
} from './lib/eval-set.ts';
import { candidateFileSchema, CANDIDATE_DOKTYPER } from './lib/riksdag-candidates.ts';
import { evalFileSchema } from '../src/schema/eval.ts';
import { promiseSchema } from '../src/schema/promise.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
  options: {
    term: { type: 'string', default: '2022-2026' },
    count: { type: 'string', default: '50' },
    seed: { type: 'string', default: '20260401' },
    force: { type: 'boolean', default: false },
  },
});
const term = values.term!;
const count = Number.parseInt(values.count!, 10);
const seed = Number.parseInt(values.seed!, 10);
const termDir = resolve(root, 'src/data', term);

const promises = new Map<string, EvalPromise>();
const promiseDir = resolve(termDir, 'promises');
for (const f of readdirSync(promiseDir).filter((f) => f.endsWith('.json'))) {
  const p: EvalPromise = promiseSchema.parse(loadJson(resolve(promiseDir, f)));
  promises.set(p.id, p);
}
const candDir = resolve(termDir, 'riksdag-candidates');
const files = readdirSync(candDir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => candidateFileSchema.parse(loadJson(resolve(candDir, f))));

const pool = buildPool(promises, files, CANDIDATE_DOKTYPER);
const fresh = samplePairs(pool, count, seed).map(toEvalPair);

const outPath = resolve(termDir, 'eval/pairs.json');
const existing = existsSync(outPath) ? evalFileSchema.parse(loadJson(outPath)).pairs : [];
const dropped = droppedLabelled(fresh, existing);
if (dropped.length > 0) {
  console.error(
    `WARNING: regenerating would drop ${dropped.length} already-labelled pair(s):\n  ${dropped.join('\n  ')}`,
  );
  if (!values.force) {
    console.error('Refusing to overwrite. Re-run with --force to discard those labels.');
    process.exit(1);
  }
}
const pairs = mergeLabels(fresh, existing);
mkdirSync(dirname(outPath), { recursive: true });
writeJsonAtomic(outPath, evalFileSchema.parse({ term, seed, pairs }));

const by = new Map<string, number>();
for (const p of pairs) by.set(p.document_type, (by.get(p.document_type) ?? 0) + 1);
console.error(
  `Wrote ${pairs.length} pairs to ${outPath}: ${JSON.stringify(Object.fromEntries(by))}`,
);
