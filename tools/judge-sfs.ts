/**
 * Coverage judge for (promise, law) pairs (hemsida-d8i.3): does the enacted law implement the whole
 * commitment, only part of it, a clearly weaker form, or none of it?
 *   node --experimental-strip-types tools/judge-sfs.ts [--term 2022-2026] [--id-prefix tido-]
 *     [--only <promise-id>] [--ids a,b,c] [--limit n] [--name <run>] [--model claude-sonnet-5-5]
 *     [--judge claude|fake] [--concurrency 4] [--max-cost 15] [--out-dir tools/out] [--dry-run]
 *     [--pairs-from <results.json> [--labels full,partial]]
 * --max-cost is an OVERALL cap per run name: spend of earlier calls is read from manifest.json (written
 * after every request, so a crash loses nothing) and subtracted. --pairs-from re-judges only pairs the
 * earlier results.json labelled --labels (default full,partial) or never judged, plus none/weaker pairs
 * whose proposition has several laws and whose earlier result is from another template version (the
 * law's own section may change them); the rest keep their earlier result. Each prompt includes the law's
 * own lagtext/författningskommentar from the proposition text when it can be found.
 * Pairs: legislative promises x laws reached through a proposition already linked as evidence
 * (tools/out/sfs-store from ingest-sfs.ts). Runs through the local Claude Code login (refuses an API
 * key). Judgements are cached in <out-dir>/sfs-judge-cache by hash of model, template version and
 * prompt; results go to <out-dir>/sfs-judge-runs/<name>/results.json. Sets no verdict and writes no
 * promise file. `--out-dir` also locates the inputs (riksdag-store, sfs-store, riksdag-tier1,
 * riksdag-text), so a worktree can point it at the main checkout's tools/out.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { designationOf, type StoreDocument } from './lib/apply-links.ts';
import { loadJson, writeJsonAtomic } from './lib/json.ts';
import { loadStore } from './lib/riksdag-ingest.ts';
import { parseRiksdagText } from './lib/riksdag-text.ts';
import { extractTier1 } from './lib/riksdag-tier1.ts';
import { promiseSchema } from './lib/schema.ts';
import { sfsStoreSchema } from './lib/sfs-register.ts';
import {
  SFS_JUDGE_INSTRUCTIONS,
  SFS_JUDGE_TEMPLATE_VERSION,
  buildPrompt,
  changedProposal,
  collectResults,
  extractLawSections,
  coverageSchema,
  createCoverageJudge,
  estimateCostUsd,
  splitByEarlierRun,
  type SfsResult,
  judgeKey,
  planSfsPairs,
  renderTier1,
  runRequests,
  type CoverageCache,
  type SfsRequest,
} from './lib/sfs-judge.ts';
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
    'pairs-from': { type: 'string' },
    labels: { type: 'string', default: 'full,partial' },
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
const MAX_LAW_SECTION_CHARS = 2500;

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

const paragraphCache = new Map<string, { text: string }[]>();
function paragraphsOf(dokId: string): { text: string }[] {
  let ps = paragraphCache.get(dokId);
  if (!ps) {
    const raw = resolve(outDir, 'riksdag-text', `${dokId}.xml`);
    ps = existsSync(raw) ? parseRiksdagText(readFileSync(raw, 'utf8')) : [];
    paragraphCache.set(dokId, ps);
  }
  return ps;
}

// --pairs-from <results.json>: only pairs the earlier run labelled --labels (default full,partial) or never
// judged are sent; the rest keep their earlier result (with that file's template version) in the output.
let kept: SfsResult[] = [];
let toJudge = pairs;
if (values['pairs-from']) {
  const file = z
    .object({ template_version: z.string(), results: z.array(z.looseObject({ id: z.string() })) })
    .parse(loadJson(resolve(values['pairs-from'])));
  const earlier = file.results.map((r) => ({
    template_version: file.template_version,
    ...r,
  })) as SfsResult[];
  ({ rerun: toJudge, kept } = splitByEarlierRun(
    pairs,
    earlier,
    new Set(values.labels!.split(',')),
    {
      currentVersion: SFS_JUDGE_TEMPLATE_VERSION,
      isMultiLaw: (p) => p.prop_ids.some((id) => (sfs.byProp[id] ?? []).length > 1),
    },
  ));
  console.log(
    `--pairs-from: ${toJudge.length} pairs to judge, ${kept.length} keep their earlier label`,
  );
}

const requests: SfsRequest[] = toJudge.map((pair) => {
  const promise = promiseById.get(pair.promise_id)!;
  const law = sfs.laws[pair.sfs_key]!;
  const propTexts = pair.prop_ids.map((id) => ({
    designation: designationOf(docById.get(id)!),
    text:
      renderTier1(sectionsOf(id), MAX_PROP_CHARS / pair.prop_ids.length) ||
      '(ingen utdragen text finns för propositionen)',
  }));
  const lawSections = pair.prop_ids.flatMap((id) => {
    const text = extractLawSections(paragraphsOf(id), law.title, MAX_LAW_SECTION_CHARS);
    return text ? [{ designation: designationOf(docById.get(id)!), text }] : [];
  });
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
    lawSections,
  });
  return {
    pair,
    key: judgeKey(values.judge!, values.model!, prompt, SFS_JUDGE_INSTRUCTIONS),
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

// The cap is overall for a run name: spend of earlier calls is recorded in manifest.json and subtracted.
const runDir = resolve(outDir, 'sfs-judge-runs', name);
const manifestPath = resolve(runDir, 'manifest.json');
const priorSpend = existsSync(manifestPath)
  ? (z.looseObject({ cumulative_cost_usd: z.number().optional() }).parse(loadJson(manifestPath))
      .cumulative_cost_usd ?? 0)
  : 0;
const remainingCap = maxCost - priorSpend;

const todo = requests.filter((r) => !cache.has(r.key));
const estimate = todo.reduce((a, r) => a + r.estimated_cost_usd, 0);
console.log(
  `${new Set(pairs.map((p) => p.promise_id)).size} promises, ${pairs.length} pairs (${requests.length} to judge, ${kept.length} kept from the earlier run), ${requests.length - todo.length} cached, ` +
    `${todo.length} to send; estimated $${estimate.toFixed(2)} (overall cap for run ${name}: $${maxCost}, already spent $${priorSpend.toFixed(2)}; template ${SFS_JUDGE_TEMPLATE_VERSION}, model ${values.model})`,
);
if (dryRun) process.exit(0);
if (remainingCap <= 0)
  throw new Error(`run ${name} has already spent $${priorSpend.toFixed(2)} of its $${maxCost} cap`);

const judge = createCoverageJudge(values.judge!, values.model!);
mkdirSync(runDir, { recursive: true });
const writeSpend = (callCost: number) =>
  writeJsonAtomic(manifestPath, {
    status: 'running',
    judge_kind: judge.kind,
    max_cost_usd: maxCost,
    cumulative_cost_usd: priorSpend + callCost,
  });
const summary = await runRequests(requests, {
  judge,
  instructions: SFS_JUDGE_INSTRUCTIONS,
  cache,
  concurrency: Number(values.concurrency),
  maxCostUsd: remainingCap,
  onSpend: writeSpend,
  onProgress: (done, total) => {
    if (done % 10 === 0 || done === total) console.log(`${done}/${total}`);
  },
});

const collected = collectResults(requests, cache, sfs.laws);
const missing = collected.missing;
const results = [...kept, ...collected.results].sort((a, b) => (a.id < b.id ? -1 : 1));
const dir = runDir;
mkdirSync(dir, { recursive: true });
writeJsonAtomic(resolve(dir, 'results.json'), {
  term,
  model: values.model,
  template_version: SFS_JUDGE_TEMPLATE_VERSION,
  complete: missing === 0,
  results,
});
writeJsonAtomic(resolve(dir, 'manifest.json'), {
  ...summary,
  missing,
  judge_kind: judge.kind,
  max_cost_usd: maxCost,
  cumulative_cost_usd: priorSpend + summary.cost_usd,
});
const counts: Record<string, number> = {};
for (const r of results) counts[r.label] = (counts[r.label] ?? 0) + 1;
console.log(
  `${summary.status}: sent ${summary.sent}, cached ${summary.cached}, skipped ${summary.skipped}, ` +
    `missing ${missing}, cost $${summary.cost_usd.toFixed(4)}; labels ${JSON.stringify(counts)}`,
);
if (summary.error) console.error(summary.error);
if (summary.status !== 'complete' || missing > 0) process.exitCode = 1;
