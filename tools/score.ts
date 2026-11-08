/**
 * Declarative, resumable, budget-guarded scoring run (hemsida-vzn). See docs/scoring-harness.md.
 *   pnpm score tools/score-configs/tido-eval-v1.json --dry-run
 *   pnpm score tools/score-configs/tido-corpus-v1.json --shard 2/5 --dry-run   (one disjoint slice of the corpus)
 *   pnpm score tools/score-configs/tido-eval-v1.json [--max-cost 2] [--concurrency 4] [--scorer fake]
 * Needs JEV_TOKEN (loaded from .env by the pnpm script) for the jev scorer; never printed or written.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parseScoreConfig } from './lib/score/config.ts';
import { loadInputs } from './lib/score/inputs.ts';
import { formatReport } from './lib/score/report.ts';
import { executeRun } from './lib/score/run.ts';
import { parseShard } from './lib/score/shard.ts';
import { scorerFor } from './lib/score/scorer.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'dry-run': { type: 'boolean', default: false },
    'max-cost': { type: 'string' },
    concurrency: { type: 'string', default: '4' },
    scorer: { type: 'string' },
    shard: { type: 'string' },
    'store-file': { type: 'string' },
    'cache-dir': { type: 'string', default: resolve(root, 'tools/out/score-cache') },
    'runs-dir': { type: 'string', default: resolve(root, 'tools/out/runs') },
    'text-dir': { type: 'string', default: resolve(root, 'tools/out/riksdag-text') },
  },
});
const configPath = positionals[0];
if (!configPath)
  throw new Error('usage: pnpm score <config.json> [--dry-run] [--max-cost <usd>] [--shard i/n]');

let config = parseScoreConfig(JSON.parse(readFileSync(resolve(configPath), 'utf8')));
if (values.scorer) {
  if (values.scorer !== 'fake') throw new Error('--scorer only supports "fake" (smoke runs)');
  config = { ...config, name: `${config.name}-fake`, scorer: { kind: 'fake', model: 'fake' } };
}
const shard = values.shard === undefined ? undefined : parseShard(values.shard);
if (shard) config = { ...config, name: `${config.name}-shard-${shard.index}-of-${shard.count}` };
const maxCost = values['max-cost'] === undefined ? undefined : Number(values['max-cost']);
if (maxCost !== undefined && !(maxCost > 0))
  throw new Error('--max-cost must be a positive number');

const concurrency = Number(values.concurrency);
if (!Number.isInteger(concurrency) || concurrency < 1)
  throw new Error('--concurrency must be a positive integer');

const inputs = loadInputs(config, root, values['text-dir']!, {
  storePath: values['store-file'],
  shard,
});
if (shard) {
  console.error(`shard ${shard.index}/${shard.count}: ${inputs.documents.length} documents`);
}
const outcome = await executeRun({
  config,
  inputs,
  scorer: scorerFor(config.scorer.kind, config.scorer.model, values['dry-run'] ?? false),
  cacheDir: values['cache-dir']!,
  runsDir: values['runs-dir']!,
  dryRun: values['dry-run'],
  maxCostUsd: maxCost,
  concurrency,
  log: (l) => console.error(l),
});

if (outcome.summary) {
  const s = outcome.summary;
  console.log(
    `${s.status}: ${s.sent} sent, ${s.cached} cached, ${s.remaining} remaining; ` +
      `${s.input_tokens} input tokens, $${s.cost_usd.toFixed(4)}`,
  );
  if (outcome.report) console.log('\n' + formatReport(outcome.report));
  if (s.status !== 'complete') {
    console.error(s.error);
    process.exitCode = 1;
  }
}
