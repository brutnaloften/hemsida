import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { auc } from '../jev.ts';
import { createMemoryCache } from './cache.ts';
import { parseScoreConfig, type ScoreConfig } from './config.ts';
import { buildPlan, type PlanDocument, type PlanPromise } from './plan.ts';
import { buildReport, type LabelledPair } from './report.ts';
import { aggregateResults } from './results.ts';
import { classifyPlan, runPlan } from './runner.ts';
import { executeRun } from './run.ts';
import { createFakeScorer, createScorer, type Scorer } from './scorer.ts';

const baseConfig = {
  name: 'test-run',
  scorer: { kind: 'fake', model: 'fake' },
  question: { template_version: 'v1', template: 'Hör detta till löftet? {title}. {text}' },
  inputs: {
    promises: { term: '2022-2026', id_prefix: 'tido-' },
    documents: { kind: 'eval-pairs', pairs_file: 'x.json' },
  },
  chunk: { max_chars: 2000 },
  limits: {
    max_request_tokens: 62000,
    max_state_plus_question_tokens: 32000,
    chars_per_token: 2.8,
  },
  budget: { max_cost_usd: 1, usd_per_million_tokens: 0.042 },
};
const config = (over: Partial<ScoreConfig> = {}): ScoreConfig =>
  parseScoreConfig({ ...baseConfig, ...over });

const para = (word: string, n: number) => `${word} `.repeat(n).trim();
const docs = (): PlanDocument[] => [
  {
    id: 'B2',
    title: 'Skatt',
    paragraphs: ['skatt', 'moms', 'bostad', 'skola', 'polis', 'energi'].map((w) => para(w, 150)),
  },
  {
    id: 'A1',
    title: 'Vård',
    paragraphs: ['vård', 'sjukhus', 'läkare', 'apotek'].map((w) => para(w, 150)),
  },
];
const promises = (n = 4): PlanPromise[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `tido-p${String(i).padStart(4, '0')}`,
    title: i % 2 ? 'Sänk skatt' : 'Bygg sjukhus',
    text: `Beskrivning ${i} om ${i % 2 ? 'skatt och moms' : 'vård och sjukhus'}`,
  }));

/** A scorer that counts calls and can be told to fail on call number `failOn`. */
function countingScorer(failOn?: number): Scorer & { calls: number } {
  const inner = createFakeScorer();
  const s = {
    kind: 'fake',
    calls: 0,
    async score(state: string, questions: Record<string, string>) {
      s.calls++;
      if (s.calls === failOn) throw new Error('boom');
      return inner.score(state, questions);
    },
  };
  return s;
}

describe('config schema', () => {
  it('accepts the committed eval config', () => {
    const raw = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../../score-configs/tido-eval-v1.json'), 'utf8'),
    );
    expect(parseScoreConfig(raw).question.template_version).toBe('v1');
  });
  it('rejects unknown keys at any level', () => {
    expect(() => parseScoreConfig({ ...baseConfig, extra: 1 })).toThrow();
    expect(() => parseScoreConfig({ ...baseConfig, chunk: { max_chars: 2000, x: 1 } })).toThrow();
  });
  it('requires both placeholders in the template', () => {
    expect(() =>
      parseScoreConfig({ ...baseConfig, question: { template_version: 'v', template: '{title}' } }),
    ).toThrow();
  });
});

describe('plan', () => {
  it('is byte-identical for the same inputs, whatever the input order', () => {
    const a = buildPlan(config(), docs(), promises());
    const b = buildPlan(config(), [...docs()].reverse(), [...promises()].reverse());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.plan_hash).toBe(b.plan_hash);
  });
  it('splits documents into chunks and makes one request per chunk and batch', () => {
    const plan = buildPlan(config(), docs(), promises());
    expect(plan.chunks).toBeGreaterThan(2);
    expect(plan.requests).toHaveLength(plan.chunks * plan.batches_per_chunk);
    expect(plan.requests[0]!.document_id).toBe('A1');
  });
  it('batches a 1,468-promise run into several requests per chunk within the token limits', () => {
    const many = promises(1468).map((p) => ({ ...p, text: p.text + ' x'.repeat(120) }));
    const cfg = config({ chunk: { max_chars: 40000 } });
    const big: PlanDocument[] = [
      { id: 'D', title: 'Stor', paragraphs: Array.from({ length: 80 }, () => para('ord', 150)) },
    ];
    const plan = buildPlan(cfg, big, many);
    expect(plan.batches_per_chunk).toBeGreaterThan(1);
    const seen = new Set<string>();
    for (const r of plan.requests) {
      expect(r.estimated_input_tokens).toBeLessThanOrEqual(cfg.limits.max_request_tokens);
      if (r.chunk_index === 0) for (const id of Object.keys(r.questions)) seen.add(id);
    }
    expect(seen.size).toBe(1468);
  });
  it('estimates tokens and cost without a scorer', () => {
    const plan = buildPlan(config(), docs(), promises());
    const sum = plan.requests.reduce((a, r) => a + r.estimated_input_tokens, 0);
    expect(plan.estimated_input_tokens).toBe(sum);
    expect(plan.estimated_cost_usd).toBeCloseTo((sum * 0.042) / 1e6, 12);
  });
  it('rejects chunks that break the state-plus-question limit', () => {
    const cfg = config({
      limits: { ...baseConfig.limits, max_state_plus_question_tokens: 100 },
    });
    expect(() => buildPlan(cfg, docs(), promises())).toThrow(/max_state_plus_question_tokens/);
  });
  it('changes keys with template_version, model and state, and not otherwise', () => {
    const keys = (cfg: ScoreConfig, d = docs()) =>
      buildPlan(cfg, d, promises()).requests.map((r) => r.key);
    const base = keys(config());
    expect(keys(config())).toEqual(base);
    const v2 = config({ question: { ...baseConfig.question, template_version: 'v2' } });
    expect(keys(v2)[0]).not.toBe(base[0]);
    const model = config({ scorer: { kind: 'fake', model: 'other' } });
    expect(keys(model)[0]).not.toBe(base[0]);
    const changed = docs();
    changed[1]!.paragraphs[0] = 'helt annan text';
    const k = keys(config(), changed);
    expect(k[0]).not.toBe(base[0]);
  });
});

describe('runner', () => {
  const plan = () => buildPlan(config(), docs(), promises());

  it('never sends a cached request again', async () => {
    const cache = createMemoryCache();
    const scorer = countingScorer();
    const opts = { scorer, cache, maxCostUsd: 1, usdPerMillionTokens: 0.042 };
    const first = await runPlan(plan(), opts);
    expect(first.status).toBe('complete');
    expect(scorer.calls).toBe(plan().requests.length);
    const second = await runPlan(plan(), opts);
    expect(second.sent).toBe(0);
    expect(second.cached).toBe(plan().requests.length);
    expect(scorer.calls).toBe(plan().requests.length);
  });

  it('resumes after an interruption', async () => {
    const cache = createMemoryCache();
    const total = plan().requests.length;
    const failing = countingScorer(3);
    const opts = { cache, maxCostUsd: 1, usdPerMillionTokens: 0.042, concurrency: 1 };
    const first = await runPlan(plan(), { ...opts, scorer: failing });
    expect(first.status).toBe('failed');
    expect(first.sent).toBe(2);
    const healthy = countingScorer();
    const second = await runPlan(plan(), { ...opts, scorer: healthy });
    expect(second.status).toBe('complete');
    expect(healthy.calls).toBe(total - 2);
  });

  it('stops before overspending and leaves completed requests cached', async () => {
    const cache = createMemoryCache();
    const p = plan();
    const perRequest = p.requests[0]!.estimated_cost_usd;
    const cap = perRequest * 2.5;
    const scorer = countingScorer();
    const run = await runPlan(p, {
      scorer,
      cache,
      concurrency: 1,
      maxCostUsd: cap,
      usdPerMillionTokens: 0.042,
    });
    expect(run.status).toBe('budget_exceeded');
    expect(run.error).toMatch(/budget guard/);
    expect(run.sent).toBeGreaterThan(0);
    expect(run.sent).toBeLessThan(p.requests.length);
    expect(run.cost_usd).toBeLessThanOrEqual(cap);
    expect(scorer.calls).toBe(run.sent);
    expect(cache.size()).toBe(run.sent);
    expect(run.remaining).toBe(p.requests.length - run.sent);
    const resumed = await runPlan(p, {
      scorer,
      cache,
      maxCostUsd: 1,
      usdPerMillionTokens: 0.042,
    });
    expect(resumed.status).toBe('complete');
    expect(scorer.calls).toBe(p.requests.length);
  });

  it('counts in-flight estimates against the cap with concurrency', async () => {
    const p = plan();
    const cap = p.requests[0]!.estimated_cost_usd * 1.5;
    const scorer = countingScorer();
    const run = await runPlan(p, {
      scorer,
      cache: createMemoryCache(),
      concurrency: 4,
      maxCostUsd: cap,
      usdPerMillionTokens: 0.042,
    });
    expect(run.status).toBe('budget_exceeded');
    expect(scorer.calls).toBe(1);
  });

  it('splits a state the scorer rejects as too long and caches under the original key', async () => {
    const cache = createMemoryCache();
    const p = buildPlan(config({ chunk: { max_chars: 4000 } }), docs(), promises());
    const scorer = createFakeScorer({ maxStateChars: 2500 });
    const run = await runPlan(p, {
      scorer,
      cache,
      maxCostUsd: 1,
      usdPerMillionTokens: 0.042,
    });
    expect(run.status).toBe('complete');
    expect(run.api_requests).toBeGreaterThan(p.requests.length);
    expect(cache.has(p.requests[0]!.key)).toBe(true);
  });

  it('classifies without any scorer call (dry run)', () => {
    const cache = createMemoryCache();
    const p = plan();
    cache.put(p.requests[0]!.key, { answers: {}, input_tokens: 1, api_requests: 1 });
    const s = classifyPlan(p, cache);
    expect(s.cached).toBe(1);
    expect(s.to_send).toBe(p.requests.length - 1);
    expect(s.estimated_cost_usd_to_send).toBeGreaterThan(0);
  });
});

describe('scorers', () => {
  it('fake scorer is deterministic and scores word overlap', async () => {
    const s = createFakeScorer();
    const a = await s.score('skatt moms bostad', { q1: 'skatt moms', q2: 'sjukhus vård' });
    expect(a.answers).toEqual({ q1: 1, q2: 0 });
    expect(await s.score('skatt moms bostad', { q1: 'skatt moms', q2: 'sjukhus vård' })).toEqual(a);
  });
  it('jev scorer needs a token from the environment', () => {
    expect(() => createScorer('jev', 'jev-latest', {})).toThrow(/JEV_TOKEN/);
    expect(createScorer('jev', 'jev-latest', { JEV_TOKEN: 't' }).kind).toBe('jev');
  });
});

describe('report', () => {
  const results = {
    D1: {
      a: { score: 0.9, best_chunk: 0 },
      b: { score: 0.8, best_chunk: 1 },
      c: { score: 0.2, best_chunk: 0 },
    },
    D2: { a: { score: 0.6, best_chunk: 0 }, c: { score: 0.55, best_chunk: 0 } },
  };
  const pairs: LabelledPair[] = [
    { id: 'a::D1', promise_id: 'a', document_id: 'D1', label: 'match' },
    { id: 'b::D1', promise_id: 'b', document_id: 'D1', label: 'partial' },
    { id: 'c::D1', promise_id: 'c', document_id: 'D1', label: 'no_match' },
    { id: 'c::D2', promise_id: 'c', document_id: 'D2', label: 'no_match' },
    { id: 'a::D2', promise_id: 'a', document_id: 'D2', label: 'contradicts' },
    { id: 'a::D3', promise_id: 'a', document_id: 'D3', label: 'match' },
    { id: 'z::D1', promise_id: 'z', document_id: 'D1', label: null },
  ];
  const r = buildReport(results, pairs);

  it('computes AUC like the old eval tool', () => {
    expect(r.auc).toBe(auc([0.9, 0.8], [0.2, 0.55]));
    expect(r.auc).toBe(1);
  });
  it('counts per label and skips unlabelled and unscored pairs', () => {
    expect(r.per_label.match).toEqual({ n: 1, mean: 0.9, min: 0.9, max: 0.9 });
    expect(r.per_label.no_match!.n).toBe(2);
    expect(r.per_label.contradicts!.n).toBe(1);
    expect(r.scored_pairs).toBe(5);
    expect(r.unscored_pairs).toBe(1);
  });
  it('computes precision and recall at thresholds', () => {
    const at = (t: number) => r.thresholds.find((x) => x.threshold === t)!;
    expect(at(0.5)).toMatchObject({ tp: 2, fp: 1, fn: 0, tn: 1 });
    expect(at(0.5).precision).toBeCloseTo(2 / 3);
    expect(at(0.5).recall).toBe(1);
    expect(at(0.7)).toMatchObject({ tp: 2, fp: 0, precision: 1, recall: 1 });
    expect(at(0.3).fp).toBe(1);
  });
  it('ranks each own promise within its document', () => {
    const rank = (id: string) => r.rows.find((x) => x.id === id)!.rank_in_doc;
    expect(rank('a::D1')).toBe(1);
    expect(rank('b::D1')).toBe(2);
    expect(rank('c::D1')).toBe(3);
    expect(rank('c::D2')).toBe(2);
    expect(r.rows.find((x) => x.id === 'c::D1')!.of).toBe(3);
  });
  it('lists lowest positives and highest negatives', () => {
    expect(r.lowest_positives.map((x) => x.id)).toEqual(['b::D1', 'a::D1']);
    expect(r.highest_negatives.map((x) => x.id)).toEqual(['c::D2', 'c::D1']);
  });
});

describe('end to end with the fake scorer', () => {
  let dir = '';
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('writes manifest, results and report, and a re-run sends nothing', async () => {
    dir = mkdtempSync(resolve(tmpdir(), 'score-'));
    const pairs: LabelledPair[] = [
      { id: 'tido-p0000::A1', promise_id: 'tido-p0000', document_id: 'A1', label: 'match' },
      { id: 'tido-p0001::A1', promise_id: 'tido-p0001', document_id: 'A1', label: 'no_match' },
      { id: 'tido-p0001::B2', promise_id: 'tido-p0001', document_id: 'B2', label: 'partial' },
      { id: 'tido-p0000::B2', promise_id: 'tido-p0000', document_id: 'B2', label: 'no_match' },
    ];
    const opts = {
      config: config(),
      inputs: { documents: docs(), promises: promises(), pairs },
      scorer: countingScorer(),
      cacheDir: resolve(dir, 'cache'),
      runsDir: resolve(dir, 'runs'),
    };
    const first = await executeRun(opts);
    expect(first.summary!.status).toBe('complete');
    const runDir = resolve(dir, 'runs/test-run');
    const manifest = JSON.parse(readFileSync(resolve(runDir, 'manifest.json'), 'utf8'));
    expect(manifest.plan_hash).toBe(first.plan_hash);
    expect(manifest.sent_count).toBe(manifest.request_count);
    expect(manifest.config.name).toBe('test-run');
    const results = JSON.parse(readFileSync(resolve(runDir, 'results.json'), 'utf8'));
    expect(results.complete).toBe(true);
    expect(results.results.A1['tido-p0000']).toHaveProperty('best_chunk');
    expect(first.report!.auc).toBe(1);
    expect(existsSync(resolve(runDir, 'report.json'))).toBe(true);
    expect(readdirSync(resolve(dir, 'cache')).length).toBe(manifest.request_count);

    const again = await executeRun({ ...opts, scorer: countingScorer() });
    expect(again.summary!.sent).toBe(0);
    expect(again.summary!.cached).toBe(manifest.request_count);
    expect(again.report).toEqual(first.report);
  });

  it('dry run makes zero scorer calls and writes nothing', async () => {
    dir = mkdtempSync(resolve(tmpdir(), 'score-'));
    const scorer = countingScorer();
    const out = await executeRun({
      config: config(),
      inputs: { documents: docs(), promises: promises(), pairs: [] },
      scorer,
      cacheDir: resolve(dir, 'cache'),
      runsDir: resolve(dir, 'runs'),
      dryRun: true,
    });
    expect(scorer.calls).toBe(0);
    expect(out.summary).toBeUndefined();
    expect(out.status.to_send).toBeGreaterThan(0);
    expect(existsSync(resolve(dir, 'runs'))).toBe(false);
  });

  it('aggregates the best chunk per promise', () => {
    const p = buildPlan(config(), docs(), promises(1));
    const cache = createMemoryCache();
    const [r0, r1] = p.requests.filter((r) => r.document_id === 'B2');
    cache.put(r0!.key, { answers: { 'tido-p0000': 0.2 }, input_tokens: 1, api_requests: 1 });
    cache.put(r1!.key, { answers: { 'tido-p0000': 0.7 }, input_tokens: 1, api_requests: 1 });
    const { results, missing } = aggregateResults(p, cache);
    expect(results.B2!['tido-p0000']).toEqual({ score: 0.7, best_chunk: 1 });
    expect(missing).toBeGreaterThan(0);
  });
});
