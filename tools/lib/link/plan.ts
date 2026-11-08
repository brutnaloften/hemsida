/**
 * Pure, deterministic planning for a linking run (hemsida-4np.5): one request per distinct (promise,
 * document evidence) with a content-hash key, so the same inputs always give the same plan and tokens and
 * cost are estimated before anything is sent. No I/O: evidence text is supplied by the caller.
 */
import { sha256, stableJson } from '../score/plan.ts';
import type { LinkConfig } from './config.ts';

export interface LinkPair {
  /** `<promise_id>::<document_id>`. */
  id: string;
  promise_id: string;
  document_id: string;
  document_title: string;
  doktyp: string;
  /** Hand label and stage when the pair is in the eval set. */
  label: 'match' | 'partial' | 'contradicts' | 'no_match' | null;
  stage?: 'definitive' | 'preparatory' | 'background';
}
export interface LinkPromise {
  id: string;
  title: string;
  text: string;
}
export interface LinkRequest {
  key: string;
  promise: LinkPromise;
  evidence: string;
  estimated_input_tokens: number;
  estimated_cost_usd: number;
}
export interface LinkPlan {
  plan_hash: string;
  /** Every pair with the key of its request (several pairs can share one). */
  pairs: { pair: LinkPair; key: string }[];
  /** Distinct requests, sorted by key. */
  requests: LinkRequest[];
  estimated_input_tokens: number;
  estimated_cost_usd: number;
}

/**
 * Cache key of one judgement: judge kind and model, prompt version, the promise and a hash of the evidence
 * text. Pair ids and document titles are not in it (titles are part of the evidence), so any two pairs
 * that show the judge the same thing share an entry, across runs and people.
 */
export function requestKey(
  config: Pick<LinkConfig, 'judge' | 'template_version'>,
  promise: Pick<LinkPromise, 'title' | 'text'>,
  evidence: string,
): string {
  return sha256(
    stableJson({
      judge: config.judge,
      template_version: config.template_version,
      promise: { title: promise.title, text: promise.text },
      evidence_sha256: sha256(evidence),
    }),
  );
}

export function buildLinkPlan(
  config: LinkConfig,
  pairs: readonly LinkPair[],
  promises: ReadonlyMap<string, LinkPromise>,
  evidenceFor: (pair: LinkPair) => string,
): LinkPlan {
  const cpt = config.evidence.chars_per_token;
  const price = config.budget.usd_per_million_tokens / 1e6;
  const sorted = [...pairs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const byKey = new Map<string, LinkRequest>();
  const planned: LinkPlan['pairs'] = [];
  for (const pair of sorted) {
    const promise = promises.get(pair.promise_id);
    if (!promise) throw new Error(`pair ${pair.id}: no promise ${pair.promise_id}`);
    const evidence = evidenceFor(pair);
    const key = requestKey(config, promise, evidence);
    planned.push({ pair, key });
    if (byKey.has(key)) continue;
    const tokens = Math.ceil(
      (config.instructions.length + promise.title.length + promise.text.length + evidence.length) /
        cpt,
    );
    byKey.set(key, {
      key,
      promise,
      evidence,
      estimated_input_tokens: tokens,
      estimated_cost_usd: tokens * price,
    });
  }
  const requests = [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const estimated_input_tokens = requests.reduce((a, r) => a + r.estimated_input_tokens, 0);
  return {
    plan_hash: sha256(stableJson(requests.map((r) => r.key))),
    pairs: planned,
    requests,
    estimated_input_tokens,
    estimated_cost_usd: estimated_input_tokens * price,
  };
}
