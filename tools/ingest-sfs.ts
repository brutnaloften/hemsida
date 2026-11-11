/**
 * Build the proposition -> SFS index for a term from Regeringskansliets SFS-register.
 *   node --experimental-strip-types tools/ingest-sfs.ts [--term 2022-2026] [--limit N]
 *     [--prop <dok_id>] [--dry-run] [--refresh] [--riksdag-store <path>] [--cache <dir>] [--out <dir>]
 *
 * For every non-budget, non-skrivelse proposition in tools/out/riksdag-store/<term>.json it runs
 * `/sfsr/adv?fritext=<rm>:<nr>`, fetches the register page of each hit once, and keeps the
 * entries whose Förarbeten cite exactly that proposition. Requests are sequential, one per
 * second; every raw page is cached in tools/out/sfsr-cache/ so a re-run (or a resumed run) only
 * fetches what is missing (`--refresh` refetches the cached searches of propositions that had no
 * law in the previous store). Searches with more than 30 hits are read page by page; a single
 * hit comes back as the register page itself. Output: tools/out/sfs-store/<term>.json (gitignored). See
 * docs/riksdag-api.md ("SFS register").
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { isBudgetProp, isSkrivelse, type StoreDocument } from './lib/apply-links.ts';
import { writeJsonAtomic } from './lib/json.ts';
import { defaultStorePath, loadStore } from './lib/riksdag-ingest.ts';
import {
  classifySearchPage,
  matchingLaws,
  mergeLaw,
  parseRegisterPage,
  registerUrl,
  searchPageUrl,
  searchUrl,
  SEARCH_PAGE_SIZE,
  sfsKey,
  sfsStoreSchema,
  type RegisterPage,
  type SfsLaw,
  type SfsStore,
} from './lib/sfs-register.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const USER_AGENT =
  'brutna-loften-tools (+https://github.com/brutnaloften/hemsida; sequential, 1 request/s, cached)';
const TIMEOUT_MS = 30_000;
const MIN_INTERVAL_MS = 1000;

const { values } = parseArgs({
  options: {
    term: { type: 'string', default: '2022-2026' },
    limit: { type: 'string' },
    prop: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    refresh: { type: 'boolean', default: false },
    'riksdag-store': { type: 'string' },
    cache: { type: 'string', default: resolve(root, 'tools/out/sfsr-cache') },
    out: { type: 'string', default: resolve(root, 'tools/out/sfs-store') },
  },
});
const term = values.term!;
const dryRun = values['dry-run']!;
const refresh = values.refresh!;
const cacheDir = resolve(values.cache!);
const outPath = resolve(values.out!, `${term}.json`);
const riksdagStore = loadStore(
  values['riksdag-store'] ? resolve(values['riksdag-store']) : defaultStorePath(root, term),
  term,
);

const docs = Object.values(riksdagStore.documents) as StoreDocument[];
const byRef = new Map<string, string>();
for (const d of docs) if (d.doktyp === 'prop') byRef.set(`${d.rm}:${d.beteckning}`, d.dok_id);
const resolveProp = (ref: string) => byRef.get(ref);

let props = docs.filter((d) => d.doktyp === 'prop' && !isBudgetProp(d) && !isSkrivelse(d));
if (values.prop) props = props.filter((d) => d.dok_id === values.prop);
props.sort((a, b) => a.dok_id.localeCompare(b.dok_id));
if (values.limit) {
  if (!/^[1-9]\d*$/.test(values.limit)) throw new Error('--limit must be a positive integer');
  props = props.slice(0, Number.parseInt(values.limit, 10));
}

let lastStart = Number.NEGATIVE_INFINITY;
let fetched = 0;

/** Cached GET with a 1 request/s throttle and a few retries on 429/5xx. */
async function getPage(cacheName: string, url: string, ignoreCache = false): Promise<string> {
  const file = resolve(cacheDir, cacheName);
  if (!ignoreCache && existsSync(file)) return readFileSync(file, 'utf8');
  if (dryRun) return '';
  let delay = 2000;
  for (let attempt = 0; ; attempt++) {
    const wait = lastStart + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastStart = Date.now();
    let res: Response | undefined;
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      if (attempt >= 3) throw err;
    }
    if (res?.ok) {
      const text = await res.text();
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(file, text);
      fetched++;
      return text;
    }
    if (res) {
      await res.body?.cancel().catch(() => undefined);
      if (!(res.status === 429 || res.status >= 500) || attempt >= 3) {
        throw new Error(`GET ${url} failed: ${res.status}`);
      }
    }
    await new Promise((r) => setTimeout(r, delay));
    delay *= 2;
  }
}

const previous = existsSync(outPath)
  ? sfsStoreSchema.parse(JSON.parse(readFileSync(outPath, 'utf8')))
  : undefined;
const laws: Record<string, SfsLaw> = {};
const byProp: Record<string, string[]> = {};

for (const [i, d] of props.entries()) {
  const ref = `${d.rm}:${d.beteckning}`;
  const safe = ref.replace(/[/:]/g, '-');
  // Refetch a cached search page only for props that had no law in the previous store.
  const stale = refresh && !previous?.byProp[d.dok_id];
  const searchHtml = await getPage(`adv-${safe}.html`, searchUrl(d.rm, d.beteckning), stale);
  const first = classifySearchPage(searchHtml);
  const pages: RegisterPage[] = [];
  let hitCount = 0;
  if (first.kind === 'direct') {
    // exactly one hit: the register answered with that act's page itself
    pages.push(parseRegisterPage(searchHtml));
    hitCount = 1;
  } else if (first.kind === 'list') {
    const bases = [...first.bases];
    let direct = 0;
    const pageCount = Math.ceil(first.total / SEARCH_PAGE_SIZE);
    for (let n = 2; n <= pageCount; n++) {
      const moreHtml = await getPage(
        `adv-${safe}-p${n}.html`,
        searchPageUrl(d.rm, d.beteckning, n),
        stale,
      );
      const more = classifySearchPage(moreHtml);
      if (more.kind === 'direct') {
        // a last page with a single hit is rendered as that act's register page, like a 1-hit search
        pages.push(parseRegisterPage(moreHtml));
        direct++;
      } else if (more.kind === 'list') {
        for (const b of more.bases) if (!bases.includes(b)) bases.push(b);
      } else {
        throw new Error(`${ref}: page ${n} of ${pageCount} has no hits`);
      }
    }
    if (bases.length + direct !== first.total) {
      throw new Error(
        `${ref}: search reports ${first.total} hits but ${bases.length + direct} were listed`,
      );
    }
    hitCount = bases.length + direct;
    for (const base of bases) {
      const html = await getPage(`bet-${base.replace(':', '-')}.html`, registerUrl(base));
      if (!html) continue;
      if (html.includes('Inga träffar')) {
        console.warn(`  warning: register has no page for ${base} (hit of ${ref}), skipped`);
        continue;
      }
      pages.push(parseRegisterPage(html));
    }
  }
  const keys: string[] = [];
  for (const page of pages) {
    for (const law of matchingLaws(page, ref, resolveProp)) {
      const key = sfsKey(law.sfs);
      laws[key] = laws[key] ? mergeLaw(laws[key], law) : law;
      if (!keys.includes(key)) keys.push(key);
    }
  }
  if (keys.length) {
    byProp[d.dok_id] = keys;
  }
  console.log(
    `[${i + 1}/${props.length}] ${d.dok_id} Prop. ${ref}: ${hitCount} hits, ${keys.length} laws`,
  );
}

// A law that cites several store propositions is reachable from each of them.
for (const [key, law] of Object.entries(laws)) {
  for (const p of law.props) {
    if (!props.some((d) => d.dok_id === p)) continue;
    const list = (byProp[p] ??= []);
    if (!list.includes(key)) list.push(key);
  }
}

const store: SfsStore = sfsStoreSchema.parse({
  version: 1,
  term,
  fetchedAt: new Date().toISOString(),
  laws: Object.fromEntries(Object.entries(laws).sort(([a], [b]) => a.localeCompare(b))),
  byProp: Object.fromEntries(
    Object.entries(byProp)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, v.sort()]),
  ),
});

const covered = Object.keys(store.byProp).length;
console.log(
  `\n${Object.keys(store.laws).length} SFS numbers, ${covered}/${props.length} propositions with a law ` +
    `(${props.length - covered} without), ${fetched} pages fetched`,
);
const without = props.filter((d) => !store.byProp[d.dok_id]);
if (without.length && without.length <= 60) {
  console.log(
    'Without any SFS: ' + without.map((d) => `${d.dok_id} (${d.rm}:${d.beteckning})`).join(', '),
  );
}

if (dryRun) {
  console.log('--dry-run: nothing written');
} else if (values.prop || values.limit) {
  console.log('--prop/--limit run: store not written (it would replace the full index)');
} else {
  mkdirSync(dirname(outPath), { recursive: true });
  writeJsonAtomic(outPath, store);
  console.log(`Wrote ${outPath}`);
}
