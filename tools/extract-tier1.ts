/**
 * Extract the tier-1 text (hemsida-3fu) of every cached Riksdag document and report how much it keeps.
 *   node --experimental-strip-types tools/extract-tier1.ts [--term 2022-2026] [--cache tools/out/riksdag-text]
 *     [--out tools/out/riksdag-tier1] [--only <dok_id>] [--store <riksdag-store.json>]
 *
 * Reads the raw responses fetched by `fetch-riksdag-text.ts` (offline), writes one JSON per document to
 * `--out` (gitignored) and prints tokens per document type, the structure breakdown and the bet outcomes.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { extractTier1, type Tier1Doc } from './lib/riksdag-tier1.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
  options: {
    term: { type: 'string', default: '2022-2026' },
    cache: { type: 'string', default: resolve(root, 'tools/out/riksdag-text') },
    out: { type: 'string', default: resolve(root, 'tools/out/riksdag-tier1') },
    only: { type: 'string' },
    store: { type: 'string' },
  },
});
const storePath = values.store
  ? resolve(values.store)
  : resolve(root, 'tools/out/riksdag-store', `${values.term}.json`);
if (!existsSync(storePath)) {
  console.error(`No Riksdag store at ${storePath}; run tools/ingest-riksdag.ts first.`);
  process.exit(1);
}
const store = JSON.parse(readFileSync(storePath, 'utf8')) as {
  documents: Record<string, { dok_id: string; doktyp: string }>;
};
mkdirSync(values.out!, { recursive: true });

const kept: Record<string, number> = {};
const structure: Record<string, Record<string, number>> = {};
const outcomes: Record<string, number> = {};
let missing = 0;
for (const d of Object.values(store.documents)) {
  if (values.only && d.dok_id !== values.only) continue;
  const file = resolve(values.cache!, `${d.dok_id}.xml`);
  if (!existsSync(file)) {
    missing++;
    continue;
  }
  const raw = readFileSync(file, 'utf8');
  const doc: Tier1Doc = extractTier1(d.dok_id, d.doktyp, raw);
  writeFileSync(resolve(values.out!, `${d.dok_id}.json`), JSON.stringify(doc));
  kept[d.doktyp] = (kept[d.doktyp] ?? 0) + doc.est_tokens;
  const s = (structure[d.doktyp] ??= {});
  s[doc.structure] = (s[doc.structure] ?? 0) + 1;
  if (doc.outcome) outcomes[doc.outcome] = (outcomes[doc.outcome] ?? 0) + 1;
}

const m = (n: number) => `${(n / 1e6).toFixed(1)}M`;
for (const t of Object.keys(kept)) {
  console.log(`${t}: kept ${m(kept[t]!)} tokens, structure ${JSON.stringify(structure[t])}`);
}
const total = Object.values(kept).reduce((a, b) => a + b, 0);
console.log(`total kept ${m(total)} tokens`);
console.log(`bet outcomes: ${JSON.stringify(outcomes)}`);
if (missing) console.log(`${missing} documents not in the cache (run fetch-riksdag-text.ts)`);
