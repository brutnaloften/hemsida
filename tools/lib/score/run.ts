/** One scoring run end to end (hemsida-vzn): plan, (dry-run | execute), then manifest, results and report. */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { writeJsonAtomic } from '../json.ts';
import { createFileCache } from './cache.ts';
import type { ScoreConfig } from './config.ts';
import { buildPlan } from './plan.ts';
import { buildReport, type Report } from './report.ts';
import type { RunInputs } from './inputs.ts';
import { aggregateResults } from './results.ts';
import { classifyPlan, runPlan, type PlanStatus, type RunSummary } from './runner.ts';
import type { Scorer } from './scorer.ts';

export interface ExecuteOptions {
  config: ScoreConfig;
  inputs: RunInputs;
  scorer: Scorer;
  cacheDir: string;
  /** Directory for `<name>/manifest.json` etc. (default `tools/out/runs`). */
  runsDir: string;
  dryRun?: boolean;
  maxCostUsd?: number;
  concurrency?: number;
  now?: () => Date;
  log?: (line: string) => void;
}
export interface ExecuteOutcome {
  plan_hash: string;
  status: PlanStatus;
  summary?: RunSummary;
  report?: Report;
}

export async function executeRun(opts: ExecuteOptions): Promise<ExecuteOutcome> {
  const { config, inputs } = opts;
  const log = opts.log ?? (() => {});
  const now = opts.now ?? (() => new Date());
  const maxCost = opts.maxCostUsd ?? config.budget.max_cost_usd;
  const plan = buildPlan(config, inputs.documents, inputs.promises);
  const cache = createFileCache(opts.cacheDir);
  const status = classifyPlan(plan, cache);

  log(
    `plan ${plan.plan_hash.slice(0, 12)}: ${plan.documents} documents, ${plan.chunks} chunks, ` +
      `${plan.promises} promises in ${plan.batches_per_chunk} batches per chunk -> ${status.total} requests`,
  );
  log(
    `${status.cached} cached, ${status.to_send} to send; estimated ${status.estimated_input_tokens_to_send} ` +
      `input tokens, $${status.estimated_cost_usd_to_send.toFixed(4)} (cap $${maxCost})`,
  );
  if (opts.dryRun) return { plan_hash: plan.plan_hash, status };

  const started = now();
  const summary = await runPlan(plan, {
    scorer: opts.scorer,
    cache,
    concurrency: opts.concurrency,
    maxCostUsd: maxCost,
    usdPerMillionTokens: config.budget.usd_per_million_tokens,
    onProgress: (done, total) => {
      if (done % 25 === 0 || done === total) log(`${done}/${total} requests`);
    },
  });
  const finished = now();

  const dir = resolve(opts.runsDir, config.name);
  mkdirSync(dir, { recursive: true });
  const { results, missing } = aggregateResults(plan, cache);
  writeJsonAtomic(resolve(dir, 'manifest.json'), {
    config,
    scorer_kind: opts.scorer.kind,
    plan_hash: plan.plan_hash,
    status: summary.status,
    error: summary.error ?? null,
    max_cost_usd: maxCost,
    request_count: summary.total,
    cached_count: summary.cached,
    sent_count: summary.sent,
    remaining_count: summary.remaining,
    skipped_count: summary.skipped,
    api_requests: summary.api_requests,
    input_tokens: summary.input_tokens,
    cost_usd: summary.cost_usd,
    estimated_input_tokens: plan.estimated_input_tokens,
    estimated_cost_usd: plan.estimated_cost_usd,
    started_at: started.toISOString(),
    finished_at: finished.toISOString(),
  });
  writeJsonAtomic(resolve(dir, 'results.json'), {
    plan_hash: plan.plan_hash,
    complete: missing === 0,
    results,
  });
  let report: Report | undefined;
  if (inputs.pairs.length && missing === 0) {
    report = buildReport(results, inputs.pairs);
    writeJsonAtomic(resolve(dir, 'report.json'), report);
  }
  return { plan_hash: plan.plan_hash, status, summary, report };
}
