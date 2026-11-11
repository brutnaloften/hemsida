/**
 * Coverage judge for (promise, law) pairs (hemsida-d8i.3): does the enacted law implement the whole
 * commitment, only part of it, a clearly weaker form, or none of it?
 *   node --experimental-strip-types tools/judge-sfs.ts [--term 2022-2026] [--id-prefix tido-]
 *     [--only <promise-id>] [--ids a,b,c] [--limit n] [--name <run>] [--model claude-sonnet-5-5]
 *     [--judge claude|fake] [--concurrency 4] [--max-cost 15] [--out-dir tools/out] [--dry-run]
 * Pairs: legislative promises x laws reached through a proposition already linked as evidence
 * (tools/out/sfs-store from ingest-sfs.ts). Runs through the local Claude Code login (refuses an API
 * key). Judgements are cached in <out-dir>/sfs-judge-cache by hash of model, template version and
 * prompt; results go to <out-dir>/sfs-judge-runs/<name>/results.json. Sets no verdict and writes no
 * promise file. `--out-dir` also locates the inputs (riksdag-store, sfs-store, riksdag-tier1,
 * riksdag-text), so a worktree can point it at the main checkout's tools/out.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { designationOf, type StoreDocument } from './lib/apply-links.ts';
import { loadJson, writeJsonAtomic } from './lib/json.ts';
import { loadStore } from './lib/riksdag-ingest.ts';
import { extractTier1 } from './lib/riksdag-tier1.ts';
import { promiseSchema } from './lib/schema.ts';
import { sfsStoreSchema } from './lib/sfs-register.ts';
import {
  SFS_JUDGE_INSTRUCTIONS,
  SFS_JUDGE_TEMPLATE_VERSION,
  buildPrompt,
  changedProposal,
  collectResults,
  coverageSchema,
  createCoverageJudge,
  estimateCostUsd,
  judgeKey,
  planSfsPairs,
  renderTier1,
  runRequests,
  type CoverageCache,
  type SfsRequest,
} from './lib/sfs-judge.ts';
import { readdirSync } from 'node:fs';
import { z } from 'zod';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
  options: {
    term: { type: 'string', default: '2022-2026' },
    'id-prefix': { type: 'string', default: '' },
    only: { type: 'string' },
    ids: { type: 'string' },
    limit: { type: 'string' },
    name: { type: 'string' },
    model: { type: 'string', default: 'claude-sonnet-5-5' },
    judge: { type: 'string', default: 'claude' },
    concurrency: { type: 'string', default: '4' },
    'max-cost': { type: 'string', default: '15' },
    'out-dir': { type: 'string', default: resolve(root, 'tools/out') },
    'dry-run': { type: 'boolean', default: false },
  },
});
const term = values.term!;
const outDir = resolve(values['out-dir']!);
const dryRun = values['dry-run']!;
const maxCost = Number(values['max-cost']);
if (!Number.isFinite(maxCost) || maxCost <= 0) throw new Error('--max-cost must be positive');
const name = values.name ?? `${term}-${values.model}`;

const MAX_PROP_CHARS = 9000;
const MAX_BET_CHARS = 2500;

const sfs = sfsStoreSchema.parse(loadJson(resolve(outDir, 'sfs-store', `${term}.json`)));
const store = loadStore(resolve(outDir, 'riksdag-store', `${term}.json`), term);
const docs = Object.values(store.documents) as StoreDocument[];
const docById = new Map(docs.map((d) => [d.dok_id, d]));

const promiseDir = resolve(root, 'src/data', term, 'promises');
const ids = values.ids ? new Set(values.ids.split(',')) : undefined;
const promises = readdirSync(promiseDir)
  .filter((f) => f.endsWith('.json'))
  .filter((f) => !ids || ids.has(f.replace(/\.json$/, '')))
  .sort()
  .map((f) => promiseSchema.parse(loadJson(resolve(promiseDir, f))));
const promiseById = new Map(promises.map((p) => [p.id, p]));

const limit = values.limit ? Number(values.limit) : undefined;
const pairs = planSfsPairs(promises, sfs, docs, {
  idPrefix: values['id-prefix'],
  only: values.only,
  limit,
});

/** Tier-1 sections of a document: the precomputed file, else extracted from the cached text. */
const tier1Cache = new Map<string, { heading: string; text: string }[]>();
function sectionsOf(dokId: string): { heading: string; text: string }[] {
  const hit = tier1Cache.get(dokId);
  if (hit) return hit;
  const doc = docById.get(dokId);
  let sections: { heading: string; text: string }[] = [];
  const t1 = resolve(outDir, 'riksdag-tier1', `${dokId}.json`);
  const raw = resolve(outDir, 'riksdag-text', `${dokId}.xml`);
  if (existsSync(t1)) {
    sections = z
      .object({ sections: z.array(z.object({ heading: z.string(), text: z.string() })) })
      .parse(loadJson(t1)).sections;
  } else if (existsSync(raw) && doc) {
    sections = extractTier1(dokId, doc.doktyp, readFileSync(raw, 'utf8')).sections;
  }
  tier1Cache.set(dokId, sections);
  return sections;
}

const requests: SfsRequest[] = pairs.map((pair) => {
  const promise = promiseById.get(pair.promise_id)!;
  const law = sfs.laws[pair.sfs_key]!;
  const propTexts = pair.prop_ids.map((id) => ({
    designation: designationOf(docById.get(id)!),
    text:
      renderTier1(sectionsOf(id), MAX_PROP_CHARS / pair.prop_ids.length) ||
      '(ingen utdragen text finns för propositionen)',
  }));
  let betProposal: { designation: string; text: string } | undefined;
  for (const betId of pair.bet_ids) {
    const text = changedProposal(sectionsOf(betId), MAX_BET_CHARS);
    if (text) {
      betProposal = { designation: designationOf(docById.get(betId)!), text };
      break;
    }
  }
  const prompt = buildPrompt({
    promise: {
      title: promise.title,
      description: promise.description,
      quote: promise.source && 'quote' in promise.source ? promise.source.quote : undefined,
    },
    law,
    propTexts,
    betProposal,
  });
  return {
    pair,
    key: judgeKey(values.model!, prompt, SFS_JUDGE_INSTRUCTIONS),
    prompt,
    estimated_cost_usd: estimateCostUsd(prompt, SFS_JUDGE_INSTRUCTIONS),
  };
});

const cacheDir = resolve(outDir, 'sfs-judge-cache');
const cache: CoverageCache = {
  has: (k) => existsSync(resolve(cacheDir, `${k}.json`)),
  get: (k) =>
    existsSync(resolve(cacheDir, `${k}.json`))
      ? z
          .object({ coverage: coverageSchema, tokens: z.number() })
          .parse(loadJson(resolve(cacheDir, `${k}.json`)))
      : undefined,
  put: (k, e) => {
    mkdirSync(cacheDir, { recursive: true });
    writeJsonAtomic(resolve(cacheDir, `${k}.json`), e);
  },
};

const todo = requests.filter((r) => !cache.has(r.key));
const estimate = todo.reduce((a, r) => a + r.estimated_cost_usd, 0);
console.log(
  `${new Set(pairs.map((p) => p.promise_id)).size} promises, ${pairs.length} pairs, ${pairs.length - todo.length} cached, ` +
    `${todo.length} to send; estimated $${estimate.toFixed(2)} (cap $${maxCost}, template ${SFS_JUDGE_TEMPLATE_VERSION}, model ${values.model})`,
);
if (dryRun) process.exit(0);

const judge = createCoverageJudge(values.judge!, values.model!);
const summary = await runRequests(requests, {
  judge,
  instructions: SFS_JUDGE_INSTRUCTIONS,
  cache,
  concurrency: Number(values.concurrency),
  maxCostUsd: maxCost,
  onProgress: (done, total) => {
    if (done % 10 === 0 || done === total) console.log(`${done}/${total}`);
  },
});

const { results, missing } = collectResults(requests, cache, sfs.laws);
const dir = resolve(outDir, 'sfs-judge-runs', name);
mkdirSync(dir, { recursive: true });
writeJsonAtomic(resolve(dir, 'results.json'), {
  term,
  model: values.model,
  template_version: SFS_JUDGE_TEMPLATE_VERSION,
  complete: missing === 0,
  results,
});
writeJsonAtomic(resolve(dir, 'manifest.json'), { ...summary, missing, judge_kind: judge.kind });
const counts: Record<string, number> = {};
for (const r of results) counts[r.label] = (counts[r.label] ?? 0) + 1;
console.log(
  `${summary.status}: sent ${summary.sent}, cached ${summary.cached}, skipped ${summary.skipped}, ` +
    `missing ${missing}, cost $${summary.cost_usd.toFixed(4)}; labels ${JSON.stringify(counts)}`,
);
if (summary.error) console.error(summary.error);
if (summary.status !== 'complete' || missing > 0) process.exitCode = 1;
