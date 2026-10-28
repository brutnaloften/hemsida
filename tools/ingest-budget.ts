/**
 * Ingest the ESV/Statskontoret årsutfall (expenditure and revenue) into src/data/budget/.
 *   node --experimental-strip-types tools/ingest-budget.ts
 *     [--utgift <url|zip path>] [--inkomst <url|zip path>]
 *     [--revenue-final-through 2023] [--cache <dir>] [--out <dir>]
 *
 * Without --utgift/--inkomst the newest zips are found by scraping the listing page. Downloads are
 * cached in tools/out/budget-cache/ (gitignored) and reused when the file name is already there;
 * files are fetched sequentially with a descriptive User-Agent. Output is deterministic: running
 * it again on the same files yields no diff. See docs/budget-data.md ("Refresh").
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  buildMeta,
  DEFAULT_REVENUE_FINAL_THROUGH,
  parseExpenditure,
  parseListing,
  parseRevenue,
  pickNewest,
  readSingleZipEntry,
  releaseName,
  SOURCE_PAGE,
  stringifyCompact,
  type ReleaseFile,
} from './lib/budget-ingest.ts';
import { budgetMetaSchema, expenditureSchema, revenueSchema } from './lib/schema.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const USER_AGENT = 'brutnaloften-budget-ingest (CC0 open data, sequential fetch)';

const { values } = parseArgs({
  options: {
    utgift: { type: 'string' },
    inkomst: { type: 'string' },
    'revenue-final-through': { type: 'string' },
    cache: { type: 'string', default: resolve(root, 'tools/out/budget-cache') },
    out: { type: 'string', default: resolve(root, 'src/data/budget') },
  },
});

const cacheDir = resolve(values.cache!);
const outDir = resolve(values.out!);
const revenueFinalThrough = values['revenue-final-through']
  ? Number(values['revenue-final-through'])
  : DEFAULT_REVENUE_FINAL_THROUGH;
if (!Number.isInteger(revenueFinalThrough))
  throw new Error('--revenue-final-through must be a year');
mkdirSync(cacheDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}

type Target = { url: string; fileName: string; status: string };

function describe(arg: string): Target {
  if (/^https?:\/\//.test(arg)) {
    const u = new URL(arg);
    return {
      url: arg,
      fileName: u.searchParams.get('fileName') ?? basename(u.pathname),
      status: u.searchParams.get('status') ?? '',
    };
  }
  return { url: arg, fileName: basename(arg), status: '' };
}

async function obtain(target: Target): Promise<{ file: ReleaseFile; zipPath: string }> {
  let zipPath: string;
  if (/^https?:\/\//.test(target.url)) {
    zipPath = resolve(cacheDir, target.fileName.replace(/[^\p{L}\p{N}._ ,-]/gu, '_'));
    if (existsSync(zipPath)) {
      console.log(`cached  ${zipPath}`);
    } else {
      console.log(`fetch   ${target.url}`);
      writeFileSync(zipPath, Buffer.from(await (await fetchOk(target.url)).arrayBuffer()));
    }
  } else {
    zipPath = resolve(target.url);
  }
  const csv = readSingleZipEntry(zipPath);
  return {
    zipPath,
    file: { url: target.url, release: releaseName(target.fileName), status: target.status, csv },
  };
}

let utgift: Target;
let inkomst: Target;
if (values.utgift && values.inkomst) {
  utgift = describe(values.utgift);
  inkomst = describe(values.inkomst);
} else {
  console.log(`list    ${SOURCE_PAGE}`);
  const listing = parseListing(await (await fetchOk(SOURCE_PAGE)).text());
  const pick = (type: 'Utgift' | 'Inkomst', override?: string): Target => {
    if (override) return describe(override);
    const f = pickNewest(listing, type);
    return { url: f.url, fileName: f.fileName, status: f.status };
  };
  utgift = pick('Utgift', values.utgift);
  inkomst = pick('Inkomst', values.inkomst);
}

const expenditureFile = (await obtain(utgift)).file;
const revenueFile = (await obtain(inkomst)).file;

const expenditure = expenditureSchema.parse(parseExpenditure(expenditureFile.csv));
const revenue = revenueSchema.parse(parseRevenue(revenueFile.csv));

const metaPath = resolve(outDir, 'meta.json');
const previous = existsSync(metaPath)
  ? budgetMetaSchema.safeParse(JSON.parse(readFileSync(metaPath, 'utf-8')))
  : null;
const meta = budgetMetaSchema.parse(
  buildMeta({
    expenditure,
    revenue,
    expenditureFile,
    revenueFile,
    revenueFinalThrough,
    today: new Date().toISOString().slice(0, 10),
    previous: previous?.success ? previous.data : null,
  }),
);

for (const [name, data] of [
  ['meta.json', meta],
  ['expenditure.json', expenditure],
  ['revenue.json', revenue],
] as const) {
  const text = stringifyCompact(data) + '\n';
  writeFileSync(resolve(outDir, name), text);
  console.log(`wrote   ${resolve(outDir, name)} (${(text.length / 1024).toFixed(0)} KB)`);
}
console.log(
  `years ${meta.years[0]}-${meta.years[meta.years.length - 1]}; ` +
    `${expenditure.anslag.length} anslag, ${revenue.titlar.length} inkomsttitlar`,
);
