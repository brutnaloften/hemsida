/**
 * Ingest Riksdag document metadata (dir, sou, ds, prop, bet) for a term into a local store.
 *   node --experimental-strip-types tools/ingest-riksdag.ts [--term 2022-2026]
 *     [--doktyp bet] [--lookback-days 14] [--store <path>] [--from YYYY-MM-DD --tom YYYY-MM-DD]
 *     [--max-pages N]
 *
 * The store is tools/out/riksdag-store/<term>.json (gitignored). The first run is the full
 * backfill (a few dozen requests for the whole term); later runs fetch only documents dated after
 * the per-type cursor minus a lookback, and are cheap. Saves after every page, so an interrupted
 * run resumes from the cursor. Requests are sequential, 1 per second. Then run
 * match-riksdag-candidates.ts. --from/--tom (for live checks) need an explicit --store so they
 * cannot move the real cursors.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createRiksdagClient } from './lib/riksdag.ts';
import {
  DEFAULT_LOOKBACK_DAYS,
  defaultStorePath,
  INGEST_DOKTYPER,
  ingestDoktyp,
  loadStore,
  saveStore,
} from './lib/riksdag-ingest.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const { values } = parseArgs({
  options: {
    term: { type: 'string', default: '2022-2026' },
    doktyp: { type: 'string' },
    'lookback-days': { type: 'string' },
    store: { type: 'string' },
    from: { type: 'string' },
    tom: { type: 'string' },
    'max-pages': { type: 'string' },
  },
});
const term = values.term!;
if ((values.from || values.tom) && !values.store) {
  throw new Error('--from/--tom need an explicit --store, to keep the real cursors intact');
}
const doktyper = values.doktyp ? values.doktyp.split(',') : [...INGEST_DOKTYPER];
for (const d of doktyper) {
  if (!(INGEST_DOKTYPER as readonly string[]).includes(d))
    throw new Error(`Unsupported doktyp ${d}`);
}
const storePath = values.store ? resolve(values.store) : defaultStorePath(root, term);
const store = loadStore(storePath, term);
const client = createRiksdagClient();
const today = new Date().toISOString().slice(0, 10);

let requests = 0;
let added = 0;
for (const doktyp of doktyper) {
  const s = await ingestDoktyp(store, doktyp, {
    term,
    list: (p) => client.listDocuments(p),
    save: (st) => saveStore(storePath, st),
    today,
    lookbackDays: values['lookback-days']
      ? Number.parseInt(values['lookback-days'], 10)
      : DEFAULT_LOOKBACK_DAYS,
    maxPages: values['max-pages'] ? Number.parseInt(values['max-pages'], 10) : undefined,
    from: values.from,
    tom: values.tom,
    log: (m) => console.error(m),
  });
  requests += s.requests;
  added += s.added;
}
console.error(
  `Done. ${requests} requests, ${added} documents added, ${Object.keys(store.documents).length} in store (${storePath}).`,
);
