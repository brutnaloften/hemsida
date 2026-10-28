/**
 * SCB PxWebApi v2 macro series for `src/data/budget/macro.json`.
 *
 * Pure parsing and assembly live here; the fetching is in `tools/ingest-macro.ts`.
 * See docs/budget-data.md ("SCB PxWebApi v2") for table ids and request shape.
 */
import { macroSchema, type Macro } from './schema.ts';

export const SCB_BASE = 'https://api.scb.se/OV0104/v2beta/api/v2/';
export const FIRST_YEAR = 2006;

export const KPI_TABLE = 'TAB4352';
export const BNP_TABLE = 'TAB3610';

export const KPI_QUERY =
  'lang=sv&outputFormat=json-stat2&valueCodes[ContentsCode]=*&valueCodes[Tid]=*';
export const BNP_QUERY =
  'lang=sv&outputFormat=json-stat2&valueCodes[Anvandningstyp]=BNPM&valueCodes[ContentsCode]=000000RQ&valueCodes[Tid]=*';

export function tableUrl(table: string, query: string): string {
  return `${SCB_BASE}tables/${table}/data?${query}`;
}

/**
 * Reads a json-stat2 dataset that has a `Tid` (year) dimension and size 1 in
 * every other dimension. Returns year -> value (null where SCB has no value).
 */
export function parseJsonStat2Years(raw: unknown): Map<number, number | null> {
  const ds = raw as {
    id?: string[];
    size?: number[];
    value?: (number | null)[];
    dimension?: Record<string, { category?: { index?: Record<string, number> | string[] } }>;
  };
  if (!ds || !Array.isArray(ds.id) || !Array.isArray(ds.size) || !Array.isArray(ds.value)) {
    throw new Error('not a json-stat2 dataset');
  }
  const sizes = ds.size;
  ds.id.forEach((id, i) => {
    if (id !== 'Tid' && sizes[i] !== 1) {
      throw new Error(`dimension ${id} has ${sizes[i]} categories; expected a single selection`);
    }
  });
  const index = ds.dimension?.Tid?.category?.index;
  if (!index || Array.isArray(index)) throw new Error('missing Tid category index');
  const out = new Map<number, number | null>();
  for (const [label, pos] of Object.entries(index)) {
    const year = Number(label);
    if (!Number.isInteger(year)) throw new Error(`unexpected Tid label ${label}`);
    const v = ds.value[pos];
    out.set(year, typeof v === 'number' ? v : null);
  }
  return out;
}

export interface BuildMacroInput {
  kpi: Map<number, number | null>;
  bnp: Map<number, number | null>;
  /** YYYY-MM-DD, used when a series differs from `previous` (or there is none). */
  today: string;
  previous?: Macro;
}

/**
 * Assembles macro.json content. Years run from FIRST_YEAR to the latest KPI
 * year. A year missing from BNP becomes null with a note. `fetched_at` is kept
 * from `previous` when that series is unchanged, so reruns produce no diff.
 */
export function buildMacro({ kpi, bnp, today, previous }: BuildMacroInput): Macro {
  const kpiYears = [...kpi].filter(([, v]) => v !== null).map(([y]) => y);
  const last = Math.max(...kpiYears);
  const years: number[] = [];
  for (let y = FIRST_YEAR; y <= last; y++) years.push(y);

  const kpiValues: Record<string, number> = {};
  const bnpValues: Record<string, number | null> = {};
  const missing: number[] = [];
  for (const y of years) {
    const k = kpi.get(y);
    if (k == null) throw new Error(`KPI missing for ${y}`);
    kpiValues[String(y)] = k;
    const b = bnp.get(y) ?? null;
    bnpValues[String(y)] = b;
    if (b === null) missing.push(y);
  }

  const fetched = (prev: object | undefined, next: object, at?: string) =>
    prev && at && JSON.stringify(prev) === JSON.stringify(next) ? at : today;

  const result: Macro = {
    years,
    kpi: {
      source: KPI_TABLE,
      fetched_at: fetched(previous?.kpi.values, kpiValues, previous?.kpi.fetched_at),
      base: '1980=100',
      values: kpiValues,
    },
    bnp: {
      source: BNP_TABLE,
      fetched_at: fetched(previous?.bnp.values, bnpValues, previous?.bnp.fetched_at),
      unit: 'mn kr',
      values: bnpValues,
      ...(missing.length > 0
        ? {
            note: `BNP för ${missing.join(', ')} är inte publicerat av SCB ännu; andel av BNP saknas för dessa år.`,
          }
        : {}),
    },
  };
  return macroSchema.parse(result);
}

/** Deterministic serialisation: fixed key order from buildMacro, trailing newline. */
export function serializeMacro(macro: Macro): string {
  return `${JSON.stringify(macro, null, 2)}\n`;
}
