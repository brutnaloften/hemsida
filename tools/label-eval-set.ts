/**
 * Label the eval set interactively in the terminal (offline, progress saved after every answer).
 *   node --experimental-strip-types tools/label-eval-set.ts [--term 2022-2026] [--redo] [--only-file ids.txt] [--model-labels file.json]
 *
 * Keys per pair: d = show the full evidence detail, r = show what the models answered blind and why (hidden by default so it does not anchor you), m = match, p = partial, c = contradicts, n = no match, s = skip, b = back one pair,
 * q = quit. After a label you may type an optional note (Enter for none).
 * Already labelled pairs are skipped unless --redo. --only-file takes a file with one pair id per line
 * (blank lines and # comments ignored), shows only those pairs and implies --redo. When relabelling, Enter at
 * the note prompt keeps the existing note; type - to remove it. Needs an interactive terminal.
 * If tools/out/eval-briefs/<pair-id>.json exists (tools/build-eval-briefs.ts) its evidence is
 * printed under each pair; otherwise only the stored snippet is shown. See docs/eval-set.md.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadJson, writeJsonAtomic } from './lib/json.ts';
import { Navigator } from './lib/eval-set.ts';
import { briefPath, briefSchema, renderBrief, type Brief } from './lib/eval-brief.ts';
import {
  briefSummarySchema,
  renderSummary,
  useColor,
  type BriefSummary,
} from './lib/eval-summary.ts';
import { evalFileSchema, modelLabelsFileSchema, type EvalLabel } from '../src/schema/eval.ts';

if (!process.stdin.isTTY) {
  console.error('label-eval-set needs an interactive terminal (stdin is not a TTY).');
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
  options: {
    term: { type: 'string', default: '2022-2026' },
    redo: { type: 'boolean', default: false },
    'only-file': { type: 'string' },
    'model-labels': { type: 'string' },
    briefs: { type: 'string', default: resolve(root, 'tools/out/eval-briefs') },
  },
});
const path = resolve(root, 'src/data', values.term!, 'eval/pairs.json');
const file = evalFileSchema.parse(loadJson(path));
// Optional blind model judgements (model-labels.json next to pairs.json); shown on `r`.
const modelLabelsPath = values['model-labels']
  ? resolve(values['model-labels'])
  : resolve(dirname(path), 'model-labels.json');
const modelLabels = existsSync(modelLabelsPath)
  ? modelLabelsFileSchema.parse(loadJson(modelLabelsPath)).labels
  : {};
const keys: Record<string, EvalLabel> = {
  m: 'match',
  p: 'partial',
  c: 'contradicts',
  n: 'no_match',
};

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

let only: Set<number> | undefined;
if (values['only-file']) {
  const ids = readFileSync(resolve(values['only-file']), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  const unknown = ids.filter((id) => !file.pairs.some((x) => x.id === id));
  if (unknown.length) {
    console.error(`Unknown pair ids in ${values['only-file']}:\n${unknown.join('\n')}`);
    process.exit(1);
  }
  if (!ids.length) {
    console.error(`${values['only-file']} lists no pair ids.`);
    process.exit(1);
  }
  only = new Set(ids.map((id) => file.pairs.findIndex((x) => x.id === id)));
}
const nav = new Navigator(file.pairs, values.redo || only !== undefined, only);
while (nav.current !== null) {
  const p = file.pairs[nav.current]!;
  const done = file.pairs.filter((x) => x.label).length;
  console.log(`\n=== ${nav.current + 1}/${file.pairs.length} (${done} labelled) ===`);
  console.log(`LÖFTE: ${p.promise_title}\n${p.promise_text}\nCitat: "${p.promise_quote}"`);
  console.log(`\nDOKUMENT: [${p.document_type}] ${p.document_title}\n${p.snippet}\n${p.url}`);
  let brief: Brief | null = null;
  let briefSummary: BriefSummary | undefined;
  const bp = briefPath(values.briefs!, p.id);
  if (existsSync(bp)) {
    try {
      const raw = loadJson(bp);
      brief = briefSchema.parse(raw);
      briefSummary = briefSummarySchema.parse(raw).summary;
    } catch {
      console.log(
        `\n(Underlaget ${bp} är föråldrat eller trasigt; kör build-eval-briefs.ts igen.)`,
      );
    }
  }
  const width = Math.min(120, Math.max(60, process.stdout.columns ?? 100));
  const summaryText = brief
    ? renderSummary(brief, briefSummary, {
        width,
        color: useColor(process.stdout.isTTY, process.env),
      })
    : null;
  if (summaryText) console.log(`\n${summaryText}`);
  // Without a stored summary (older briefs) the full detail is shown straight away.
  let detailShown = false;
  if (brief && !summaryText) {
    console.log(`\n${renderBrief(brief)}`);
    detailShown = true;
  }
  if (p.label)
    console.log(`(nuvarande etikett: ${p.label}${p.note ? `; anteckning: ${p.note}` : ''})`);
  const menu = '[m]atch / [p]artial / [c]ontradicts / [n]o match / [s]kip / [b]ack / [q]uit: ';
  let key = '';
  for (;;) {
    const judgements = Object.entries(modelLabels[p.id] ?? {});
    const offer =
      (brief && !detailShown ? '\n[d] visa detaljer   ' : '\n') +
      (judgements.length ? '[r] modellernas svar   ' : '');
    key = (await rl.question(offer + menu)).trim().toLowerCase();
    if (key === 'r' && judgements.length) {
      for (const [model, j] of judgements) {
        const stage = j.stage ? `, stage: ${j.stage}` : '';
        console.log(`\n${model}: ${j.label} (${j.confidence}${stage})\n  ${j.reason}`);
      }
      continue;
    }
    if (key === 'd' && brief) {
      // Shown once; pressing d again just asks again.
      if (!detailShown) console.log(`\n${renderBrief(brief)}`);
      detailShown = true;
      continue;
    }
    break;
  }
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
    console.log(`Unknown key "${key}". Use d, r, m, p, c, n, s, b or q.`);
    continue;
  }
  const prompt = p.note
    ? 'Note (Enter keeps the current note, - removes it): '
    : 'Note (optional): ';
  const note = (await rl.question(prompt)).trim();
  p.label = label;
  if (note === '-') delete p.note;
  else if (note) p.note = note;
  else if (!p.note) delete p.note;
  writeJsonAtomic(path, file);
  nav.advance();
}
rl.close();
summary();
