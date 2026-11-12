import { describe, expect, it } from 'vitest';
import {
  SFS_JUDGE_INSTRUCTIONS,
  SFS_JUDGE_TEMPLATE_VERSION,
  splitByEarlierRun,
  extractLawSections,
  normalizeLawTitle,
  buildPrompt,
  changedProposal,
  collectResults,
  coverageSchema,
  createCoverageJudge,
  createFakeCoverageJudge,
  createMemoryCoverageCache,
  estimateCostUsd,
  judgeKey,
  parseClaudeCoverage,
  planSfsPairs,
  renderTier1,
  runRequests,
  JudgeError,
  type PlannablePromise,
  type SfsRequest,
} from './sfs-judge.ts';
import type { SfsLaw } from './sfs-register.ts';

const law = (sfs: string, extra: Partial<SfsLaw> = {}): SfsLaw => ({
  sfs,
  title: `Lag (${sfs}) om något`,
  base_sfs: sfs,
  omfattning: null,
  ikraft: '2025-01-01',
  props: [],
  bets: [],
  rskr: [],
  url: 'x',
  ...extra,
});
const sfs = {
  laws: {
    'sfs-2025-1': law('2025:1', { bets: ['2024/25:JuU1', '2024/25:XX9'] }),
    'sfs-2025-2': law('2025:2'),
    'sfs-2025-3': law('2025:3'),
  },
  byProp: { P1: ['sfs-2025-1', 'sfs-2025-2'], P2: ['sfs-2025-2'], P3: ['sfs-2025-3'] },
};
const prom = (
  id: string,
  type: string,
  evidence: PlannablePromise['evidence'],
): PlannablePromise => ({
  id,
  type,
  title: id,
  description: 'd',
  evidence,
});
const propEv = (dok_id: string, relevance = 'full') => ({ kind: 'prop', dok_id, relevance });
const docs = [{ dok_id: 'BET1', doktyp: 'bet', rm: '2024/25', beteckning: 'JuU1' }];

describe('planSfsPairs', () => {
  it('plans one pair per (promise, law) for legislative promises only', () => {
    const pairs = planSfsPairs(
      [
        prom('a', 'legislative', [propEv('P1'), propEv('P2', 'partial')]),
        prom('b', 'budget', [propEv('P1')]),
        prom('c', 'legislative', [propEv('P9')]),
        prom('d', 'legislative', [{ kind: 'sou', dok_id: 'P1', relevance: 'full' }]),
      ],
      sfs,
      docs,
    );
    expect(pairs.map((p) => p.id)).toEqual(['a::sfs-2025-1', 'a::sfs-2025-2']);
    // sfs-2025-2 is reached through both linked props; one pair
    expect(pairs[1]!.prop_ids).toEqual(['P1', 'P2']);
    expect(pairs[0]!.bet_ids).toEqual(['BET1']);
  });

  it('ignores props linked as contradicts, honours filters and limit', () => {
    const ps = [
      prom('x-1', 'legislative', [propEv('P3', 'contradicts')]),
      prom('x-2', 'legislative', [propEv('P3')]),
      prom('y-1', 'legislative', [propEv('P1')]),
    ];
    expect(planSfsPairs(ps, sfs, docs).map((p) => p.id)).toEqual([
      'x-2::sfs-2025-3',
      'y-1::sfs-2025-1',
      'y-1::sfs-2025-2',
    ]);
    expect(planSfsPairs(ps, sfs, docs, { idPrefix: 'y-' })).toHaveLength(2);
    expect(planSfsPairs(ps, sfs, docs, { only: 'x-2' })).toHaveLength(1);
    expect(planSfsPairs(ps, sfs, docs, { limit: 1 })).toHaveLength(1);
  });
});

describe('prompt and key', () => {
  const input = {
    promise: { title: 'Skärpta straff', description: 'Beskrivning', quote: 'Citat' },
    law: law('2025:1', { omfattning: 'ändr. 1 §', ikraft: '2025-07-01' }),
    propTexts: [{ designation: 'Prop. 2024/25:1', text: 'Förslag text' }],
  };
  it('contains promise, law, proposition and optional bet', () => {
    const p = buildPrompt(input);
    for (const s of [
      'Skärpta straff',
      'Citat',
      'Rubrik: Lag (2025:1)',
      '2025-07-01',
      'Prop. 2024/25:1',
      'ändr. 1 §',
    ])
      expect(p).toContain(s);
    expect(p).not.toContain('UTSKOTTETS');
    expect(
      buildPrompt({ ...input, betProposal: { designation: 'Bet. 2024/25:JuU1', text: 'T' } }),
    ).toContain('UTSKOTTETS FÖRSLAG');
  });

  it('cache key includes the judge kind, so a fake run never fills real keys', () => {
    const p = buildPrompt(input);
    expect(judgeKey('fake', 'm', p, SFS_JUDGE_INSTRUCTIONS)).not.toBe(
      judgeKey('claude', 'm', p, SFS_JUDGE_INSTRUCTIONS),
    );
  });

  it('cache key changes with model, instructions and prompt text', () => {
    const p = buildPrompt(input);
    const k = judgeKey('claude', 'm', p, SFS_JUDGE_INSTRUCTIONS);
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(judgeKey('claude', 'm', p, SFS_JUDGE_INSTRUCTIONS)).toBe(k);
    expect(judgeKey('claude', 'm2', p, SFS_JUDGE_INSTRUCTIONS)).not.toBe(k);
    expect(judgeKey('claude', 'm', p + 'x', SFS_JUDGE_INSTRUCTIONS)).not.toBe(k);
    expect(judgeKey('claude', 'm', p, SFS_JUDGE_INSTRUCTIONS + 'x')).not.toBe(k);
  });

  it('renderTier1 puts the proposal first and cuts', () => {
    const t = renderTier1(
      [
        { heading: 'sammanfattning', text: 'S' },
        { heading: 'förslag till riksdagsbeslut', text: 'F' },
      ],
      1000,
    );
    expect(t.indexOf('F')).toBeLessThan(t.indexOf('S'));
    expect(renderTier1([{ heading: '', text: 'x'.repeat(50) }], 10)).toContain('avkortat');
  });

  it('changedProposal only returns a passage that changes the bill', () => {
    const plain = [
      { heading: '', text: 'Utskottets förslag till riksdagsbeslut Riksdagen antar förslaget.' },
    ];
    expect(changedProposal(plain, 500)).toBeNull();
    const changed = [
      {
        heading: '',
        text: 'Sammanfattning. Utskottets förslag till riksdagsbeslut Riksdagen antar förslaget med de ändringar som följer av utskottets förslag.',
      },
    ];
    expect(changedProposal(changed, 500)).toMatch(/^Utskottets förslag/);
    // no heading: nothing, even when the text mentions a change
    expect(
      changedProposal(
        [{ heading: '', text: 'Bifall med de ändringar som följer av bilagan.' }],
        500,
      ),
    ).toBeNull();
  });
});

describe('schema and claude parsing', () => {
  const ok = {
    coverage: 'partial',
    confidence: 'high',
    covered_sv: 'a',
    missing_sv: 'b',
    reason: 'r',
  };
  const msg = (structured_output: unknown, over: object = {}) => ({
    subtype: 'success',
    is_error: false,
    structured_output,
    modelUsage: {
      m: {
        inputTokens: 10,
        outputTokens: 5,
        cacheReadInputTokens: 1,
        cacheCreationInputTokens: 2,
        costUSD: 0.01,
      },
    },
    usage: { input_tokens: 10 },
    ...over,
  });
  it('parses a valid result with tokens and cost', () => {
    const r = parseClaudeCoverage(msg(ok));
    expect(r.coverage.coverage).toBe('partial');
    expect(r.tokens).toBe(18);
    expect(r.cost_usd).toBe(0.01);
  });
  it('rejects a bad label and extra keys', () => {
    expect(() => parseClaudeCoverage(msg({ ...ok, coverage: 'most' }))).toThrow(/schema/);
    expect(coverageSchema.safeParse({ ...ok, extra: 1 }).success).toBe(false);
  });
  it('carries the status of an API error', () => {
    try {
      parseClaudeCoverage(
        msg(undefined, { is_error: true, api_error_status: 429, result: 'slow' }),
      );
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(JudgeError);
      expect((e as JudgeError).status).toBe(429);
    }
  });
  it('refuses an API key for the claude judge', () => {
    expect(() => createCoverageJudge('claude', 'm', { ANTHROPIC_API_KEY: 'k' })).toThrow(
      /subscription/,
    );
    expect(createCoverageJudge('fake', 'm').kind).toBe('fake');
  });
});

describe('runRequests', () => {
  const mk = (id: string, cost: number): SfsRequest => ({
    pair: { id, promise_id: 'p', sfs_key: 'sfs-2025-1', prop_ids: [], bet_ids: [] },
    key: id.padEnd(64, '0'),
    prompt: `LAG\nRubrik: Lag om skärpta straff för bidragsbrott\nTitel: Skärpta straff bidragsbrott ${id}`,
    estimated_cost_usd: cost,
  });
  it('sends uncached requests once, then serves them from the cache', async () => {
    const cache = createMemoryCoverageCache();
    const reqs = [mk('a', 0.01), mk('b', 0.01)];
    const judge = createFakeCoverageJudge();
    const run = () =>
      runRequests(reqs, { judge, instructions: 'i', cache, maxCostUsd: 1, concurrency: 2 });
    expect((await run()).sent).toBe(2);
    const again = await run();
    expect(again.sent).toBe(0);
    expect(again.cached).toBe(2);
    const { results, missing } = collectResults(reqs, cache, sfs.laws);
    expect(missing).toBe(0);
    expect(results.map((r) => r.id)).toEqual(['a', 'b']);
  });
  it('stops at the budget cap', async () => {
    const cache = createMemoryCoverageCache();
    const s = await runRequests([mk('a', 0.6), mk('b', 0.6)], {
      judge: createFakeCoverageJudge(),
      instructions: 'i',
      cache,
      maxCostUsd: 1,
      concurrency: 1,
    });
    expect(s.status).toBe('budget_exceeded');
    expect(s.sent).toBe(1);
  });
  it('reports running spend after each request', async () => {
    const spends: number[] = [];
    const judge = {
      kind: 'x',
      judge: async () => ({
        coverage: {
          coverage: 'none' as const,
          confidence: 'low' as const,
          covered_sv: '',
          missing_sv: '',
          reason: 'r',
        },
        tokens: 1,
        cost_usd: 0.1,
      }),
    };
    await runRequests([mk('a', 0.1), mk('b', 0.1)], {
      judge,
      instructions: 'i',
      cache: createMemoryCoverageCache(),
      maxCostUsd: 1,
      concurrency: 1,
      onSpend: (c) => spends.push(c),
    });
    expect(spends).toHaveLength(2);
    expect(spends[1]).toBeCloseTo(0.2);
  });
  it('skips transient errors and fails on others', async () => {
    const mkJudge = (status: number | undefined) => ({
      kind: 'x',
      judge: async () => {
        throw new JudgeError('boom', status);
      },
    });
    const base = { instructions: 'i', maxCostUsd: 1 };
    const t = await runRequests([mk('a', 0.01)], {
      ...base,
      judge: mkJudge(529),
      cache: createMemoryCoverageCache(),
    });
    expect(t.status).toBe('incomplete');
    expect(t.skipped).toBe(1);
    const f = await runRequests([mk('a', 0.01)], {
      ...base,
      judge: mkJudge(400),
      cache: createMemoryCoverageCache(),
    });
    expect(f.status).toBe('failed');
  });
  it('estimates a positive cost', () => {
    expect(estimateCostUsd('x'.repeat(3000), 'y'.repeat(3000))).toBeGreaterThan(0);
  });
});

describe('v2 additions', () => {
  it('the prompt tells the judge to assess only this law and bumps the template version', () => {
    expect(SFS_JUDGE_INSTRUCTIONS).toMatch(/ENDAST vad just den här lagen gör/);
    expect(SFS_JUDGE_INSTRUCTIONS).toMatch(/följdändring/);
    expect(SFS_JUDGE_TEMPLATE_VERSION).toBe('v4');
  });

  it('skips budget propositions as pair sources', () => {
    const store = { laws: sfs.laws, byProp: { B1: ['sfs-2025-3'], P3: ['sfs-2025-3'] } };
    const pairs = planSfsPairs(
      [prom('a', 'legislative', [propEv('B1')]), prom('b', 'legislative', [propEv('P3')])],
      store,
      [
        {
          dok_id: 'B1',
          doktyp: 'prop',
          rm: '2024/25',
          beteckning: '1',
          titel: 'Budgetpropositionen',
        },
      ],
    );
    expect(pairs.map((p) => p.id)).toEqual(['b::sfs-2025-3']);
  });

  it('re-judges earlier full/partial and unjudged pairs, keeps none/weaker', () => {
    const pair = (id: string) => ({ id, promise_id: 'p', sfs_key: 'k', prop_ids: [], bet_ids: [] });
    const old = (id: string, label: 'full' | 'partial' | 'weaker' | 'none') => ({
      id,
      promise_id: 'p',
      sfs: 's',
      sfs_dok_id: 'k',
      label,
      confidence: 'high' as const,
      covered_sv: '',
      missing_sv: '',
      reason: 'r',
      template_version: 'v1',
    });
    const run = (opts?: Parameters<typeof splitByEarlierRun>[3]) =>
      splitByEarlierRun(
        ['a', 'b', 'c', 'd', 'e'].map(pair),
        [old('a', 'full'), old('b', 'partial'), old('c', 'none'), old('d', 'weaker')],
        new Set(['full', 'partial']),
        opts,
      );
    // single-law bills: none/weaker from an older template stay
    const single = run({ currentVersion: 'v4', isMultiLaw: () => false });
    expect(single.rerun.map((p) => p.id)).toEqual(['a', 'b', 'e']);
    expect(single.kept.map((r) => r.id)).toEqual(['c', 'd']);
    expect(single.kept[0]!.template_version).toBe('v1');
    // multi-law bills: older none/weaker may hide a full, so they are re-judged
    const multi = run({ currentVersion: 'v4', isMultiLaw: () => true });
    expect(multi.rerun.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    // same template version: input is unchanged, keep
    expect(run({ currentVersion: 'v1', isMultiLaw: () => true }).kept.map((r) => r.id)).toEqual([
      'c',
      'd',
    ]);
  });

  it('extracts a law its own lagtext and kommentar, skipping the table of contents', () => {
    const ps = [
      'Förslag till lag om ändring i utlänningslagen (2005:716) ........ 4',
      'Förslag till lag om ändring i lagen (1999:1) om x',
      'Intro',
    ]
      .concat([
        'Förslag till lag om ändring i utlänningslagen (2005:716)',
        '1 § Text A',
        '2 § Text B',
      ])
      .concat(['Förslag till lag om ändring i annan lag', 'Annat'])
      .concat(['8 Författningskommentar', 'ska inte med'])
      .concat(['Förslag till lag om ändring i utlänningslagen (2005:716)', '1 § Kommentar'])
      .map((text) => ({ text }));
    const out = extractLawSections(
      ps,
      'Lag (2022:5) om ändring i utlänningslagen (2005:716)',
      1000,
    )!;
    expect(out).toContain('1 § Text A');
    expect(out).toContain('1 § Kommentar');
    expect(out).not.toContain('Annat');
    expect(out).not.toContain('ska inte med');
    expect(out).not.toContain('........');
    expect(extractLawSections(ps, 'Lag (2022:5) om något helt annat', 1000)).toBeNull();
    expect(
      extractLawSections(ps, 'Lag (2022:5) om ändring i utlänningslagen (2005:716)', 12)!,
    ).toContain('avkortat');
  });

  it('normalises law titles and puts the law sections in the prompt and the cache key', () => {
    expect(normalizeLawTitle('Lag (2023:311) om X')).toBe('lag om x');
    expect(normalizeLawTitle('Förslag till lag om X')).toBe('lag om x');
    const base = {
      promise: { title: 't', description: 'd' },
      law: { sfs: '2025:1', title: 'Lag (2025:1) om X', omfattning: null, ikraft: null },
      propTexts: [],
    } as unknown as Parameters<typeof buildPrompt>[0];
    const withText = buildPrompt({
      ...base,
      lawSections: [{ designation: 'Prop. 1', text: '1 § hej' }],
    });
    expect(withText).toContain('LAGENS EGEN TEXT I PROPOSITION Prop. 1\n1 § hej');
    expect(judgeKey('claude', 'm', withText, 'i')).not.toBe(
      judgeKey('claude', 'm', buildPrompt(base), 'i'),
    );
  });

  it('marks a run incomplete when requests were skipped on transient errors', async () => {
    const s = await runRequests(
      [
        {
          pair: { id: 'a', promise_id: 'p', sfs_key: 'k', prop_ids: [], bet_ids: [] },
          key: 'a'.padEnd(64, '0'),
          prompt: 'x',
          estimated_cost_usd: 0.01,
        },
      ],
      {
        judge: {
          kind: 'x',
          judge: async () => {
            throw new JudgeError('overloaded', 529);
          },
        },
        instructions: 'i',
        cache: createMemoryCoverageCache(),
        maxCostUsd: 1,
      },
    );
    expect(s.status).toBe('incomplete');
  });
});
