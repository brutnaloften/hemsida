/**
 * Write evidence and verdicts from a judged link run (step 8 of docs/riksdag-linking.md).
 *   node --experimental-strip-types tools/apply-links.ts --run <name> [--term 2022-2026]
 *     [--id-prefix tido-] [--today YYYY-MM-DD] [--dry-run]
 * Rules and limits: tools/lib/apply-links.ts. Run `pnpm fmt` afterwards.
 */
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { applyLinks, type JudgedPair, type StoreDocument } from './lib/apply-links.ts';
import { loadJson, writeJson } from './lib/json.ts';
import { defaultStorePath } from './lib/riksdag-ingest.ts';
import { promiseSchema } from './lib/schema.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
  options: {
    run: { type: 'string' },
    term: { type: 'string', default: '2022-2026' },
    'id-prefix': { type: 'string', default: '' },
    today: { type: 'string', default: new Date().toISOString().slice(0, 10) },
    'dry-run': { type: 'boolean', default: false },
  },
});
if (!values.run) throw new Error('usage: apply-links.ts --run <name> [--dry-run]');

const results = loadJson(resolve(root, 'tools/out/link-runs', values.run, 'results.json')) as {
  results?: { promise_id: string; document_id: string; judgement: object; proposed: boolean }[];
};
const rows = Array.isArray(results) ? results : (results.results ?? []);
const pairsBy = new Map<string, JudgedPair[]>();
for (const r of rows as {
  promise_id: string;
  document_id: string;
  judgement: Omit<JudgedPair, 'promise_id' | 'document_id' | 'proposed'>;
  proposed: boolean;
}[]) {
  const list = pairsBy.get(r.promise_id) ?? [];
  list.push({
    promise_id: r.promise_id,
    document_id: r.document_id,
    label: r.judgement.label,
    stage: r.judgement.stage,
    confidence: r.judgement.confidence,
    proposed: r.proposed,
  });
  pairsBy.set(r.promise_id, list);
}

const store = loadJson(defaultStorePath(root, values.term!)) as {
  documents: Record<string, StoreDocument>;
};
const docs = new Map(
  Object.values(store.documents).map((d) => [d.dok_id, { ...d, text: d.text?.slice(0, 600) }]),
);

const dir = resolve(root, 'src/data', values.term!, 'promises');
let changed = 0;
let inProgress = 0;
let evidenceOnly = 0;
let entries = 0;
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const id = file.replace(/\.json$/, '');
  if (!id.startsWith(values['id-prefix']!)) continue;
  const pairs = pairsBy.get(id);
  if (!pairs) continue;
  const raw = loadJson(resolve(dir, file));
  const promise = promiseSchema.parse(raw);
  const applied = applyLinks(promise, pairs, docs, values.today!);
  if (!applied) continue;
  const next = promiseSchema.parse({ ...(raw as object), ...applied });
  changed++;
  entries += applied.evidence.length - promise.evidence.length;
  if (next.verdict.value === 'in_progress') inProgress++;
  else evidenceOnly++;
  if (!values['dry-run']) writeJson(resolve(dir, file), next);
}
console.log(
  `${values['dry-run'] ? '[dry-run] ' : ''}${changed} promises changed: ${inProgress} set to in_progress, ${evidenceOnly} evidence only, ${entries} evidence entries`,
);
