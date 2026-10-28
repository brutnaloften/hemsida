/**
 * Fetches KPI and GDP from SCB PxWebApi v2 and writes src/data/budget/macro.json.
 *
 *   node --experimental-strip-types tools/ingest-macro.ts
 *
 * Two requests, sequential, well inside SCB's limit of 30 calls per 10 seconds.
 * Rerunning with unchanged upstream data produces no diff.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BNP_QUERY,
  BNP_TABLE,
  KPI_QUERY,
  KPI_TABLE,
  buildMacro,
  parseJsonStat2Years,
  serializeMacro,
  tableUrl,
} from './lib/macro-ingest.ts';
import { macroSchema } from './lib/schema.ts';

const OUT = resolve(import.meta.dirname, '../src/data/budget/macro.json');

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'brutnaloften-ingest (political promise tracker)',
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

const kpi = parseJsonStat2Years(await getJson(tableUrl(KPI_TABLE, KPI_QUERY)));
const bnp = parseJsonStat2Years(await getJson(tableUrl(BNP_TABLE, BNP_QUERY)));

const previous = existsSync(OUT)
  ? macroSchema.parse(JSON.parse(readFileSync(OUT, 'utf8')))
  : undefined;
const macro = buildMacro({ kpi, bnp, today: new Date().toISOString().slice(0, 10), previous });
writeFileSync(OUT, serializeMacro(macro));
console.log(`wrote ${OUT} (${macro.years[0]}-${macro.years.at(-1)})`);
