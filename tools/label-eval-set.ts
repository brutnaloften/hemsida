/**
 * Label the eval set interactively in the terminal (offline, progress saved after every answer).
 *   node --experimental-strip-types tools/label-eval-set.ts [--term 2022-2026] [--redo]
 *
 * Keys per pair: m = match, p = partial, n = no match, s = skip, b = back one pair,
 * q = quit. After a label you may type an optional note (Enter for none).
 * Already labelled pairs are skipped unless --redo. Needs an interactive terminal.
 * See docs/eval-set.md.
 */
import { createInterface } from 'node:readline/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadJson, writeJsonAtomic } from './lib/json.ts';
import { Navigator } from './lib/eval-set.ts';
import { evalFileSchema, type EvalLabel } from '../src/schema/eval.ts';

if (!process.stdin.isTTY) {
  console.error('label-eval-set needs an interactive terminal (stdin is not a TTY).');
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
  options: {
    term: { type: 'string', default: '2022-2026' },
    redo: { type: 'boolean', default: false },
  },
});
const path = resolve(root, 'src/data', values.term!, 'eval/pairs.json');
const file = evalFileSchema.parse(loadJson(path));
const keys: Record<string, EvalLabel> = { m: 'match', p: 'partial', n: 'no_match' };

function summary(): void {
  const labelled = file.pairs.filter((x) => x.label).length;
  console.log(`\n${labelled}/${file.pairs.length} labelled. Saved to ${path}`);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
// Every answer is saved immediately, so Ctrl-C only needs to report.
rl.on('SIGINT', () => {
  summary();
  process.exit(0);
});

const nav = new Navigator(file.pairs, values.redo);
while (nav.current !== null) {
  const p = file.pairs[nav.current]!;
  const done = file.pairs.filter((x) => x.label).length;
  console.log(`\n=== ${nav.current + 1}/${file.pairs.length} (${done} labelled) ===`);
  console.log(`LÖFTE: ${p.promise_title}\n${p.promise_text}\nCitat: "${p.promise_quote}"`);
  console.log(`\nDOKUMENT: [${p.document_type}] ${p.document_title}\n${p.snippet}\n${p.url}`);
  if (p.label) console.log(`(nuvarande etikett: ${p.label})`);
  const key = (await rl.question('\n[m]atch / [p]artial / [n]o match / [s]kip / [b]ack / [q]uit: '))
    .trim()
    .toLowerCase();
  if (key === 'q') break;
  if (key === 'b') {
    if (!nav.back()) console.log('Already at the first pair.');
    continue;
  }
  if (key === 's') {
    nav.advance();
    continue;
  }
  const label = keys[key];
  if (!label) {
    console.log(`Unknown key "${key}". Use m, p, n, s, b or q.`);
    continue;
  }
  const note = (await rl.question('Note (optional): ')).trim();
  p.label = label;
  if (note) p.note = note;
  else delete p.note;
  writeJsonAtomic(path, file);
  nav.advance();
}
rl.close();
summary();
