/**
 * Write evidence and verdicts from a judged link run (step 8 of docs/riksdag-linking.md).
 *   node --experimental-strip-types tools/apply-links.ts --run <name>[,<name>...] [--term 2022-2026]
 *     (several runs, comma separated: for a promise judged in more than one, the later run replaces
 *      the earlier, so give the main run first and a split re-link last)
 *     [--id-prefix tido-] [--today YYYY-MM-DD] [--dry-run]
 *     [--ids a,b] [--exclude c,d]   (only / never these promise ids, e.g. to protect hand-set verdicts)
 *     [--base-ref origin/main]      (verdict history and date are computed against this ref; falls
 *                                    back to HEAD with a message when it does not resolve)
 *     [--sfs-store tools/out/sfs-store/<term>.json --sfs-run <name | path to results.json>[,<...>]
 *      (several judge runs, comma separated, earliest first: a later run's judgement of the same
 *       promise/law replaces the earlier one)
 *      [--sfs-overrides tools/sfs-overrides.json]]
 * Budget promises are never touched, and a fulfilled / partially_fulfilled verdict is only recomputed
 * for legislative promises (with SFS input) and inquiry promises; elsewhere it is kept.
 * A run that would lower a fulfilled / partially_fulfilled verdict keeps it and lists it, unless
 * --allow-downgrade is given (runs only cover part of a term, so a missing judgement is not proof).
 * Without --sfs-store and --sfs-run no SFS evidence is written and no fulfilled verdict is set.
 * Rules and limits: tools/lib/apply-links.ts. Run `pnpm fmt` afterwards.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  applyLinks,
  isDowngrade,
  mergeRunPairs,
  mergeSfsResults,
  rebaseVerdict,
  selectedId,
  sfsJudgements,
  type JudgedPair,
  type SfsInput,
  type SfsOverride,
  type StoreDocument,
} from './lib/apply-links.ts';
import { CONFIDENCES } from './lib/link/config.ts';
import { addDecisions } from './lib/decided-by.ts';
import { SFS_JUDGE_TEMPLATE_VERSION, SFS_RECHECK_TEMPLATE_VERSION } from './lib/sfs-judge.ts';
import { loadJson, writeJson } from './lib/json.ts';
import { defaultStorePath } from './lib/riksdag-ingest.ts';
import { isRiksdagEvidence, promiseSchema, verdictSchema } from './lib/schema.ts';
import { rejectedCandidatesFileSchema } from '../src/schema/rejected.ts';

const { values } = parseArgs({
  options: {
    // Repository root; only the end-to-end test points it at a temporary tree.
    root: { type: 'string', default: resolve(dirname(fileURLToPath(import.meta.url)), '..') },
    run: { type: 'string' },
    term: { type: 'string', default: '2022-2026' },
    'id-prefix': { type: 'string', default: '' },
    today: { type: 'string', default: new Date().toISOString().slice(0, 10) },
    'dry-run': { type: 'boolean', default: false },
    list: { type: 'boolean', default: false },
    ids: { type: 'string' },
    exclude: { type: 'string' },
    'allow-downgrade': { type: 'boolean', default: false },
    'base-ref': { type: 'string', default: 'origin/main' },
    'sfs-store': { type: 'string' },
    'sfs-run': { type: 'string' },
    'sfs-overrides': { type: 'string' },
  },
});
const root = resolve(values.root!);
if (!values.run) throw new Error('usage: apply-links.ts --run <name> [--dry-run]');

type ResultRow = {
  promise_id: string;
  document_id: string;
  judgement: Omit<JudgedPair, 'promise_id' | 'document_id' | 'proposed'> & { reason?: string };
  proposed: boolean;
};
// Several runs may be given, comma separated (the main run, then a re-link of split promises). For a
// promise judged in more than one run the LATER run replaces the earlier one completely, so applying
// them one after another with separate invocations no longer flip-flops.
// Judge `contradicts` labels checked by hand and found off topic: not written, and removed if an earlier run wrote them (reasons in the file).
const contradictsOverrides = loadJson(resolve(root, 'tools/contradicts-overrides.json')) as Record<
  string,
  string
>;
const runPairs: JudgedPair[][] = [];
for (const run of values.run.split(',')) {
  const results = loadJson(resolve(root, 'tools/out/link-runs', run, 'results.json')) as
    | ResultRow[]
    | { results?: ResultRow[] };
  // `proposed` in results.json only covers the config's accept_labels (match, partial). A `contradicts`
  // judgement is shown as "Motverkar" evidence next to other evidence, at the same minimum confidence.
  const manifest = loadJson(resolve(root, 'tools/out/link-runs', run, 'manifest.json')) as {
    config: { thresholds: { min_confidence: (typeof CONFIDENCES)[number] } };
  };
  const minConfidence = CONFIDENCES.indexOf(manifest.config.thresholds.min_confidence);
  const rows = Array.isArray(results) ? results : (results.results ?? []);
  runPairs.push(
    rows.map((r) => ({
      promise_id: r.promise_id,
      document_id: r.document_id,
      label: r.judgement.label,
      notContradiction: !!contradictsOverrides[`${r.promise_id}::${r.document_id}`],
      stage: r.judgement.stage,
      confidence: r.judgement.confidence,
      reason: r.judgement.reason,
      proposed:
        r.proposed ||
        (r.judgement.label === 'contradicts' &&
          CONFIDENCES.indexOf(r.judgement.confidence) >= minConfidence),
    })),
  );
}
const pairsBy = mergeRunPairs(runPairs);

const store = loadJson(defaultStorePath(root, values.term!)) as {
  documents: Record<string, StoreDocument>;
};
const docs = new Map(
  Object.values(store.documents).map((d) => [d.dok_id, { ...d, text: d.text?.slice(0, 600) }]),
);

// prop -> deciding betänkanden, from the betänkanden's own references in the fetched XML.
const decidedBy = new Map<string, string[]>();
const textDir = resolve(root, 'tools/out/riksdag-text');
for (const d of Object.values(store.documents)) {
  if (d.doktyp !== 'bet') continue;
  try {
    addDecisions(decidedBy, d.dok_id, readFileSync(resolve(textDir, `${d.dok_id}.xml`), 'utf-8'));
  } catch (e) {
    // no fetched XML for this document: no decision link from it
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
}

// SFS: laws reached through propositions plus the judge's coverage per (promise, law).
let sfs: SfsInput | undefined;
if (!!values['sfs-store'] !== !!values['sfs-run']) {
  throw new Error('--sfs-store and --sfs-run go together');
}
if (values['sfs-store']) {
  const sfsStore = loadJson(resolve(values['sfs-store'])) as SfsInput;
  // Several runs, comma separated, earliest first: a later run's judgement of the same
  // (promise, law) replaces the earlier one.
  const sfsResults = mergeSfsResults(
    values['sfs-run']!.split(',').map((runArg) => {
      const runPath = runArg.endsWith('.json')
        ? resolve(runArg)
        : resolve(root, 'tools/out/sfs-judge-runs', runArg, 'results.json');
      return (loadJson(runPath) as { results: Parameters<typeof sfsJudgements>[0] }).results;
    }),
  );
  const overrides = loadJson(
    values['sfs-overrides']
      ? resolve(values['sfs-overrides'])
      : resolve(root, 'tools/sfs-overrides.json'),
  ) as Record<string, SfsOverride>;
  const stale = (sfsResults as readonly { label: string; template_version?: string }[]).filter(
    (r) =>
      (r.label === 'full' || r.label === 'partial') &&
      r.template_version !== SFS_JUDGE_TEMPLATE_VERSION &&
      r.template_version !== SFS_RECHECK_TEMPLATE_VERSION,
  );
  if (stale.length > 0) {
    console.warn(
      `warning: ${stale.length} full/partial judgements come from an older template version`,
    );
  }
  sfs = {
    laws: sfsStore.laws,
    byProp: sfsStore.byProp,
    judgements: sfsJudgements(sfsResults, overrides),
  };
}

// Committed rejection list (src/data/<term>/rejected-candidates.json, shared with the candidate search):
// pairs reviewed and rejected, or hand-removed from a promise, never become evidence again.
const rejectedFile = resolve(root, 'src/data', values.term!, 'rejected-candidates.json');
const rejectedBy = new Map<string, Set<string>>();
for (const row of existsSync(rejectedFile)
  ? rejectedCandidatesFileSchema.parse(loadJson(rejectedFile))
  : []) {
  if (!rejectedBy.has(row.promise_id)) rejectedBy.set(row.promise_id, new Set());
  rejectedBy.get(row.promise_id)!.add(row.dok_id);
}

const dir = resolve(root, 'src/data', values.term!, 'promises');
const csv = (v?: string) => new Set((v ?? '').split(',').filter(Boolean));
const only = csv(values.ids);
const exclude = csv(values.exclude);
const knownIds = new Set(readdirSync(dir).map((f) => f.replace(/\.json$/, '')));
for (const [flag, ids] of [
  ['--ids', only],
  ['--exclude', exclude],
] as const) {
  const unknown = [...ids].filter((id) => !knownIds.has(id));
  if (unknown.length > 0) {
    console.warn(`warning: ${flag} names unknown promise ids: ${unknown.join(', ')}`);
  }
}

// Verdict history and date are computed against the base ref, not the working tree.
const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
let baseRef = values['base-ref']!;
try {
  git('rev-parse', '--verify', `${baseRef}^{commit}`);
} catch {
  console.warn(`warning: base ref ${baseRef} not found, using HEAD for verdict history`);
  baseRef = 'HEAD';
}
const baseVerdict = (file: string) => {
  let text: string;
  try {
    text = git('show', `${baseRef}:src/data/${values.term}/promises/${file}`);
  } catch {
    return null; // not on the base (new promise)
  }
  try {
    // Only the verdict block matters; the rest of the file may not match today's schema.
    return verdictSchema.parse((JSON.parse(text) as { verdict?: unknown }).verdict);
  } catch (e) {
    console.warn(
      `warning: ${file} on ${baseRef} has no parsable verdict (${(e as Error).message.split('\n')[0]}), keeping the computed verdict`,
    );
    return null;
  }
};
const kept: string[] = [];
let changed = 0;
const counts: Record<string, number> = {};
const fulfilledRows: string[] = [];
let entries = 0;
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const id = file.replace(/\.json$/, '');
  if (!id.startsWith(values['id-prefix']!) || !selectedId(id, only, exclude)) continue;
  const pairs = pairsBy.get(id);
  if (!pairs) continue;
  const raw = loadJson(resolve(dir, file));
  const promise = promiseSchema.parse(raw);
  const applied = applyLinks(
    promise,
    pairs,
    docs,
    values.today!,
    decidedBy,
    sfs,
    rejectedBy.get(id) ?? new Set(),
  );
  if (!applied) continue;
  if (!values['allow-downgrade'] && isDowngrade(promise.verdict.value, applied.verdict.value)) {
    kept.push(`${id}: ${promise.verdict.value} -> ${applied.verdict.value}`);
    continue;
  }
  const verdict = rebaseVerdict(applied.verdict, baseVerdict(file), values.today!);
  const next = promiseSchema.parse({ ...(raw as object), ...applied, verdict });
  changed++;
  entries += applied.evidence.length - promise.evidence.length;
  if (values.list) {
    const later = /(nyare dokument|Nyare dokument)/.test(next.verdict.reasoning)
      ? ' [later doc]'
      : '';
    console.log(`${id}: ${next.verdict.value}${later}`);
    if (later) {
      for (const e of next.evidence.filter(isRiksdagEvidence)) {
        console.log(`    ${e.date} ${e.designation} ${e.relevance} ${e.title.slice(0, 100)}`);
      }
    }
  }
  if (values['dry-run']) {
    // What the write would change in the evidence list, so a dry run shows the diff per promise.
    const before = new Set(promise.evidence.filter(isRiksdagEvidence).map((e) => e.dok_id));
    const after = new Set(next.evidence.filter(isRiksdagEvidence).map((e) => e.dok_id));
    const diff = [
      ...[...after].filter((d) => !before.has(d)).map((d) => `+${d}`),
      ...[...before].filter((d) => !after.has(d)).map((d) => `-${d}`),
    ];
    console.log(
      `${id}: ${promise.verdict.value} -> ${next.verdict.value}${diff.length ? ` (${diff.join(' ')})` : ''}`,
    );
  }
  counts[next.verdict.value] = (counts[next.verdict.value] ?? 0) + 1;
  if (next.verdict.value === 'fulfilled' && next.verdict.value !== promise.verdict.value) {
    const laws = next.evidence
      .filter(isRiksdagEvidence)
      .filter((e) => e.kind === 'sfs')
      .map((e) => {
        const j = sfs?.judgements.get(`${id}::${e.dok_id}`);
        return `${e.designation} ${e.relevance}${j ? ` ${j.confidence}` : ''}`;
      });
    fulfilledRows.push(`| ${id} | ${laws.join('; ')} |`);
  }
  if (!values['dry-run']) writeJson(resolve(dir, file), next);
}
console.log(
  `${values['dry-run'] ? '[dry-run] ' : ''}${changed} promises changed (${Object.entries(counts)
    .map(([v, n]) => `${n} ${v}`)
    .join(', ')}), ${entries} evidence entries`,
);
if (kept.length > 0) {
  console.warn(
    `\nKept ${kept.length} fulfilled / partially_fulfilled verdicts that these runs would lower (pass --allow-downgrade to apply):\n${kept.join('\n')}`,
  );
}
if (fulfilledRows.length > 0) {
  console.log(`\nFulfilled (law, relevance, judge confidence):\n| promise | laws |\n| --- | --- |`);
  console.log(fulfilledRows.join('\n'));
}
