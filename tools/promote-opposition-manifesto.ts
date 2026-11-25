/**
 * Promote reviewed manifesto candidates without an agreement link (any party, any term, e.g. the
 * 2026 manifestos) to promise files. No agreement evidence is added: the promise keeps
 * `evidence: []`. `vague` promises become `not_assessable`, as for L, M and KD; everything else
 * stays `unassessed`. Party and id prefix come from the source record; roles were fixed at
 * extraction (TERM_ROLES), so no role is assumed here.
 *   node --experimental-strip-types tools/promote-opposition-manifesto.ts --source valmanifest-2022-s [--term 2022-2026]
 * Writes src/data/<term>/promises/<id-prefix>*.json and docs/manifesto-promotion-map-<party>.md.
 * Idempotent: rewrites the same files and removes stale promise files with the same id prefix.
 * Party- and term-parametric counterpart to the Tidö-linked tool (bead hemsida-5ag).
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadJson, writeJson } from './lib/json.ts';
import { idPrefix, manifestoEntrySchema } from './lib/manifesto-extract.ts';
import { promoteManifesto, renderPromotionMap } from './lib/opposition-promote.ts';
import { sourceSchema } from './lib/schema.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
  options: { source: { type: 'string' }, term: { type: 'string', default: '2022-2026' } },
});
if (!values.source) throw new Error('--source <source-id> is required');
const term = values.term!;

const source = sourceSchema.parse(
  loadJson(resolve(root, 'src/data/sources', `${values.source}.json`)),
);
if (source.parties.length !== 1) throw new Error('source must have exactly one party');
const party = source.parties[0]!;
const prefix = `${idPrefix(source)}-`;
const termDir = resolve(root, 'src/data', term);
const entries = manifestoEntrySchema
  .array()
  .parse(loadJson(resolve(termDir, 'candidates', `${source.id}.json`)));

const promises = promoteManifesto(entries, party);

const outDir = resolve(termDir, 'promises');
mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) {
  if (f.startsWith(prefix) && f.endsWith('.json')) rmSync(resolve(outDir, f));
}
for (const p of promises) writeJson(resolve(outDir, `${p.id}.json`), p);

writeFileSync(
  resolve(root, 'docs', `manifesto-promotion-map-${party.toLowerCase()}.md`),
  renderPromotionMap({
    title: source.title,
    sourceId: source.id,
    term,
    party,
    prefix,
    entries,
    promises,
  }),
);
console.log(
  `Wrote ${promises.length} promises (${promises.filter((p) => p.type === 'vague').length} not_assessable).`,
);
