/**
 * Write evidence and verdicts from a judged link run (step 8 of docs/riksdag-linking.md).
 *   node --experimental-strip-types tools/apply-links.ts --run <name>[,<name>...] [--term 2022-2026]
 *     (several runs, comma separated: for a promise judged in more than one, the later run replaces
 *      the earlier, so give the main run first and a split re-link last)
 *     [--id-prefix tido-] [--today YYYY-MM-DD] [--dry-run]
 *     [--sfs-store tools/out/sfs-store/<term>.json --sfs-run <name | path to results.json>
 *      [--sfs-overrides tools/sfs-overrides.json]]
 * Without --sfs-store and --sfs-run no SFS evidence is written and no fulfilled verdict is set.
 * Rules and limits: tools/lib/apply-links.ts. Run `pnpm fmt` afterwards.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  applyLinks,
  mergeRunPairs,
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
import { isRiksdagEvidence, promiseSchema } from './lib/schema.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
  options: {
    run: { type: 'string' },
    term: { type: 'string', default: '2022-2026' },
    'id-prefix': { type: 'string', default: '' },
    today: { type: 'string', default: new Date().toISOString().slice(0, 10) },
    'dry-run': { type: 'boolean', default: false },
    list: { type: 'boolean', default: false },
    'sfs-store': { type: 'string' },
    'sfs-run': { type: 'string' },
    'sfs-overrides': { type: 'string', default: resolve(root, 'tools/sfs-overrides.json') },
  },
});
if (!values.run) throw new Error('usage: apply-links.ts --run <name> [--dry-run]');

type ResultRow = {
  promise_id: string;
  document_id: string;
  judgement: Omit<JudgedPair, 'promise_id' | 'document_id' | 'proposed'>;
  proposed: boolean;
};
// Several runs may be given, comma separated (the main run, then a re-link of split promises). For a
// promise judged in more than one run the LATER run replaces the earlier one completely, so applying
// them one after another with separate invocations no longer flip-flops.
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
      stage: r.judgement.stage,
      confidence: r.judgement.confidence,
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
  const runArg = values['sfs-run']!;
  const runPath = runArg.endsWith('.json')
    ? resolve(runArg)
    : resolve(root, 'tools/out/sfs-judge-runs', runArg, 'results.json');
  const sfsResults = (loadJson(runPath) as { results: Parameters<typeof sfsJudgements>[0] })
    .results;
  const overrides = loadJson(resolve(values['sfs-overrides']!)) as Record<string, SfsOverride>;
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

const dir = resolve(root, 'src/data', values.term!, 'promises');
let changed = 0;
const counts: Record<string, number> = {};
const fulfilledRows: string[] = [];
let entries = 0;
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const id = file.replace(/\.json$/, '');
  if (!id.startsWith(values['id-prefix']!)) continue;
  const pairs = pairsBy.get(id);
  if (!pairs) continue;
  const raw = loadJson(resolve(dir, file));
  const promise = promiseSchema.parse(raw);
  const applied = applyLinks(promise, pairs, docs, values.today!, decidedBy, sfs);
  if (!applied) continue;
  const next = promiseSchema.parse({ ...(raw as object), ...applied });
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
if (fulfilledRows.length > 0) {
  console.log(`\nFulfilled (law, relevance, judge confidence):\n| promise | laws |\n| --- | --- |`);
  console.log(fulfilledRows.join('\n'));
}
