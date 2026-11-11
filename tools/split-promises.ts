/**
 * Apply a split plan: replace each compound promise by its parts.
 *   node --experimental-strip-types tools/split-promises.ts --plan tools/split-plans/tido-2022-2026-v1.json [--dry-run]
 * For every entry the parent file and its riksdag-candidates file are removed, one promise file per part is
 * written (unassessed, no evidence) with a copy of the parent's candidates, links from other promises and
 * manifesto candidates are pointed at all parts, and the old page URL (/lofte/<id>) is redirected to the first part
 * (src/data/promise-redirects.json). Evidence is linked again afterwards (docs/riksdag-linking.md).
 * Run `pnpm fmt` afterwards.
 */
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadJson, writeJson } from './lib/json.ts';
import { promiseSchema } from './lib/schema.ts';
import {
  buildPart,
  partId,
  replacePromiseId,
  validatePlan,
  splitPlanSchema,
} from './lib/split-promises.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
  options: {
    plan: { type: 'string' },
    term: { type: 'string', default: '2022-2026' },
    'dry-run': { type: 'boolean', default: false },
  },
});
if (!values.plan) throw new Error('usage: split-promises.ts --plan <file> [--dry-run]');
const dry = values['dry-run']!;
const plan = splitPlanSchema.parse(loadJson(resolve(root, values.plan)));
const problems = validatePlan(plan);
if (problems.length) throw new Error(problems.join('\n'));

const dataDir = resolve(root, 'src/data', values.term!);
const promiseDir = resolve(dataDir, 'promises');
const candDir = resolve(dataDir, 'riksdag-candidates');
const redirectFile = resolve(root, 'src/data/promise-redirects.json');
const redirects = existsSync(redirectFile)
  ? (loadJson(redirectFile) as Record<string, string>)
  : {};

// Files that may link to a promise id: other promises (agreement evidence) and manifesto candidates.
const linkFiles = [
  ...readdirSync(promiseDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => resolve(promiseDir, f)),
  ...readdirSync(resolve(dataDir, 'candidates'))
    .filter((f) => f.startsWith('valmanifest-') && f.endsWith('.json'))
    .map((f) => resolve(dataDir, 'candidates', f)),
];

let parts = 0;
let relinked = 0;
for (const entry of plan) {
  const parentFile = resolve(promiseDir, `${entry.id}.json`);
  if (!existsSync(parentFile)) {
    console.log(`skip ${entry.id}: already split`);
    continue;
  }
  const parent = promiseSchema.parse(loadJson(parentFile));
  const ids = entry.parts.map(partId);
  // A part may keep the parent's id; it is already split once the file holds that part's own quote.
  const keeper = entry.parts.find((p) => partId(p) === entry.id);
  if (keeper && parent.source.quote === keeper.quote) {
    console.log(`skip ${entry.id}: already split`);
    continue;
  }
  for (const part of entry.parts) {
    if (partId(part) !== entry.id && existsSync(resolve(promiseDir, `${partId(part)}.json`)))
      throw new Error(`${partId(part)} already exists; it would be overwritten`);
  }
  const candFile = resolve(candDir, `${entry.id}.json`);
  const cand = existsSync(candFile) ? (loadJson(candFile) as Record<string, unknown>) : undefined;
  for (const part of entry.parts) {
    if (dry) {
      parts++;
      continue;
    }
    writeJson(resolve(promiseDir, `${partId(part)}.json`), buildPart(parent, part));
    if (cand)
      writeJson(resolve(candDir, `${partId(part)}.json`), { ...cand, promise_id: partId(part) });
    parts++;
  }
  for (const file of linkFiles) {
    if (!existsSync(file)) continue;
    const json = loadJson(file);
    const links = entry.links ?? {};
    const targets = (owner: string | undefined) =>
      owner && links[owner] ? links[owner].map((slug) => `tido-${slug}`) : ids;
    if (replacePromiseId(json, entry.id, ids, targets)) {
      relinked++;
      if (!dry) writeJson(file, json);
    }
  }
  if (!ids.includes(entry.id))
    redirects[`/lofte/${entry.id}`] = `/lofte/tido-${entry.redirect ?? entry.parts[0].slug}/`;
  if (!dry) {
    // A part may keep the parent's id (the first commitment of the original wording).
    if (!ids.includes(entry.id)) {
      rmSync(parentFile);
      if (cand) rmSync(candFile);
    }
  }
}
if (!dry) writeJson(redirectFile, redirects);
console.log(
  `${dry ? '[dry-run] ' : ''}${plan.length} promises split into ${parts} parts, ${relinked} linking files updated`,
);
