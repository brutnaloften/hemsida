/**
 * Executes a linking plan (hemsida-4np.5): concurrency limit, content-addressed cache (a request whose key is
 * cached is never sent again, so re-runs and resumes are free) and a hard budget guard.
 */
import type { LinkCache } from './cache.ts';
import { isTransientJudgeError, type Judge } from './judge.ts';
import type { LinkPlan } from './plan.ts';

export interface LinkStatus {
  total: number;
  cached: number;
  to_send: number;
  estimated_input_tokens_to_send: number;
  estimated_cost_usd_to_send: number;
}

export function classifyLinkPlan(plan: LinkPlan, cache: LinkCache): LinkStatus {
  const todo = plan.requests.filter((r) => !cache.has(r.key));
  return {
    total: plan.requests.length,
    cached: plan.requests.length - todo.length,
    to_send: todo.length,
    estimated_input_tokens_to_send: todo.reduce((a, r) => a + r.estimated_input_tokens, 0),
    estimated_cost_usd_to_send: todo.reduce((a, r) => a + r.estimated_cost_usd, 0),
  };
}

export interface LinkRunOptions {
  judge: Judge;
  instructions: string;
  cache: LinkCache;
  concurrency?: number;
  maxCostUsd: number;
  usdPerMillionTokens: number;
  onProgress?: (done: number, total: number) => void;
}
export interface LinkRunSummary {
  /** `complete` also covers runs that skipped transient errors; see `skipped`. */
  status: 'complete' | 'budget_exceeded' | 'failed';
  error?: string;
  total: number;
  cached: number;
  sent: number;
  /** Requests neither cached nor sent (only when the run stopped early). */
  remaining: number;
  /** Requests skipped on a transient error (429, 529, 5xx); a re-run retries them. */
  skipped: number;
  /** All tokens of the sent requests (input, output, cache). */
  tokens: number;
  /** Spend: the judge's reported cost where it gives one, else tokens at the flat price. */
  cost_usd: number;
}

export async function runLinkPlan(plan: LinkPlan, opts: LinkRunOptions): Promise<LinkRunSummary> {
  const price = opts.usdPerMillionTokens / 1e6;
  const todo = plan.requests.filter((r) => !opts.cache.has(r.key));
  const summary: LinkRunSummary = {
    status: 'complete',
    total: plan.requests.length,
    cached: plan.requests.length - todo.length,
    sent: 0,
    remaining: todo.length,
    skipped: 0,
    tokens: 0,
    cost_usd: 0,
  };
  let next = 0;
  let inflightEstimate = 0;
  let stopped = false;

  async function worker(): Promise<void> {
    while (!stopped && next < todo.length) {
      const req = todo[next++]!;
      // Hard guard: actual spend plus everything in flight plus this request's estimate must fit.
      if (summary.cost_usd + inflightEstimate + req.estimated_cost_usd > opts.maxCostUsd) {
        stopped = true;
        summary.status = 'budget_exceeded';
        summary.error =
          `budget guard: spent $${summary.cost_usd.toFixed(4)} and the next request is estimated at ` +
          `$${req.estimated_cost_usd.toFixed(4)}, which would exceed the cap of $${opts.maxCostUsd}. ` +
          `Completed requests are cached; re-run (with a higher --max-cost) to resume.`;
        return;
      }
      inflightEstimate += req.estimated_cost_usd;
      try {
        const res = await opts.judge.judge({
          instructions: opts.instructions,
          promise: req.promise,
          evidence: req.evidence,
        });
        opts.cache.put(req.key, { judgement: res.judgement, tokens: res.tokens });
        summary.sent++;
        summary.tokens += res.tokens;
        summary.cost_usd += res.cost_usd ?? res.tokens * price;
        opts.onProgress?.(summary.cached + summary.sent, summary.total);
      } catch (err) {
        if (isTransientJudgeError(err)) {
          summary.skipped++;
          continue;
        }
        stopped = true;
        if (summary.status === 'complete') {
          summary.status = 'failed';
          summary.error = err instanceof Error ? err.message : String(err);
        }
      } finally {
        inflightEstimate -= req.estimated_cost_usd;
      }
    }
  }

  const n = Math.max(1, Math.min(opts.concurrency ?? 4, todo.length || 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  summary.remaining = todo.length - summary.sent;
  if (summary.skipped > 0 && summary.status === 'complete') {
    summary.error = `${summary.skipped} request(s) skipped on transient API errors (429/529/5xx); re-run to retry them.`;
  }
  return summary;
}
