/**
 * Official statistics series for `src/data/<term>/statistics/<id>.json`.
 *
 * Pure config, URL building, json-stat2 parsing and series assembly live here; fetching, caching and
 * pacing are in `tools/ingest-statistics.ts`. See docs/outcome-promises.md ("Statistics ingest").
 */
import { z } from 'zod/v4';
import { statisticSeriesSchema, type StatisticSeries } from './schema.ts';
import { columnOf, type Sheet } from './xlsx.ts';

/** PxWebApi v2 base (the newer host; `macro-ingest.ts` still uses the v2beta host). */
export const SCB_BASE = 'https://statistikdatabasen.scb.se/api/v2/';

/**
 * One configured series. `selection` is stored verbatim in the series file. A dimension with
 * several codes ("FLERBO,SMÅHUS", comma separated) is summed per period, which is only meaningful
 * for counts, so such a series must set `sum: true`. Time is never in `selection`: every period
 * from `from` on is read.
 */
export const seriesConfigSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  source: z.literal('scb'),
  table: z.string().regex(/^TAB\d+$/),
  selection: z.record(z.string(), z.string().min(1)),
  label: z.string().min(1),
  unit: z.string().min(1),
  frequency: z.enum(['year', 'quarter', 'month']),
  priceBasis: z.enum(['nominal', 'real']).optional(),
  sum: z.boolean().optional(),
  /** First period to keep ("2018"). */
  from: z
    .string()
    .regex(/^\d{4}$/)
    .default('2018'),
});
export type SeriesConfig = z.infer<typeof seriesConfigSchema>;

/**
 * A series read from published .xlsx tables (Migrationsverket, Socialstyrelsen). Each period names
 * the workbook it comes from (`files`; the same URL may repeat) and the value is the cell at
 * `valueColumn` in the one row whose `labelColumn` cell equals `rowLabel` (or, without `rowLabel`,
 * the period itself, for tables with a year per row). `checks` pin header cells so a layout change
 * fails loudly instead of reading the wrong column. There is no rate-limit-free way to find the
 * download URL (the agencies version it), so the URLs are config and a new release is a config change.
 */
export const xlsxSeriesConfigSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  source: z.enum(['migrationsverket', 'socialstyrelsen']),
  /** Free text stored as the series `table`: workbook name and sheet. */
  table: z.string().min(1),
  files: z.array(z.strictObject({ period: z.string().regex(/^\d{4}$/), url: z.url() })).min(1),
  sheet: z.string().min(1),
  labelColumn: z.string().regex(/^[A-Z]{1,2}$/),
  rowLabel: z.string().min(1).optional(),
  valueColumn: z.string().regex(/^[A-Z]{1,2}$/),
  checks: z.array(
    z.strictObject({ cell: z.string().regex(/^[A-Z]{1,2}\d+$/), equals: z.string() }),
  ),
  label: z.string().min(1),
  unit: z.string().min(1),
  frequency: z.literal('year'),
});
export type XlsxSeriesConfig = z.infer<typeof xlsxSeriesConfigSchema>;

export const statisticsConfigSchema = z.strictObject({
  term: z.string().regex(/^\d{4}-\d{4}$/),
  series: z.array(z.union([seriesConfigSchema, xlsxSeriesConfigSchema])).min(1),
});
export type StatisticsConfig = z.infer<typeof statisticsConfigSchema>;
export type AnySeriesConfig = StatisticsConfig['series'][number];

export const isXlsx = (s: AnySeriesConfig): s is XlsxSeriesConfig => s.source !== 'scb';

const hasList = (v: string) => v.includes(',');

export function parseConfig(raw: unknown): StatisticsConfig {
  const config = statisticsConfigSchema.parse(raw);
  const ids = new Set<string>();
  for (const s of config.series) {
    if (ids.has(s.id)) throw new Error(`duplicate series id ${s.id}`);
    ids.add(s.id);
    if (isXlsx(s)) {
      const periods = s.files.map((f) => f.period);
      if (new Set(periods).size !== periods.length) throw new Error(`${s.id}: duplicate period`);
      continue;
    }
    if (!s.selection.ContentsCode) throw new Error(`${s.id}: selection needs a ContentsCode`);
    if ('Tid' in s.selection) throw new Error(`${s.id}: Tid must not be in selection`);
    const lists = Object.entries(s.selection).filter(([, v]) => hasList(v));
    if (lists.length > 0 && !s.sum) {
      throw new Error(
        `${s.id}: ${lists.map(([k]) => k).join(', ')} has several codes; set sum: true`,
      );
    }
    if (s.sum && lists.length === 0)
      throw new Error(`${s.id}: sum: true without a multi-code dimension`);
    if (s.sum && hasList(s.selection.ContentsCode)) {
      throw new Error(`${s.id}: ContentsCode must be a single code`);
    }
    if (Object.values(s.selection).some((v) => v.includes('*'))) {
      throw new Error(`${s.id}: wildcards are not allowed in selection`);
    }
  }
  return config;
}

/**
 * Request URL for a series. Query parameters are sorted so the URL (and so the cache key) is
 * stable. `Tid=*` is requested and the periods are cut to `from` when parsing.
 */
export function dataUrl(s: SeriesConfig): string {
  const params = Object.entries({ ...s.selection, Tid: '*' })
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `valueCodes[${k}]=${v.split(',').map(encodeURIComponent).join(',')}`);
  return `${SCB_BASE}tables/${s.table}/data?lang=sv&outputFormat=json-stat2&${params.join('&')}`;
}

interface JsonStat2 {
  id?: string[];
  size?: number[];
  value?: (number | null)[];
  dimension?: Record<string, { category?: { index?: Record<string, number> | string[] } }>;
}

function indexOrder(idx: Record<string, number> | string[] | undefined, dim: string): string[] {
  if (!idx) throw new Error(`missing category index for ${dim}`);
  if (Array.isArray(idx)) return idx;
  return Object.entries(idx)
    .sort(([, a], [, b]) => a - b)
    .map(([k]) => k);
}

/**
 * Reads a json-stat2 dataset into period -> value. `Tid` is the period dimension; every other
 * dimension is summed over (a null cell makes the period null, never a partial sum). With
 * `sum: false` every other dimension must have exactly one category. Periods before `from` are
 * dropped; null periods (SCB "..") are dropped too and reported in `missing`.
 */
export function parseJsonStat2(
  raw: unknown,
  opts: { sum: boolean; from: string },
): { values: Map<string, number>; missing: string[] } {
  const ds = raw as JsonStat2;
  if (!ds || !Array.isArray(ds.id) || !Array.isArray(ds.size) || !Array.isArray(ds.value)) {
    throw new Error('not a json-stat2 dataset');
  }
  const { id, size, value } = ds;
  const tidAxis = id.indexOf('Tid');
  if (tidAxis < 0) throw new Error('no Tid dimension');
  id.forEach((d, i) => {
    if (d !== 'Tid' && size[i] !== 1 && !opts.sum) {
      throw new Error(`dimension ${d} has ${size[i]} categories; expected a single selection`);
    }
  });
  const periods = indexOrder(ds.dimension?.Tid?.category?.index, 'Tid');
  const total = size.reduce((a, b) => a * b, 1);
  if (value.length !== total) throw new Error(`expected ${total} values, got ${value.length}`);

  // Row-major strides: the last dimension varies fastest.
  const strides = size.map((_, i) => size.slice(i + 1).reduce((a, b) => a * b, 1));
  const sums = periods.map(() => 0);
  const nulls = periods.map(() => false);
  value.forEach((v, flat) => {
    const t = Math.floor(flat / strides[tidAxis]!) % size[tidAxis]!;
    if (typeof v === 'number') sums[t]! += v;
    else nulls[t] = true;
  });

  const values = new Map<string, number>();
  const missing: string[] = [];
  periods.forEach((p, t) => {
    const key = periodKey(p);
    if (key.slice(0, 4) < opts.from) return;
    if (nulls[t]) missing.push(key);
    // Round away float noise from summing (all current series have at most 1 decimal).
    else values.set(key, Math.round(sums[t]! * 1e6) / 1e6);
  });
  return { values, missing };
}

/** SCB period labels to schema keys: "2022" stays, "2022K1" -> "2022-Q1", "2022M03" -> "2022-03". */
export function periodKey(p: string): string {
  const q = /^(\d{4})K([1-4])$/.exec(p);
  if (q) return `${q[1]}-Q${q[2]}`;
  const m = /^(\d{4})M(\d{2})$/.exec(p);
  if (m) return `${m[1]}-${m[2]}`;
  return p;
}

/**
 * Reads one value from a parsed sheet (see `xlsxSeriesConfigSchema`). Throws when a header check
 * fails, the row is missing or ambiguous, or the cell is not a number (suppressed cells such as
 * ".." are never read as zero).
 */
export function readXlsxValue(sheet: Sheet, c: XlsxSeriesConfig, period: string): number {
  for (const check of c.checks) {
    const got = sheet.get(check.cell);
    if (String(got ?? '').trim() !== check.equals) {
      throw new Error(
        `${c.id} ${period}: header ${check.cell} is ${JSON.stringify(got)}, expected ${JSON.stringify(check.equals)}`,
      );
    }
  }
  const wanted = c.rowLabel ?? period;
  const rows = [...sheet]
    .filter(([ref, v]) => columnOf(ref) === c.labelColumn && String(v).trim() === wanted)
    .map(([ref]) => Number(/\d+$/.exec(ref)![0]));
  if (rows.length !== 1) {
    throw new Error(`${c.id} ${period}: ${rows.length} rows with ${c.labelColumn}="${wanted}"`);
  }
  const ref = `${c.valueColumn}${rows[0]}`;
  const v = sheet.get(ref);
  if (typeof v !== 'number')
    throw new Error(`${c.id} ${period}: ${ref} is ${JSON.stringify(v)}, not a number`);
  return v;
}

export interface BuildSeriesInput {
  config: AnySeriesConfig;
  values: Map<string, number>;
  /** YYYY-MM-DD, used when the values differ from `previous` (or there is none). */
  today: string;
  previous?: StatisticSeries;
}

/** What the series file records of an xlsx read, so a reader can repeat it. */
export function xlsxSelection(c: XlsxSeriesConfig): Record<string, string> {
  return {
    sheet: c.sheet,
    labelColumn: c.labelColumn,
    ...(c.rowLabel ? { rowLabel: c.rowLabel } : {}),
    valueColumn: c.valueColumn,
    ...(new Set(c.files.map((f) => f.url)).size === 1
      ? { url: c.files[0]!.url }
      : Object.fromEntries(c.files.map((f) => [`url ${f.period}`, f.url]))),
  };
}

/** Assembles and validates a series file. `fetched_at` is kept when the data is unchanged. */
export function buildSeries({
  config,
  values,
  today,
  previous,
}: BuildSeriesInput): StatisticSeries {
  const sorted = Object.fromEntries([...values].sort(([a], [b]) => a.localeCompare(b)));
  const selection = isXlsx(config) ? xlsxSelection(config) : config.selection;
  const unchanged =
    previous !== undefined &&
    JSON.stringify(previous.values) === JSON.stringify(sorted) &&
    JSON.stringify(previous.selection) === JSON.stringify(selection) &&
    previous.table === config.table &&
    previous.label === config.label &&
    previous.unit === config.unit;
  return statisticSeriesSchema.parse({
    id: config.id,
    source: config.source,
    table: config.table,
    selection,
    label: config.label,
    unit: config.unit,
    frequency: config.frequency,
    fetched_at: unchanged ? previous.fetched_at : today,
    ...(!isXlsx(config) && config.priceBasis ? { priceBasis: config.priceBasis } : {}),
    values: sorted,
  });
}

export function serializeSeries(s: StatisticSeries): string {
  return `${JSON.stringify(s, null, 2)}\n`;
}

/** Latest year any series covers, for the freshness manifest. */
export function latestYear(series: readonly StatisticSeries[]): string {
  return series
    .flatMap((s) => Object.keys(s.values).map((k) => k.slice(0, 4)))
    .reduce((a, b) => (a > b ? a : b));
}
