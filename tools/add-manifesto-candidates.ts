/**
 * Turn raw extracted candidates into schema-valid manifesto candidate entries and merge them
 * into the candidate file. See docs/manifesto-extraction.md. Run with:
 *   node --experimental-strip-types tools/add-manifesto-candidates.ts --source <id> \
 *     --input raw.json [--date YYYY-MM-DD] [--data-dir dir] [--term 2022-2026]
 * `raw.json` is an array of objects shaped like rawManifestoCandidateSchema. Entries already in
 * the candidate file from the pages the input covers are replaced. Makes no network or API calls.
 */

import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadJson, writeJson } from './lib/json.ts';
import { addRawCandidates, manifestoEntrySchema } from './lib/manifesto-extract.ts';
import { sourceSchema } from './lib/schema.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const { values } = parseArgs({
  options: {
    source: { type: 'string' },
    input: { type: 'string' },
    date: { type: 'string', default: new Date().toISOString().slice(0, 10) },
    term: { type: 'string', default: '2022-2026' },
    'data-dir': { type: 'string', default: resolve(root, 'src/data') },
  },
});

function fail(msg: string): never {
  console.error(`Error: ${msg}`);
  process.exit(2);
}

if (!values.source) fail('--source <source-id> is required');
if (!values.input) fail('--input <raw.json> is required');
const dataDir = resolve(values['data-dir']!);
const termDir = resolve(dataDir, values.term!);

const sourcePath = resolve(dataDir, 'sources', `${values.source}.json`);
if (!existsSync(sourcePath)) fail(`source file not found: ${sourcePath}`);
const parsedSource = sourceSchema.safeParse(loadJson(sourcePath));
if (!parsedSource.success) fail(`invalid source file ${sourcePath}`);
const source = parsedSource.data;

const rawList = loadJson(resolve(values.input));
if (!Array.isArray(rawList)) fail('input must be a JSON array');

const candidatesPath = resolve(termDir, 'candidates', `${source.id}.json`);
const existingData = existsSync(candidatesPath) ? loadJson(candidatesPath) : [];
const existing = manifestoEntrySchema.array().safeParse(existingData);
if (!existing.success) fail(`existing candidate file is invalid: ${candidatesPath}`);

const promisesDir = resolve(termDir, 'promises');
const existingIds = new Set(
  existsSync(promisesDir)
    ? readdirSync(promisesDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace(/\.json$/, ''))
    : [],
);

try {
  const merged = addRawCandidates(
    rawList,
    source,
    existingIds,
    existing.data,
    values.date!,
    values.term!,
  );
  writeJson(candidatesPath, merged);
  console.log(
    `${source.id}: wrote ${merged.length} candidates (${rawList.length} added or replaced)`,
  );
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}
