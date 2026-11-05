/**
 * Executes a scoring plan (hemsida-vzn): concurrency limit, content-addressed cache (a request whose key is
 * cached is never sent again, so re-runs and resumes are free), too-long splitting and a hard budget guard.
 */
import type { CacheEntry, ResultCache } from './cache.ts';
import type { Plan, Request } from './plan.ts';
import { TooLongError, type Scorer } from './scorer.ts';

export interface PlanStatus {
  total: number;
  cached: number;
  to_send: number;
  estimated_input_tokens_to_send: number;
  estimated_cost_usd_to_send: number;
}

/** Cached vs to-send, with the estimate for what is still to send. No scorer involved. */
export function classifyPlan(plan: Plan, cache: ResultCache): PlanStatus {
  const todo = plan.requests.filter((r) => !cache.has(r.key));
  return {
    total: plan.requests.length,
    cached: plan.requests.length - todo.length,
    to_send: todo.length,
    estimated_input_tokens_to_send: todo.reduce((a, r) => a + r.estimated_input_tokens, 0),
    estimated_cost_usd_to_send: todo.reduce((a, r) => a + r.estimated_cost_usd, 0),
  };
}

export interface RunOptions {
  scorer: Scorer;
  cache: ResultCache;
  concurrency?: number;
  maxCostUsd: number;
  usdPerMillionTokens: number;
  onProgress?: (done: number, total: number) => void;
}
export interface RunSummary {
  status: 'complete' | 'budget_exceeded' | 'failed';
  error?: string;
  total: number;
  cached: number;
  sent: number;
  /** Requests neither cached nor sent (only when the run stopped early). */
  remaining: number;
  api_requests: number;
  input_tokens: number;
  cost_usd: number;
}

/** Ask one state; if the scorer says too long, split in half and combine (max per question). */
async function scoreWithSplit(
  scorer: Scorer,
  state: string,
  questions: Record<string, string>,
): Promise<CacheEntry> {
  try {
    const res = await scorer.score(state, questions);
    return { answers: res.answers, input_tokens: res.input_tokens, api_requests: 1 };
  } catch (err) {
    if (!(err instanceof TooLongError) || state.length < 2000) throw err;
    const cut = state.lastIndexOf('\n', state.length / 2);
    const mid = cut > 0 ? cut : Math.floor(state.length / 2);
    const x = await scoreWithSplit(scorer, state.slice(0, mid), questions);
    const y = await scoreWithSplit(scorer, state.slice(mid + 1), questions);
    const answers = { ...x.answers };
    for (const [k, v] of Object.entries(y.answers)) answers[k] = Math.max(answers[k] ?? 0, v);
    return {
      answers,
      input_tokens: x.input_tokens + y.input_tokens,
      api_requests: x.api_requests + y.api_requests,
    };
  }
}

export async function runPlan(plan: Plan, opts: RunOptions): Promise<RunSummary> {
  const price = opts.usdPerMillionTokens / 1e6;
  const todo: Request[] = plan.requests.filter((r) => !opts.cache.has(r.key));
  const summary: RunSummary = {
    status: 'complete',
    total: plan.requests.length,
    cached: plan.requests.length - todo.length,
    sent: 0,
    remaining: todo.length,
    api_requests: 0,
    input_tokens: 0,
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
        const entry = await scoreWithSplit(opts.scorer, req.state, req.questions);
        opts.cache.put(req.key, entry);
        summary.sent++;
        summary.api_requests += entry.api_requests;
        summary.input_tokens += entry.input_tokens;
        summary.cost_usd += entry.input_tokens * price;
        opts.onProgress?.(summary.cached + summary.sent, summary.total);
      } catch (err) {
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
  return summary;
}
