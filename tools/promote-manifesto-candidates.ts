/**
 * Promote the reviewed Liberalerna 2022 manifesto candidates to promise files. See
 * docs/manifesto-promotion-map-l.md.
 *   node --experimental-strip-types tools/promote-manifesto-candidates.ts
 * Writes src/data/2022-2026/promises/val2022-l-*.json and the map doc. Idempotent: it rewrites the
 * same files and removes stale val2022-l-*.json files. The candidates file is left alone.
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadJson, writeJson } from './lib/json.ts';
import {
  ID_PREFIX,
  promiseFileName,
  promote,
  renderMapDoc,
  type ManifestoCandidate,
} from './lib/manifesto-promote.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const candidatesPath = resolve(root, 'src/data/2022-2026/candidates/valmanifest-2022-l.json');
const outDir = resolve(root, 'src/data/2022-2026/promises');
const docPath = resolve(root, 'docs/manifesto-promotion-map-l.md');

const result = promote(loadJson(candidatesPath) as ManifestoCandidate[]);

mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) {
  if (f.startsWith(ID_PREFIX) && f.endsWith('.json')) rmSync(resolve(outDir, f));
}
for (const p of result.promises) writeJson(resolve(outDir, promiseFileName(p)), p);
writeFileSync(docPath, renderMapDoc(result));

console.log(`Wrote ${result.promises.length} promises (${result.vague.length} not_assessable).`);
