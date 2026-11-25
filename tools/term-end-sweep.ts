/**
 * Term-end sweep (hemsida-0tp). Default is a DRY RUN: computes what the sweep would do and writes a
 * report, changing no promise file.
 *   node --experimental-strip-types tools/term-end-sweep.ts [--term 2022-2026] [--date YYYY-MM-DD]
 *     [--out-dir tools/out] [--apply]
 *
 * Report: tools/out/term-end-sweep-<term>.json and .md (per-promise list + grouped summary).
 * `--apply` (NOT run in the dry-run PR; the user reviews the report first) writes `expired` into the
 * promise files: verdict.history = the verdict history on main + its previous verdict object,
 * assessedBy ai, reasoning kept (prefixed only when it reads as failure-implying). Every file is
 * validated against the schema before it is written. Rules: docs/data-model.md, "expired".
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { writeJsonAtomic } from './lib/json.ts';
import { promiseSchema } from './lib/schema.ts';
import type { PromiseRecord } from './lib/schema.ts';
import { applyVerdict, buildReport, classify, renderMarkdown } from './lib/term-end-sweep.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
  options: {
    term: { type: 'string', default: '2022-2026' },
    date: { type: 'string', default: new Date().toISOString().slice(0, 10) },
    'out-dir': { type: 'string', default: resolve(root, 'tools/out') },
    apply: { type: 'boolean', default: false },
  },
});
const term = values.term!;
const date = values.date!;
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

/** The verdict as on main (what is published); falls back to the working tree. */
function baseVerdict(file: string, current: PromiseRecord): PromiseRecord['verdict'] {
  try {
    const rel = file.slice(root.length + 1);
    const text = execFileSync('git', ['show', `main:${rel}`], { cwd: root, encoding: 'utf-8' });
    return promiseSchema.parse(JSON.parse(text)).verdict;
  } catch {
    return current.verdict;
  }
}

let written = 0;
for (const { file, promise } of promises) {
  const item = classify(promise);
  if (!item) continue;
  const verdict = applyVerdict(baseVerdict(file, promise), item, date);
  if (!verdict) continue;
  writeJsonAtomic(file, promiseSchema.parse({ ...promise, verdict }));
  written++;
}
console.log(
  `applied: ${written} promise files set to expired (run pnpm fmt, then review the diff)`,
);
