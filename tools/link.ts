/**
 * Declarative, resumable, budget-guarded linking run (hemsida-4np.5): a judge model reads each candidate
 * promise/document pair and proposes a relevance label and document stage for human review. See
 * docs/link-harness.md.
 *   pnpm link-pairs tools/link-configs/eval-v1.json --dry-run
 *   pnpm link-pairs tools/link-configs/eval-v1.json [--max-cost 2] [--concurrency 2] [--limit 5] [--judge fake]
 * The claude judge uses the local subscription login and refuses to run with ANTHROPIC_API_KEY set; the api
 * judge is billed and needs it. Nothing here sets evidence or a verdict.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parseLinkConfig } from './lib/link/config.ts';
import { loadLinkInputs } from './lib/link/inputs.ts';
import { judgeFor } from './lib/link/judge.ts';
import { formatAgreementReport } from './lib/link/report.ts';
import { executeLinkRun } from './lib/link/run.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'dry-run': { type: 'boolean', default: false },
    'max-cost': { type: 'string' },
    concurrency: { type: 'string', default: '2' },
    judge: { type: 'string' },
    limit: { type: 'string' },
    'cache-dir': { type: 'string', default: resolve(root, 'tools/out/link-cache') },
    'runs-dir': { type: 'string', default: resolve(root, 'tools/out/link-runs') },
    'text-dir': { type: 'string', default: resolve(root, 'tools/out/riksdag-text') },
  },
});
const configPath = positionals[0];
if (!configPath)
  throw new Error(
    'usage: pnpm link-pairs <config.json> [--dry-run] [--max-cost <usd>] [--limit n]',
  );

let config = parseLinkConfig(JSON.parse(readFileSync(resolve(configPath), 'utf8')));
if (values.judge) {
  if (values.judge !== 'fake') throw new Error('--judge only supports "fake" (smoke runs)');
  config = { ...config, name: `${config.name}-fake`, judge: { kind: 'fake', model: 'fake' } };
}
const limit = values.limit === undefined ? undefined : Number(values.limit);
if (limit !== undefined) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('--limit must be a positive integer');
  config = { ...config, name: `${config.name}-limit-${limit}` };
}
const maxCost = values['max-cost'] === undefined ? undefined : Number(values['max-cost']);
if (maxCost !== undefined && !(maxCost > 0))
  throw new Error('--max-cost must be a positive number');
const concurrency = Number(values.concurrency);
if (!Number.isInteger(concurrency) || concurrency < 1)
  throw new Error('--concurrency must be a positive integer');

const inputs = loadLinkInputs(config, root, values['text-dir']!, { limit });
const outcome = await executeLinkRun({
  config,
  inputs,
  judge: judgeFor(config.judge.kind, config.judge.model, values['dry-run'] ?? false),
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
    `${s.status}: ${s.sent} sent, ${s.cached} cached, ${s.remaining} remaining, ${s.skipped} skipped; ` +
      `${s.tokens} tokens, $${s.cost_usd.toFixed(4)}`,
  );
  if (outcome.report) console.log('\n' + formatAgreementReport(outcome.report));
  if (s.status === 'complete' && s.error) console.error(s.error);
  if (s.status !== 'complete') {
    console.error(s.error);
    process.exitCode = 1;
  }
}
