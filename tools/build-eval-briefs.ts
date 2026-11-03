/**
 * Build per-pair evidence briefs for the eval labeller (hemsida-4np.16).
 *   node --experimental-strip-types tools/build-eval-briefs.ts [--term 2022-2026] [--only <pair-id>]
 *     [--store <riksdag-store.json>] [--out tools/out/eval-briefs] [--cache tools/out/riksdag-text]
 *
 * For each pair in src/data/<term>/eval/pairs.json: fetch the document's full text from
 * data.riksdagen.se (cached, 1 req/s), count term hits (zero counts included), pull verbatim
 * passages with section and speaker, parse amounts and, for budget bet/prop, repeat for the
 * prior-year counterpart found in the riksdag store. Writes one JSON per pair. Never a label.
 * tools/label-eval-set.ts shows the brief under each pair. See docs/eval-set.md.
 */
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadJson, writeJsonAtomic } from './lib/json.ts';
import { evalFileSchema } from '../src/schema/eval.ts';
import { defaultStorePath, loadStore } from './lib/riksdag-ingest.ts';
import {
  annotateParagraphs,
  createTextFetcher,
  parseRiksdagText,
  type Paragraph,
} from './lib/riksdag-text.ts';
import {
  briefPath,
  buildDocumentBrief,
  deriveTerms,
  distinctiveTerms,
  scopeTerms,
  findPriorYear,
  isBudgetDocument,
  type Brief,
  type StoreDoc,
} from './lib/eval-brief.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
  options: {
    term: { type: 'string', default: '2022-2026' },
    only: { type: 'string' },
    store: { type: 'string' },
    out: { type: 'string', default: resolve(root, 'tools/out/eval-briefs') },
    cache: { type: 'string', default: resolve(root, 'tools/out/riksdag-text') },
  },
});
const term = values.term!;
const outDir = resolve(values.out!);
const file = evalFileSchema.parse(loadJson(resolve(root, 'src/data', term, 'eval/pairs.json')));
const store = loadStore(values.store ? resolve(values.store) : defaultStorePath(root, term), term);
const documents = store.documents as unknown as Record<string, StoreDoc>;
const extras = loadJson(resolve(root, 'tools/eval-brief-terms.json')) as Record<string, string[]>;

const promisesDir = resolve(root, 'src/data', term, 'promises');
const keywords = new Map<string, string[]>();
for (const f of readdirSync(promisesDir)) {
  if (!f.endsWith('.json')) continue;
  const p = JSON.parse(readFileSync(resolve(promisesDir, f), 'utf8')) as {
    id: string;
    keywords?: string[];
  };
  keywords.set(p.id, p.keywords ?? []);
}

mkdirSync(outDir, { recursive: true });
const fetchText = createTextFetcher({ cacheDir: resolve(values.cache!) });
const parsed = new Map<string, Paragraph[] | null>();

async function paragraphsOf(dokId: string, doktyp: string): Promise<Paragraph[] | null> {
  if (parsed.has(dokId)) return parsed.get(dokId)!;
  const raw = await fetchText(dokId);
  const ps = raw === null ? null : annotateParagraphs(parseRiksdagText(raw), doktyp);
  parsed.set(dokId, ps);
  return ps;
}

function meta(id: string, type: string, d: StoreDoc | undefined, title: string, url: string) {
  return {
    document_id: id,
    document_type: type,
    title: d?.titel ?? title,
    rm: d?.rm ?? '',
    date: d?.datum ?? '',
    url,
  };
}

const pairs = file.pairs.filter((p) => !values.only || p.id === values.only);
let n = 0;
for (const pair of pairs) {
  n++;
  const promise = {
    id: pair.promise_id,
    title: pair.promise_title,
    keywords: keywords.get(pair.promise_id) ?? [],
    quote: pair.promise_quote,
  };
  const terms = deriveTerms(promise, extras[pair.promise_id] ?? []);
  const distinctive = distinctiveTerms(promise, extras[pair.promise_id] ?? []);
  const doc: StoreDoc | undefined = documents[pair.document_id];

  const current = buildDocumentBrief(
    meta(pair.document_id, pair.document_type, doc, pair.document_title, pair.url),
    await paragraphsOf(pair.document_id, pair.document_type),
    terms,
    6,
    distinctive,
  );

  let prior: Brief['prior_year'] = null;
  if (doc && isBudgetDocument(doc)) {
    const p = findPriorYear(doc, documents);
    if (!p) {
      prior = {
        status: 'none',
        reason: `ingen motsvarighet (samma utskott och titel, föregående riksmöte) inom mandatperioden ${term}`,
      };
    } else {
      prior = {
        status: 'found',
        document: buildDocumentBrief(
          meta(
            p.dok_id,
            p.doktyp,
            p,
            p.titel,
            `https://data.riksdagen.se/dokument/${p.dok_id}.html`,
          ),
          await paragraphsOf(p.dok_id, p.doktyp),
          terms,
          4,
          // Also look for last year's line on the scope the current document's amounts talk about.
          [...new Set([...distinctive, ...scopeTerms(current)])],
        ),
      };
    }
  }

  const brief: Brief = {
    pair_id: pair.id,
    promise_id: pair.promise_id,
    promise_title: pair.promise_title,
    document: current,
    prior_year: prior,
  };
  writeJsonAtomic(briefPath(outDir, pair.id), brief);
  const hits = current.terms.filter((t) => t.count > 0).length;
  console.log(
    `${n}/${pairs.length} ${pair.id}: ${current.text_available ? `${hits}/${terms.length} terms` : 'no text'}` +
      (prior ? `, prior year ${prior.status}` : ''),
  );
}
console.log(`Wrote ${pairs.length} briefs to ${outDir}`);
