import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { HD01SOU1_TEXT } from '../riksdag-text.fixtures.ts';
import { createMemoryCache } from './cache.ts';
import { linkConfigSchema, parseLinkConfig, type LinkConfig } from './config.ts';
import { candidatePairs, loadLinkInputs, renderEvidence } from './inputs.ts';
import {
  createFakeJudge,
  createJudge,
  judgeFor,
  parseApiJudgement,
  parseClaudeJudgement,
  type Judge,
  type Judgement,
} from './judge.ts';
import { buildLinkPlan, requestKey, type LinkPair, type LinkPromise } from './plan.ts';
import {
  buildAgreementReport,
  collectResults,
  formatAgreementReport,
  isProposal,
} from './report.ts';
import { executeLinkRun } from './run.ts';
import { classifyLinkPlan, runLinkPlan } from './runner.ts';

const config: LinkConfig = parseLinkConfig({
  name: 'test',
  judge: { kind: 'fake', model: 'fake' },
  template_version: 'v1',
  instructions: 'Judge the pair.',
  inputs: {
    promises: { term: '2022-2026', id_prefix: '' },
    pairs: { kind: 'eval-pairs', pairs_file: 'eval/pairs.json' },
  },
  evidence: { max_tokens: 1000, chars_per_token: 3 },
  thresholds: { accept_labels: ['match', 'partial'], min_confidence: 'medium' },
  budget: { max_cost_usd: 1, usd_per_million_tokens: 1 },
});

const promise: LinkPromise = {
  id: 'p1',
  title: 'Förlossningsvård',
  text: 'Satsa på förlossningsvård och mödravård i hela landet.',
};
const promises = new Map([[promise.id, promise]]);
const pair = (id: string, over: Partial<LinkPair> = {}): LinkPair => ({
  id: `p1::${id}`,
  promise_id: 'p1',
  document_id: id,
  document_title: `Doc ${id}`,
  doktyp: 'bet',
  label: null,
  ...over,
});
const evidenceByDoc: Record<string, string> = {
  d1: 'Typ: bet\nTitel: Doc d1\n\nUtskottet föreslår satsning på förlossningsvård och mödravård i landet.',
  d2: 'Typ: dir\nTitel: Doc d2\n\nHelt annat ämne: skogsbruk och jakt.',
  d3: 'Typ: prop\nTitel: Doc d3\n\nFörlossningsvård nämns i förbigående.',
};
const evidenceFor = (p: LinkPair) => evidenceByDoc[p.document_id]!;

describe('config', () => {
  it('parses the committed config and rejects unknown keys', () => {
    const raw = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../../link-configs/eval-v1.json'), 'utf8'),
    );
    expect(() => parseLinkConfig(raw)).not.toThrow();
    expect(() => parseLinkConfig({ ...raw, thresholdz: {} })).toThrow();
    expect(linkConfigSchema.safeParse({ ...raw, judge: { kind: 'jev', model: 'x' } }).success).toBe(
      false,
    );
  });
});

describe('judges', () => {
  it('fake judge is deterministic and separates matching from unrelated text', async () => {
    const j = createFakeJudge();
    const input = (d: string) => ({ instructions: 'x', promise, evidence: evidenceByDoc[d]! });
    const a = await j.judge(input('d1'));
    expect(await j.judge(input('d1'))).toEqual(a);
    expect(a.judgement.label).toBe('match');
    expect(a.judgement.stage).toBe('definitive');
    expect((await j.judge(input('d2'))).judgement.label).toBe('no_match');
    expect((await j.judge(input('d2'))).judgement.stage).toBe('preparatory');
  });

  it('the claude judge refuses to run with an API key set', () => {
    expect(() => createJudge('claude', 'haiku', { ANTHROPIC_API_KEY: 'sk-x' })).toThrow(
      /subscription/,
    );
    expect(() => createJudge('claude', 'haiku', { ANTHROPIC_AUTH_TOKEN: 'x' })).toThrow(
      /subscription/,
    );
    expect(createJudge('claude', 'haiku', {}).kind).toBe('claude');
  });

  it('the api judge needs a key and unknown kinds fail', () => {
    expect(() => createJudge('api', 'haiku', {})).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => createJudge('nope', 'x', {})).toThrow(/unknown judge kind/);
  });

  it('a dry run gets a judge that refuses to be called and needs no credentials', async () => {
    const j = judgeFor('api', 'haiku', true, {});
    await expect(j.judge({ instructions: '', promise, evidence: '' })).rejects.toThrow(/dry run/);
  });

  const good: Judgement = {
    label: 'partial',
    stage: 'preparatory',
    confidence: 'high',
    reason: 'r',
  };
  const usage = { input_tokens: 5, output_tokens: 3 };
  it('parses a claude result, summing all token categories', () => {
    const base = { subtype: 'success', is_error: false, structured_output: good, usage };
    const r = parseClaudeJudgement({
      ...base,
      modelUsage: {
        haiku: {
          inputTokens: 1,
          outputTokens: 2,
          cacheReadInputTokens: 3,
          cacheCreationInputTokens: 4,
        },
      },
    });
    expect(r).toEqual({ judgement: good, input_tokens: 10 });
    expect(parseClaudeJudgement({ ...base, modelUsage: {} }).input_tokens).toBe(5);
    expect(() =>
      parseClaudeJudgement({ ...base, structured_output: { label: 'maybe' }, modelUsage: {} }),
    ).toThrow(/schema/);
    expect(() =>
      parseClaudeJudgement({
        ...base,
        is_error: true,
        result: 'rate limited',
        api_error_status: 429,
        modelUsage: {},
      }),
    ).toThrow(/429.*rate limited/);
  });

  it('parses an api response from the forced tool call', () => {
    const r = parseApiJudgement({
      content: [{ type: 'text' }, { type: 'tool_use', name: 'judgement', input: good }],
      usage: { ...usage, cache_read_input_tokens: 10, cache_creation_input_tokens: null },
    });
    expect(r).toEqual({ judgement: good, input_tokens: 18 });
    expect(() => parseApiJudgement({ content: [], usage })).toThrow(/no valid judgement/);
  });
});

describe('plan and cache keys', () => {
  const key = (c: Pick<LinkConfig, 'judge' | 'template_version'>, p = promise, e = 'ev') =>
    requestKey(c, p, e);

  it('key depends on judge kind, model, template version, promise and evidence text', () => {
    const k = key(config);
    expect(key(config)).toBe(k);
    expect(key({ ...config, judge: { kind: 'claude', model: 'fake' } })).not.toBe(k);
    expect(key({ ...config, judge: { kind: 'fake', model: 'other' } })).not.toBe(k);
    expect(key({ ...config, template_version: 'v2' })).not.toBe(k);
    expect(key(config, { ...promise, text: 'changed' })).not.toBe(k);
    expect(key(config, promise, 'ev2')).not.toBe(k);
  });

  it('is deterministic, sorted and shares a request between pairs with identical input', () => {
    const pairs = [pair('d2'), pair('d1'), pair('d1b', { document_id: 'd1' })];
    const a = buildLinkPlan(config, pairs, promises, evidenceFor);
    const b = buildLinkPlan(config, [...pairs].reverse(), promises, evidenceFor);
    expect(a.plan_hash).toBe(b.plan_hash);
    expect(a.pairs.map((x) => x.pair.id)).toEqual([...a.pairs.map((x) => x.pair.id)].sort());
    // p1::d1 and p1::d1b show the judge the same evidence under the same promise.
    expect(a.pairs).toHaveLength(3);
    expect(a.requests).toHaveLength(2);
    expect(a.estimated_input_tokens).toBeGreaterThan(0);
  });

  it('rejects a pair whose promise is unknown', () => {
    expect(() =>
      buildLinkPlan(config, [pair('d1', { promise_id: 'zz' })], promises, evidenceFor),
    ).toThrow(/no promise zz/);
  });
});

describe('runner', () => {
  const plan = buildLinkPlan(config, [pair('d1'), pair('d2'), pair('d3')], promises, evidenceFor);
  const base = { instructions: config.instructions, maxCostUsd: 1, usdPerMillionTokens: 1 };

  it('sends everything once, then a re-run is fully cached', async () => {
    const cache = createMemoryCache();
    let calls = 0;
    const fake = createFakeJudge();
    const judge: Judge = { kind: 'fake', judge: (i) => (calls++, fake.judge(i)) };
    const s1 = await runLinkPlan(plan, { ...base, judge, cache });
    expect(s1).toMatchObject({ status: 'complete', sent: 3, cached: 0, remaining: 0 });
    expect(classifyLinkPlan(plan, cache)).toMatchObject({ cached: 3, to_send: 0 });
    const s2 = await runLinkPlan(plan, { ...base, judge, cache });
    expect(s2).toMatchObject({ status: 'complete', sent: 0, cached: 3 });
    expect(calls).toBe(3);
  });

  it('resumes after a failure: completed requests stay cached', async () => {
    const cache = createMemoryCache();
    const fake = createFakeJudge();
    let n = 0;
    const flaky: Judge = {
      kind: 'fake',
      judge: async (i) => {
        if (++n === 2) throw new Error('rate limited');
        return fake.judge(i);
      },
    };
    const s1 = await runLinkPlan(plan, { ...base, judge: flaky, cache, concurrency: 1 });
    expect(s1).toMatchObject({ status: 'failed', sent: 1, remaining: 2, error: 'rate limited' });
    const s2 = await runLinkPlan(plan, { ...base, judge: fake, cache, concurrency: 1 });
    expect(s2).toMatchObject({ status: 'complete', sent: 2, cached: 1 });
  });

  it('stops at the budget guard before spending beyond the cap', async () => {
    const cache = createMemoryCache();
    const s = await runLinkPlan(plan, {
      ...base,
      judge: createFakeJudge(),
      cache,
      concurrency: 1,
      maxCostUsd: plan.requests[0]!.estimated_cost_usd * 1.5,
    });
    expect(s.status).toBe('budget_exceeded');
    expect(s.sent).toBeLessThan(3);
    expect(cache.size()).toBe(s.sent);
  });
});

describe('agreement report', () => {
  const j = (
    label: Judgement['label'],
    stage: Judgement['stage'] = 'definitive',
    confidence: Judgement['confidence'] = 'high',
  ) => ({ label, stage, confidence, reason: 'r' }) satisfies Judgement;
  const results = (m: Record<string, Judgement>) =>
    Object.entries(m).map(([id, judgement]) => ({
      pair_id: id,
      promise_id: 'p1',
      document_id: id,
      judgement,
      proposed: isProposal(judgement, config.thresholds),
    }));

  it('applies the thresholds', () => {
    expect(isProposal(j('match'), config.thresholds)).toBe(true);
    expect(isProposal(j('match', 'definitive', 'low'), config.thresholds)).toBe(false);
    expect(isProposal(j('no_match'), config.thresholds)).toBe(false);
    expect(isProposal(j('contradicts'), config.thresholds)).toBe(false);
  });

  it('counts exact, relevance and stage agreement against the hand labels', () => {
    const pairs = [
      pair('a', { id: 'a', label: 'match', stage: 'definitive' }),
      pair('b', { id: 'b', label: 'partial', stage: 'preparatory' }),
      pair('c', { id: 'c', label: 'no_match' }),
      pair('d', { id: 'd', label: 'no_match' }),
      pair('e', { id: 'e', label: 'contradicts' }),
      pair('f', { id: 'f', label: null }),
      pair('g', { id: 'g', label: 'match' }),
    ];
    const r = buildAgreementReport(
      results({
        a: j('match'),
        b: j('match', 'definitive'),
        c: j('partial'),
        d: j('no_match'),
        e: j('contradicts'),
        f: j('match'),
      }),
      pairs,
    );
    expect(r.compared).toBe(5); // f is unlabelled, g has no judgement
    expect(r.exact_label).toEqual({ agree: 3, share: 0.6 });
    expect(r.relevance).toMatchObject({ tp: 2, fp: 1, fn: 0, tn: 1, precision: 2 / 3, recall: 1 });
    expect(r.stage).toEqual({ compared: 2, agree: 1, share: 0.5 });
    expect(r.proposed).toEqual({
      count: 3,
      hand_relevant: 2,
      hand_no_match: 1,
      hand_contradicts: 0,
    });
    expect(r.confusion.partial).toEqual({ match: 1 });
    expect(r.disagreements.map((d) => d.id)).toEqual(['b', 'c']);
    expect(formatAgreementReport(r)).toContain('3/5 exact');
  });
});

describe('evidence and inputs', () => {
  it('renders a header and sections and cuts at the character budget', () => {
    const doc = {
      dok_id: 'X',
      doktyp: 'bet',
      outcome: 'bifall' as const,
      sections: [
        { heading: 'Förslag', text: 'a'.repeat(200), est_tokens: 67 },
        { heading: '', text: 'b', est_tokens: 1 },
      ],
    };
    const full = renderEvidence(doc, 'Titel', 1000);
    expect(full).toContain('Typ: bet\nTitel: Titel\nDokument-id: X\nBeslut: bifall');
    expect(full).toContain('## Förslag');
    const cut = renderEvidence(doc, 'Titel', 100);
    expect(cut).toHaveLength(100);
    expect(cut).toContain('avkortat');
    expect(renderEvidence({ ...doc, sections: [] }, 'T', 1000)).toContain('ingen utdragen text');
  });

  it('picks candidates best-first, filters by relevance, type and prefix', () => {
    const c = (dok_id: string, doktyp: string, score: number, relevance?: number) => ({
      dok_id,
      doktyp,
      rm: '2024/25',
      beteckning: 'x',
      datum: '2025-01-01',
      titel: `T ${dok_id}`,
      organ: 'NU',
      url: 'u',
      found_by: ['all-keywords'],
      score,
      ...(relevance === undefined ? {} : { relevance }),
    });
    const files = [
      {
        promise_id: 'val2022-a',
        searched_at: '2026-01-01',
        window: { from: '', tom: '' },
        queries: [],
        candidates: [
          c('A', 'bet', 1, 0.9),
          c('B', 'bet', 3),
          c('C', 'mot', 5, 0.99),
          c('D', 'prop', 2, 0.6),
        ],
      },
      {
        promise_id: 'tido-b',
        searched_at: '2026-01-01',
        window: { from: '', tom: '' },
        queries: [],
        candidates: [c('A', 'bet', 1)],
      },
    ];
    const ids = (o: Parameters<typeof candidatePairs>[1]) =>
      candidatePairs(files, o).map((p) => p.id);
    expect(ids({ prefix: 'val2022-' })).toEqual(['val2022-a::A', 'val2022-a::D', 'val2022-a::B']);
    expect(ids({ prefix: 'val2022-', minRelevance: 0.5 })).toEqual([
      'val2022-a::A',
      'val2022-a::D',
    ]);
    expect(ids({ prefix: '', maxPerPromise: 1 })).toEqual(['val2022-a::A', 'tido-b::A']);
  });

  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

  function fixtureRoot(): string {
    const root = mkdtempSync(resolve(tmpdir(), 'link-test-'));
    dirs.push(root);
    mkdirSync(resolve(root, 'eval'));
    mkdirSync(resolve(root, 'src/data/2022-2026/promises'), { recursive: true });
    writeFileSync(
      resolve(root, 'src/data/2022-2026/promises/p1.json'),
      JSON.stringify({ title: promise.title, description: promise.text }),
    );
    const evalPair = (doc: string, label: string) => ({
      id: `p1::${doc}`,
      promise_id: 'p1',
      promise_title: promise.title,
      promise_text: promise.text,
      promise_quote: '',
      document_id: doc,
      document_title: `Doc ${doc}`,
      document_type: 'bet',
      snippet: '',
      url: '',
      search_score: 1,
      label,
    });
    writeFileSync(
      resolve(root, 'eval/pairs.json'),
      JSON.stringify({
        term: '2022-2026',
        seed: 1,
        pairs: [evalPair('d1', 'match'), evalPair('d2', 'no_match')],
      }),
    );
    return root;
  }

  it('runs end to end offline with the fake judge: dry run first, then run, report and resume', async () => {
    const root = fixtureRoot();
    const inputs = loadLinkInputs(config, root, '/text', { readText: () => HD01SOU1_TEXT });
    expect(inputs.pairs.map((p) => p.id)).toEqual(['p1::d1', 'p1::d2']);
    expect(inputs.evidenceFor(inputs.pairs[0]!)).toContain('Typ: bet');
    expect(
      loadLinkInputs(config, root, '/text', { limit: 1, readText: () => HD01SOU1_TEXT }).pairs,
    ).toHaveLength(1);

    const cacheDir = resolve(root, 'cache');
    const runsDir = resolve(root, 'runs');
    const opts = { config, inputs, judge: createFakeJudge(), cacheDir, runsDir };

    const dry = await executeLinkRun({
      ...opts,
      judge: judgeFor('claude', 'haiku', true, {}),
      dryRun: true,
    });
    expect(dry.summary).toBeUndefined();
    expect(dry.status).toMatchObject({ total: 2, cached: 0, to_send: 2 });

    const run = await executeLinkRun(opts);
    expect(run.summary).toMatchObject({ status: 'complete', sent: 2 });
    expect(run.report?.compared).toBe(2);
    const dir = resolve(runsDir, 'test');
    for (const f of ['manifest.json', 'results.json', 'report.json']) {
      expect(JSON.parse(readFileSync(resolve(dir, f), 'utf8'))).toBeTruthy();
    }
    expect(JSON.parse(readFileSync(resolve(dir, 'results.json'), 'utf8')).complete).toBe(true);

    const again = await executeLinkRun(opts);
    expect(again.summary).toMatchObject({ sent: 0, cached: 2 });
  });

  it('collectResults reports pairs without a judgement as missing', () => {
    const plan = buildLinkPlan(config, [pair('d1')], promises, evidenceFor);
    expect(collectResults(plan, createMemoryCache(), config.thresholds)).toEqual({
      results: [],
      missing: 1,
    });
  });
});
