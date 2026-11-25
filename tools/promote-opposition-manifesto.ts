/**
 * Promote reviewed manifesto candidates without an agreement link (any party, any term, e.g. the
 * 2026 manifestos) to promise files. No agreement evidence is added: the promise keeps
 * `evidence: []`. `vague` promises become `not_assessable`, as for L, M and KD; everything else
 * stays `unassessed`. Party and id prefix come from the source record; roles were fixed at
 * extraction (TERM_ROLES), so no role is assumed here.
 *   node --experimental-strip-types tools/promote-opposition-manifesto.ts --source valmanifest-2022-s [--term 2022-2026]
 * Writes src/data/<term>/promises/<id-prefix>*.json and docs/manifesto-promotion-map-<id-prefix>.md.
 * Rerunning on the same candidates rewrites the same files and removes stale ones with the same id
 * prefix, but refuses (unless --force) when an existing file has evidence or a verdict beyond
 * unassessed/not_assessable, since that work would be lost. The audit doc is
 * docs/manifesto-promotion-map-<id-prefix>.md (the 2022 docs predate this and keep <party>).
 * Party- and term-parametric counterpart to the Tidö-linked tool (bead hemsida-5ag).
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadJson, writeJson } from './lib/json.ts';
import { idPrefix, manifestoEntrySchema } from './lib/manifesto-extract.ts';
import {
  assertEntriesMatch,
  promoteManifesto,
  promotionMapFileName,
  protectedPromises,
  renderPromotionMap,
} from './lib/opposition-promote.ts';
import { promiseSchema, sourceSchema } from './lib/schema.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
  options: {
    source: { type: 'string' },
    term: { type: 'string' },
    force: { type: 'boolean', default: false },
  },
});
if (!values.source) throw new Error('--source <source-id> is required');
if (!values.term) throw new Error('--term <term> is required');
const term = values.term;

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

assertEntriesMatch(entries, term, source.id);
const promises = promoteManifesto(entries, party);

const outDir = resolve(termDir, 'promises');
mkdirSync(outDir, { recursive: true });
const stale = readdirSync(outDir).filter((f) => f.startsWith(prefix) && f.endsWith('.json'));
const protectedIds = protectedPromises(
  stale.map((f) => promiseSchema.parse(loadJson(resolve(outDir, f)))),
);
if (protectedIds.length > 0 && !values.force) {
  throw new Error(
    `${protectedIds.length} existing promises have evidence or a verdict beyond unassessed/not_assessable (e.g. ${protectedIds[0]}); rerunning would overwrite them. Use --force to override.`,
  );
}
for (const f of stale) rmSync(resolve(outDir, f));
for (const p of promises) writeJson(resolve(outDir, `${p.id}.json`), p);

writeFileSync(
  resolve(root, 'docs', promotionMapFileName(prefix)),
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
