/**
 * Validate a manifesto candidate file. See docs/manifesto-extraction.md. Run with:
 *   node --experimental-strip-types tools/validate-manifesto-candidates.ts --source <id> \
 *     [--pdf path | --pages-text path] [--tido path] [--data-dir dir]
 * Exits non-zero on any error. Makes no network or API calls.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadJson } from './lib/json.ts';
import { idPrefix, splitPages, validateCandidates } from './lib/manifesto-extract.ts';
import { sourceSchema } from './lib/schema.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const { values } = parseArgs({
  options: {
    source: { type: 'string' },
    pdf: { type: 'string' },
    'pages-text': { type: 'string' },
    tido: { type: 'string' },
    term: { type: 'string', default: '2022-2026' },
    'data-dir': { type: 'string', default: resolve(root, 'src/data') },
  },
});

function fail(msg: string): never {
  console.error(`Error: ${msg}`);
  process.exit(2);
}

if (!values.source) fail('--source <source-id> is required');
const dataDir = resolve(values['data-dir']!);
const termDir = resolve(dataDir, values.term!);

const sourcePath = resolve(dataDir, 'sources', `${values.source}.json`);
if (!existsSync(sourcePath)) fail(`source file not found: ${sourcePath}`);
const source = sourceSchema.parse(loadJson(sourcePath));

const candidatesPath = resolve(termDir, 'candidates', `${source.id}.json`);
if (!existsSync(candidatesPath)) fail(`candidate file not found: ${candidatesPath}`);

/** Page texts from a pre-extracted file (pdftotext output, pages separated by form feeds) or the PDF. */
function loadPages(): string[] | null {
  if (values['pages-text']) return splitPages(readFileSync(values['pages-text'], 'utf8'));
  if (values.pdf) {
    // Requires poppler's pdftotext on PATH; "-" writes to stdout, form feed ends each page.
    try {
      const out = execFileSync('pdftotext', [values.pdf, '-'], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      });
      return splitPages(out);
    } catch (err) {
      fail(
        `pdftotext failed (install poppler-utils or pass --pages-text): ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  return null;
}

const promisesDir = resolve(termDir, 'promises');
const promiseFiles = existsSync(promisesDir)
  ? readdirSync(promisesDir).filter((f) => f.endsWith('.json'))
  : [];
const existingIds = new Set(
  promiseFiles.map((f) => {
    const id = (loadJson(resolve(promisesDir, f)) as { id?: unknown }).id;
    return typeof id === 'string' ? id : f.replace(/\.json$/, '');
  }),
);

// Tidö ids: promoted promise files first, falling back to the candidate file.
let tidoIds = new Set([...existingIds].filter((id) => id.startsWith('tido-')));
if (values.tido || tidoIds.size === 0) {
  const tidoPath = values.tido
    ? resolve(values.tido)
    : resolve(termDir, 'candidates', 'tidoavtalet.json');
  if (!existsSync(tidoPath)) fail(`Tidö candidates not found: ${tidoPath}`);
  const tido = loadJson(tidoPath) as { promise?: { id?: string } }[];
  tidoIds = new Set(tido.flatMap((e) => (e.promise?.id ? [e.promise.id] : [])));
}

const result = validateCandidates(loadJson(candidatesPath), {
  sourceId: source.id,
  existingIds,
  tidoIds,
  pages: loadPages(),
  prefix: idPrefix(source),
});

for (const w of result.warnings) console.error(`Warning: ${w}`);
for (const e of result.errors) console.error(`Error: ${e}`);
console.log(
  `${source.id}: ${result.count} candidates, ${result.linked} with links, ${result.errors.length} errors`,
);
process.exit(result.errors.length > 0 ? 1 : 0);
