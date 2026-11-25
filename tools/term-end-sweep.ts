/**
 * Term-end sweep (hemsida-0tp). Default is a DRY RUN: computes what the sweep would do and writes a
 * report, changing no promise file.
 *   node --experimental-strip-types tools/term-end-sweep.ts [--term 2022-2026] [--date YYYY-MM-DD]
 *     [--out-dir tools/out] [--apply [--base origin/main] [--allow-failure-wording]]
 *
 * Report: tools/out/term-end-sweep-<term>.json and .md (per-promise list + grouped summary).
 * `--apply` (NOT run in the dry-run PR; the user reviews the report first) writes `expired` into the
 * promise files: verdict.history = the history on the base ref (default origin/main) + its previous
 * verdict object, assessedBy ai, reasoning untouched. It refuses while any swept promise has
 * failure-implying reasoning (rewrite those first) unless --allow-failure-wording. File key order
 * is kept; every file is validated before it is written. Rules: docs/data-model.md, "expired".
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { writeJsonAtomic } from './lib/json.ts';
import { promiseSchema } from './lib/schema.ts';
import type { PromiseRecord } from './lib/schema.ts';
import {
  applyVerdict,
  buildReport,
  classify,
  renderMarkdown,
  resolveBaseVerdict,
} from './lib/term-end-sweep.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
  options: {
    term: { type: 'string', default: '2022-2026' },
    date: { type: 'string', default: new Date().toISOString().slice(0, 10) },
    'out-dir': { type: 'string', default: resolve(root, 'tools/out') },
    apply: { type: 'boolean', default: false },
    base: { type: 'string', default: 'origin/main' },
    'allow-failure-wording': { type: 'boolean', default: false },
  },
});
const term = values.term!;
const date = values.date!;
const baseRef = values.base!;
const dir = resolve(root, 'src/data', term, 'promises');
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .sort();
const promises = files.map((f) => ({
  file: join(dir, f),
  promise: promiseSchema.parse(JSON.parse(readFileSync(join(dir, f), 'utf-8'))) as PromiseRecord,
}));

if (!values.apply) {
  const report = buildReport(
    term,
    promises.map((x) => x.promise),
    date,
  );
  const outDir = resolve(values['out-dir']!);
  mkdirSync(outDir, { recursive: true });
  writeJsonAtomic(join(outDir, `term-end-sweep-${term}.json`), report);
  writeFileSync(join(outDir, `term-end-sweep-${term}.md`), renderMarkdown(report));
  console.log(`[dry-run] ${term}: ${report.total} promises`);
  console.log(`  unassessed -> expired:                   ${report.counts.expire}`);
  console.log(`  in_progress, dir/sou/ds only -> expired: ${report.counts.expireInquiryOnly}`);
  console.log(`  in_progress, rule check (partial/full):  ${report.counts.ruleCheck}`);
  for (const [g, c] of Object.entries(report.ruleCheckGroups)) console.log(`    ${g}: ${c}`);
  console.log(`  in_progress, keep, needs a decision:     ${report.counts.keepNeedsDecision}`);
  for (const [g, c] of Object.entries(report.keepGroups)) console.log(`    ${g}: ${c}`);
  console.log(`  failure-implying reasoning (expired):    ${report.counts.failureImplying}`);
  console.log(`  unfulfilled candidates:                  ${report.counts.unfulfilledCandidates}`);
  console.log(`report: ${join(outDir, `term-end-sweep-${term}.md`)}`);
  process.exit(0);
}

/** The file as on the base ref; null only when it does not exist there. Other failures throw. */
function baseText(file: string): string | null {
  const rel = file.slice(root.length + 1);
  const res = spawnSync('git', ['show', `${baseRef}:${rel}`], {
    cwd: root,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.status === 0) return res.stdout;
  if (/exists on disk, but not in|does not exist in/.test(res.stderr)) return null;
  throw new Error(`git show ${baseRef}:${rel} failed: ${res.stderr}`);
}

const swept = promises
  .map(({ file, promise }) => ({ file, promise, item: classify(promise) }))
  .filter((x) => x.item && (x.item.action === 'expire' || x.item.action === 'expire_inquiry_only'));
const flagged = swept.filter((x) => x.item!.failureImplying);
if (flagged.length > 0 && !values['allow-failure-wording']) {
  console.error(
    `refusing to apply: ${flagged.length} expired promises have failure-implying reasoning (rewrite them first, see the report, or pass --allow-failure-wording):`,
  );
  for (const x of flagged) console.error(`  ${x.promise.id}`);
  process.exit(1);
}

let written = 0;
for (const { file, promise, item } of swept) {
  const verdict = applyVerdict(
    resolveBaseVerdict(baseText(file), promise.verdict, console.warn, promise.id),
    item!,
    date,
  );
  if (!verdict) continue;
  // Edit the raw JSON in place so the key order of the file is kept (no reordering noise).
  const raw = JSON.parse(readFileSync(file, 'utf-8'));
  raw.verdict = verdict;
  promiseSchema.parse(raw);
  writeJsonAtomic(file, raw);
  written++;
}
console.log(
  `applied: ${written} promise files set to expired against ${baseRef} (run pnpm fmt, then review the diff)`,
);
