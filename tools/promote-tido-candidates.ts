/**
 * Promote the reviewed Tidöavtalet candidates to promise files. See docs/tido-promotion-map.md.
 *   node --experimental-strip-types tools/promote-tido-candidates.ts
 * Writes src/data/2022-2026/promises/tido-*.json and docs/tido-promotion-map.md. Idempotent: it
 * rewrites the same files and removes stale tido-*.json files. The candidates file is left alone.
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadJson, writeJson } from './lib/json.ts';
import { promiseFileName, promote, renderMapDoc, type Candidate } from './lib/tido-promote.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const candidatesPath = resolve(root, 'src/data/2022-2026/candidates/tidoavtalet.json');
const outDir = resolve(root, 'src/data/2022-2026/promises');
const docPath = resolve(root, 'docs/tido-promotion-map.md');

const candidates = loadJson(candidatesPath) as Candidate[];
const result = promote(candidates);

mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) {
  if (f.startsWith('tido-') && f.endsWith('.json')) rmSync(resolve(outDir, f));
}
for (const p of result.promises) writeJson(resolve(outDir, promiseFileName(p)), p);

const pages = new Map(candidates.map((c) => [c.promise.id, c.promise.source.page]));
writeFileSync(docPath, renderMapDoc(result, pages));

console.log(`Wrote ${result.promises.length} promises (${result.vague.length} not_assessable).`);
