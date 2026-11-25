/**
 * Extract per-page text from a manifesto PDF without poppler:
 *   node --experimental-strip-types tools/extract-pdf-text.ts <file.pdf> <source-id> [--python path]
 * Writes tools/out/<source-id>.txt (form-feed separated pages, normalised). Needs python3 with
 * pypdf (docs/manifesto-extraction.md, "Extracting the page text").
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { joinPages } from './lib/pdf-text.ts';

const args = process.argv.slice(2);
const pyIdx = args.indexOf('--python');
const python = pyIdx >= 0 ? (args.splice(pyIdx, 2)[1] ?? 'python3') : 'python3';
const [pdf, sourceId] = args;
if (!pdf || !sourceId) {
  console.error('usage: extract-pdf-text.ts <file.pdf> <source-id> [--python path]');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
let json: string;
try {
  json = execFileSync(python, ['-I', resolve(here, 'extract-pdf-pages.py'), resolve(pdf)], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
} catch (e) {
  console.error(
    `python extraction failed (is pypdf installed for ${python}? see docs/manifesto-extraction.md):\n${e instanceof Error ? e.message : e}`,
  );
  process.exit(1);
}
const pages = JSON.parse(json) as string[];
const outPath = resolve(here, 'out', `${sourceId}.txt`);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, joinPages(pages));
const empty = pages.filter((p) => p.trim() === '').length;
console.log(
  `${outPath}: ${pages.length} pages${empty ? `, ${empty} with no text (scanned?)` : ''}`,
);
