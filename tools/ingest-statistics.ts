/**
 * Fetches official statistics series from SCB PxWebApi v2 and writes src/data/<term>/statistics/<id>.json.
 *
 *   node --experimental-strip-types tools/ingest-statistics.ts [--config tools/statistics-configs/2022-2026.json]
 *     [--only <series-id>] [--refresh] [--dry-run]
 *
 * Series from the agencies' published .xlsx tables (Migrationsverket, Socialstyrelsen) are read from
 * the workbook URLs in the config, cached as files next to the JSON (also paced at 350 ms per host
 * request, one at a time). The series source decides; see `xlsxSeriesConfigSchema`.
 *
 * The config lists the series (id, table, selection, unit, frequency, ...). Requests are sequential,
 * paced at 350 ms (under SCB's limit of 30 calls per 10 s). Every raw response is cached in
 * tools/out/statistics-cache/ (gitignored); a rerun reads the cache, `--refresh` refetches. A rerun
 * with unchanged data leaves the series files byte-identical (`fetched_at` is kept when a series is
 * unchanged); the freshness manifest (dataset "statistics") still gets today's date. `--dry-run`
 * reports what would change and writes no series file and no manifest entry.
 * See docs/outcome-promises.md ("Statistics ingest").
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { defaultManifestPath, recordFreshness } from './lib/freshness.ts';
import { loadJson } from './lib/json.ts';
import { statisticSeriesSchema, type StatisticSeries } from './lib/schema.ts';
import {
  SCB_BASE,
  buildSeries,
  dataUrl,
  isXlsx,
  latestYear,
  parseConfig,
  parseJsonStat2,
  readXlsxValue,
  serializeSeries,
  type SeriesConfig,
  type XlsxSeriesConfig,
} from './lib/statistics-ingest.ts';
import { readWorkbook, type Workbook } from './lib/xlsx.ts';

const root = resolve(import.meta.dirname, '..');
const MIN_INTERVAL_MS = 350;
const TIMEOUT_MS = 30_000;

const { values: args } = parseArgs({
  options: {
    config: { type: 'string', default: 'tools/statistics-configs/2022-2026.json' },
    only: { type: 'string' },
    refresh: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    cache: { type: 'string', default: 'tools/out/statistics-cache' },
  },
});
const dryRun = args['dry-run'];
const cacheDir = resolve(root, args.cache);
mkdirSync(cacheDir, { recursive: true });

const config = parseConfig(loadJson(resolve(root, args.config)));
const selected = config.series.filter((s) => !args.only || s.id === args.only);
if (selected.length === 0) throw new Error(`no series matches --only ${args.only}`);
const outDir = resolve(root, `src/data/${config.term}/statistics`);

let lastRequest = 0;
async function getJson(s: SeriesConfig): Promise<unknown> {
  const url = dataUrl(s);
  const file = resolve(
    cacheDir,
    `${s.table}-${createHash('sha1').update(url).digest('hex').slice(0, 12)}.json`,
  );
  if (!args.refresh && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const wait = lastRequest + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'brutnaloften-ingest (political promise tracker)',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const body = (await res.json()) as unknown;
  writeFileSync(file, JSON.stringify(body));
  return body;
}

const xlsxCache = new Map<string, Workbook>();
async function getWorkbook(url: string): Promise<Workbook> {
  const hit = xlsxCache.get(url);
  if (hit) return hit;
  const file = resolve(
    cacheDir,
    `xlsx-${createHash('sha1').update(url).digest('hex').slice(0, 12)}.xlsx`,
  );
  let buf: Buffer;
  if (!args.refresh && existsSync(file)) buf = readFileSync(file);
  else {
    const wait = lastRequest + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequest = Date.now();
    const res = await fetch(url, {
      headers: { 'User-Agent': 'brutnaloften-ingest (political promise tracker)' },
      signal: AbortSignal.timeout(TIMEOUT_MS * 2),
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    buf = Buffer.from(await res.arrayBuffer());
    const book = readWorkbook(buf); // parse before caching: an HTML error page must not be kept
    writeFileSync(file, buf);
    xlsxCache.set(url, book);
    return book;
  }
  const book = readWorkbook(buf);
  xlsxCache.set(url, book);
  return book;
}

async function readXlsxSeries(s: XlsxSeriesConfig): Promise<Map<string, number>> {
  const values = new Map<string, number>();
  for (const f of s.files) {
    values.set(f.period, readXlsxValue(await getWorkbook(f.url), s, f.period));
  }
  return values;
}

const today = new Date().toISOString().slice(0, 10);
const written: StatisticSeries[] = [];
let changed = 0;
mkdirSync(outDir, { recursive: true });
for (const s of selected) {
  let values: Map<string, number>;
  let missing: string[] = [];
  if (isXlsx(s)) values = await readXlsxSeries(s);
  else {
    const raw = await getJson(s);
    ({ values, missing } = parseJsonStat2(raw, { sum: s.sum ?? false, from: s.from }));
  }
  const path = resolve(outDir, `${s.id}.json`);
  const previous = existsSync(path)
    ? statisticSeriesSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
    : undefined;
  const series = buildSeries({ config: s, values, today, previous });
  const text = serializeSeries(series);
  const differs = !existsSync(path) || readFileSync(path, 'utf8') !== text;
  if (differs) changed++;
  if (differs && !dryRun) writeFileSync(path, text);
  written.push(series);
  const periods = Object.keys(series.values);
  console.log(
    `${differs ? (previous ? 'changed  ' : 'new      ') : 'unchanged'} ${s.id} ${periods[0]}-${periods.at(-1)}` +
      (missing.length ? ` (no value for ${missing.join(', ')})` : ''),
  );
}

if (dryRun) {
  console.log(`dry run: ${changed} of ${selected.length} series would be written`);
} else if (args.only) {
  // A partial run says nothing about the other series, so freshness is left alone.
  console.log(`wrote ${changed} of ${selected.length} series (freshness not recorded with --only)`);
} else {
  const all = config.series.map((s) => {
    const p = resolve(outDir, `${s.id}.json`);
    return existsSync(p) ? statisticSeriesSchema.parse(JSON.parse(readFileSync(p, 'utf8'))) : null;
  });
  recordFreshness(defaultManifestPath(root), 'statistics', {
    source: SCB_BASE,
    fetchedAt: today,
    latestPeriod: latestYear(all.filter((x): x is StatisticSeries => x !== null)),
  });
  console.log(`wrote ${changed} of ${selected.length} series to ${outDir}`);
}
