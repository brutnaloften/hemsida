/**
 * Fetch the full text of every document in the Riksdag store into the gitignored cache and report sizes.
 *   node --experimental-strip-types tools/fetch-riksdag-text.ts [--term 2022-2026] [--types dir,sou,ds,prop,bet]
 *     [--limit N] [--store <riksdag-store.json>] [--cache tools/out/riksdag-text] [--out tools/out/riksdag-text-stats.json]
 *
 * Sequential at 1 request per second (see createTextFetcher); documents already in the cache are not fetched
 * again, so an interrupted run resumes where it stopped. Writes one stats row per document (raw bytes, plain-text
 * characters, estimated tokens at 3 characters per token) so the cost of reading the corpus can be estimated.
 * Nothing but the stats file is derived from the text, and none of it is committed.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createTextFetcher, parseRiksdagText } from './lib/riksdag-text.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
  options: {
    term: { type: 'string', default: '2022-2026' },
    types: { type: 'string', default: 'dir,sou,ds,prop,bet' },
    limit: { type: 'string' },
    store: { type: 'string' },
    cache: { type: 'string', default: resolve(root, 'tools/out/riksdag-text') },
    out: { type: 'string', default: resolve(root, 'tools/out/riksdag-text-stats.json') },
  },
});
const storePath = values.store ?? resolve(root, 'tools/out/riksdag-store', `${values.term}.json`);
const store = JSON.parse(readFileSync(storePath, 'utf8')) as {
  documents: Record<string, { dok_id: string; doktyp: string }>;
};
const types = new Set(values.types!.split(','));
let docs = Object.values(store.documents).filter((d) => types.has(d.doktyp));
if (values.limit) docs = docs.slice(0, Number(values.limit));

const CHARS_PER_TOKEN = 3;
const fetchText = createTextFetcher({ cacheDir: resolve(values.cache!) });
interface Row {
  dok_id: string;
  doktyp: string;
  status: 'ok' | 'no_text' | 'error';
  raw_bytes?: number;
  chars?: number;
  est_tokens?: number;
  error?: string;
}
const rows: Row[] = [];
const save = () => writeFileSync(resolve(values.out!), JSON.stringify(rows, null, 1));

let n = 0;
for (const d of docs) {
  n++;
  const row: Row = { dok_id: d.dok_id, doktyp: d.doktyp, status: 'ok' };
  try {
    const raw = await fetchText(d.dok_id);
    if (raw === null) row.status = 'no_text';
    else {
      const chars = parseRiksdagText(raw).reduce((sum, p) => sum + p.text.length, 0);
      Object.assign(row, {
        raw_bytes: raw.length,
        chars,
        est_tokens: Math.round(chars / CHARS_PER_TOKEN),
      });
    }
  } catch (err) {
    row.status = 'error';
    row.error = err instanceof Error ? err.message : String(err);
  }
  rows.push(row);
  if (n % 50 === 0 || n === docs.length) {
    save();
    console.error(`${n}/${docs.length} ${d.dok_id} ${row.status}`);
  }
}
save();

const q = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.floor(xs.length * p))] ?? 0;
for (const t of [...types, 'all']) {
  const ok = rows.filter((r) => r.status === 'ok' && (t === 'all' || r.doktyp === t));
  const tokens = ok.map((r) => r.est_tokens!).sort((a, b) => a - b);
  const total = tokens.reduce((a, b) => a + b, 0);
  console.log(
    `${t}: ${ok.length} docs, ${(total / 1e6).toFixed(1)}M tokens, median ${q(tokens, 0.5)}, p90 ${q(tokens, 0.9)}, max ${tokens.at(-1) ?? 0}, ` +
      `<=32k: ${tokens.filter((x) => x <= 32000).length}, ~$${((total * 0.042) / 1e6).toFixed(2)} for one pass at $0.042/M`,
  );
}
console.log(
  `no text: ${rows.filter((r) => r.status === 'no_text').length}, errors: ${rows.filter((r) => r.status === 'error').length}`,
);
