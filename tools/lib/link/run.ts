/** One linking run end to end (hemsida-4np.5): plan, (dry-run | execute), then manifest, results and report. */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { writeJsonAtomic } from '../json.ts';
import { createFileCache } from './cache.ts';
import type { LinkConfig } from './config.ts';
import type { Judge } from './judge.ts';
import { buildLinkPlan } from './plan.ts';
import { buildAgreementReport, collectResults, type AgreementReport } from './report.ts';
import type { LinkInputs } from './inputs.ts';
import { classifyLinkPlan, runLinkPlan, type LinkRunSummary, type LinkStatus } from './runner.ts';

export interface LinkExecuteOptions {
  config: LinkConfig;
  inputs: LinkInputs;
  judge: Judge;
  cacheDir: string;
  /** Directory for `<name>/manifest.json` etc. (default `tools/out/link-runs`). */
  runsDir: string;
  dryRun?: boolean;
  maxCostUsd?: number;
  concurrency?: number;
  now?: () => Date;
  log?: (line: string) => void;
}
export interface LinkOutcome {
  plan_hash: string;
  status: LinkStatus;
  summary?: LinkRunSummary;
  report?: AgreementReport;
}

export async function executeLinkRun(opts: LinkExecuteOptions): Promise<LinkOutcome> {
  const { config, inputs } = opts;
  const log = opts.log ?? (() => {});
  const now = opts.now ?? (() => new Date());
  const maxCost = opts.maxCostUsd ?? config.budget.max_cost_usd;
  const plan = buildLinkPlan(config, inputs.pairs, inputs.promises, inputs.evidenceFor);
  const cache = createFileCache(opts.cacheDir);
  const status = classifyLinkPlan(plan, cache);

  log(
    `plan ${plan.plan_hash.slice(0, 12)}: ${plan.pairs.length} pairs -> ${status.total} distinct requests`,
  );
  log(
    `${status.cached} cached, ${status.to_send} to send; estimated ${status.estimated_input_tokens_to_send} ` +
      `input tokens, $${status.estimated_cost_usd_to_send.toFixed(4)} (cap $${maxCost})`,
  );
  if (opts.dryRun) return { plan_hash: plan.plan_hash, status };

  const started = now();
  const summary = await runLinkPlan(plan, {
    judge: opts.judge,
    instructions: config.instructions,
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
  const { results, missing } = collectResults(plan, cache, config.thresholds);
  writeJsonAtomic(resolve(dir, 'manifest.json'), {
    config,
    judge_kind: opts.judge.kind,
    plan_hash: plan.plan_hash,
    status: summary.status,
    error: summary.error ?? null,
    max_cost_usd: maxCost,
    request_count: summary.total,
    cached_count: summary.cached,
    sent_count: summary.sent,
    remaining_count: summary.remaining,
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
  let report: AgreementReport | undefined;
  if (missing === 0 && inputs.pairs.some((p) => p.label)) {
    report = buildAgreementReport(results, inputs.pairs);
    writeJsonAtomic(resolve(dir, 'report.json'), report);
  }
  return { plan_hash: plan.plan_hash, status, summary, report };
}
