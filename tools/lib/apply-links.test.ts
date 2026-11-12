import { describe, expect, it } from 'vitest';
import { promiseSchema } from './schema.ts';
import {
  applyLinks,
  designationOf,
  evidenceFor,
  mergeRunPairs,
  sfsJudgements,
  type JudgedPair,
  type SfsInput,
  type SfsLabel,
  type StoreDocument,
} from './apply-links.ts';

const base = promiseSchema.parse({
  id: 'tido-x',
  term: '2022-2026',
  title: 'X',
  description: 'X',
  source: { id: 'tidoavtalet' },
  parties: ['M'],
  roles: { M: 'government' },
  type: 'legislative',
  area: 'Arbetsmarknad',
  verdict: { value: 'unassessed', reasoning: '', date: '2022-10-14' },
});

const doc = (dok_id: string, doktyp: string, datum: string, beteckning = '1'): StoreDocument => ({
  dok_id,
  doktyp,
  rm: '2025/26',
  beteckning,
  titel: `Titel ${dok_id}`,
  datum,
  url: `https://data.riksdagen.se/dokument/${dok_id}.html`,
});
const docs = new Map([
  ['P1', doc('P1', 'prop', '2026-03-17', '207')],
  ['B1', doc('B1', 'bet', '2026-05-01', 'SoU18')],
  ['S1', doc('S1', 'sou', '2025-01-10', '1')],
  ['S2', doc('S2', 'sou', '2026-06-01', '2')],
]);
const pair = (document_id: string, over: Partial<JudgedPair> = {}): JudgedPair => ({
  promise_id: 'tido-x',
  document_id,
  label: 'match',
  stage: 'preparatory',
  confidence: 'high',
  proposed: true,
  ...over,
});

describe('mergeRunPairs', () => {
  const pair = (
    promise_id: string,
    document_id: string,
    label: JudgedPair['label'],
  ): JudgedPair => ({
    promise_id,
    document_id,
    label,
    stage: 'definitive',
    confidence: 'medium',
    proposed: label === 'match',
  });

  it('lets a later run replace an earlier one per promise, keeping the rest', () => {
    const main = [pair('a', 'D1', 'match'), pair('a', 'D2', 'partial'), pair('b', 'D3', 'match')];
    const split = [pair('a', 'D1', 'partial'), pair('c', 'D4', 'match')];
    const merged = mergeRunPairs([main, split]);
    expect(merged.get('a')?.map((p) => `${p.document_id}:${p.label}`)).toEqual(['D1:partial']);
    expect(merged.get('b')?.length).toBe(1);
    expect(merged.get('c')?.length).toBe(1);
  });

  it('is order dependent: the last run wins', () => {
    const one = [pair('a', 'D1', 'match')];
    const two = [pair('a', 'D1', 'partial')];
    expect(mergeRunPairs([one, two]).get('a')?.[0].label).toBe('partial');
    expect(mergeRunPairs([two, one]).get('a')?.[0].label).toBe('match');
  });
});

describe('applyLinks', () => {
  it('formats designations', () => {
    expect(designationOf(docs.get('P1')!)).toBe('Prop. 2025/26:207');
    expect(designationOf(docs.get('B1')!)).toBe('Bet. 2025/26:SoU18');
  });

  it('adds evidence and sets in_progress when a prop is among it, passing the schema', () => {
    const r = applyLinks(
      base,
      [pair('B1', { stage: 'definitive' }), pair('P1')],
      docs,
      '2026-11-10',
    )!;
    expect(r.evidence.map((e) => e.kind)).toEqual(['prop', 'bet']);
    expect(r.verdict.value).toBe('in_progress');
    expect(r.verdict.assessedBy).toBe('ai');
    expect(r.verdict.reasoning).not.toContain('AI-modell');
    expect(r.verdict.history).toHaveLength(1);
    expect(r.verdict.reasoning).toContain('Prop. 2025/26:207');
    expect(r.verdict.reasoning).toContain('Bet. 2025/26:SoU18');
    expect(promiseSchema.safeParse({ ...base, ...r }).success).toBe(true);
  });

  it('adds the betänkande that decided a linked proposition, with the proposition relevance', () => {
    const r = applyLinks(
      base,
      [pair('P1', { label: 'partial' })],
      docs,
      '2026-11-10',
      new Map([['P1', ['B1', 'MISSING']]]),
    )!;
    expect(r.evidence.map((e) => [e.kind, (e as { relevance: string }).relevance])).toEqual([
      ['prop', 'partial'],
      ['bet', 'partial'],
    ]);
    expect(r.verdict.reasoning).toContain('Riksdagen har även fattat beslut i Bet. 2025/26:SoU18');
    // Not added when the proposition itself is not linked.
    const none = applyLinks(base, [pair('B1')], docs, '2026-11-10', new Map([['P1', ['B1']]]));
    expect(none?.verdict.value ?? 'unassessed').toBe('unassessed');
  });

  it('does not add deciding bets for budget propositions or bills with many of them', () => {
    const budget = doc('P0', 'prop', '2024-09-20', '1');
    const all = new Map(docs).set('P0', budget);
    for (const n of ['B2', 'B3', 'B4', 'B5', 'B6']) all.set(n, doc(n, 'bet', '2024-12-01', n));
    const r = applyLinks(base, [pair('P0')], all, '2026-11-10', new Map([['P0', ['B2']]]))!;
    expect(r.evidence.map((e) => e.kind)).toEqual(['prop']);
    const many = applyLinks(
      base,
      [pair('P1')],
      all,
      '2026-11-10',
      new Map([['P1', ['B2', 'B3', 'B4', 'B5', 'B6']]]),
    )!;
    expect(many.evidence.map((e) => e.kind)).toEqual(['prop']);
  });

  it('keeps evidence of an AI verdict that no judgement in the run mentions', () => {
    const first = applyLinks(
      base,
      [pair('P1'), pair('B1', { stage: 'definitive' })],
      docs,
      '2026-11-09',
    )!;
    const rerun = applyLinks(
      { ...base, ...first },
      [pair('P1', { label: 'partial' })],
      docs,
      '2026-11-10',
    )!;
    expect(rerun.evidence.map((e) => e.kind)).toEqual(['prop', 'bet']);
  });

  it('drops background pairs and skrivelser', () => {
    const skr = {
      ...doc('S1', 'prop', '2026-01-01', '9'),
      text: 'X Regeringens skrivelse 2025/26:9',
    };
    const d2 = new Map(docs).set('S1', skr);
    expect(
      applyLinks(base, [pair('P1', { stage: 'background' }), pair('S1')], d2, '2026-11-10'),
    ).toBeNull();
  });

  it('uses singular wording for one document', () => {
    const r = applyLinks(base, [pair('P1')], docs, '2026-11-10')!;
    expect(r.verdict.reasoning).toContain('Ett dokument i riksdagens register');
    expect(r.verdict.reasoning).toContain('Dokumentet behandlar hela löftet.');
  });

  it('keeps unassessed when only a betänkande is evidence', () => {
    const r = applyLinks(base, [pair('B1', { label: 'partial' })], docs, '2026-11-10')!;
    expect(r.verdict.value).toBe('unassessed');
    expect(r.evidence).toHaveLength(1);
  });

  it('ignores unproposed and unknown pairs', () => {
    expect(
      applyLinks(base, [pair('P1', { proposed: false }), pair('ZZ')], docs, '2026-11-10'),
    ).toBeNull();
  });

  it('recomputes an AI-set verdict from newer judgements and keeps its history', () => {
    const first = applyLinks(base, [pair('P1')], docs, '2026-11-10')!;
    const earlier = { ...base, ...first } as typeof base;
    const second = applyLinks(
      earlier,
      [pair('P1'), pair('B1', { stage: 'definitive' })],
      docs,
      '2026-11-12',
    )!;
    expect(second.evidence.map((e) => e.kind)).toEqual(['prop', 'bet']);
    expect(second.verdict.history).toHaveLength(1);
    expect(second.verdict.date).toBe('2026-11-12');
    const gone = applyLinks(
      earlier,
      [pair('P1', { label: 'no_match', proposed: false }), pair('B1', { label: 'partial' })],
      docs,
      '2026-11-12',
    )!;
    expect(gone.verdict.value).toBe('unassessed');
    expect(gone.verdict.assessedBy).toBeUndefined();
    expect(gone.evidence.map((e) => e.kind)).toEqual(['bet']);
    // The earlier AI verdict is kept in history when the value changes.
    expect(gone.verdict.history).toHaveLength(2);
    expect(gone.verdict.history.at(-1)).toMatchObject({ value: 'in_progress', assessedBy: 'ai' });
  });

  it('falls back to unassessed when an AI verdict has no proposed pairs left', () => {
    const first = applyLinks(base, [pair('P1')], docs, '2026-11-10')!;
    const earlier = { ...base, ...first } as typeof base;
    const gone = applyLinks(
      earlier,
      [pair('P1', { label: 'no_match', proposed: false })],
      docs,
      '2026-11-12',
    )!;
    expect(gone.verdict.value).toBe('unassessed');
    expect(gone.evidence).toHaveLength(0);
    expect(gone.verdict.history.at(-1)).toMatchObject({ value: 'in_progress' });
  });

  it('returns null when a rerun changes nothing', () => {
    const first = applyLinks(base, [pair('P1')], docs, '2026-11-10')!;
    const earlier = { ...base, ...first } as typeof base;
    expect(applyLinks(earlier, [pair('P1')], docs, '2026-11-12')).toBeNull();
  });

  it('merges new planning documents into an unassessed promise that only had a betänkande', () => {
    const betOnly = applyLinks(base, [pair('B1', { label: 'partial' })], docs, '2026-11-10')!;
    const earlier = { ...base, ...betOnly } as typeof base;
    expect(earlier.verdict.value).toBe('unassessed');
    const later = applyLinks(
      earlier,
      [pair('B1', { label: 'partial' }), pair('P1')],
      docs,
      '2026-11-12',
    )!;
    expect(later.evidence.map((e) => e.kind)).toEqual(['prop', 'bet']);
    expect(later.verdict.value).toBe('in_progress');
    expect(later.verdict.history).toHaveLength(1);
  });

  it('keeps agreement evidence on a rerun and leaves a human-set verdict alone', () => {
    const agreement = {
      kind: 'agreement' as const,
      source: 'tidoavtalet',
      date: '2022-10-14',
      promises: ['tido-x'],
      outcome: 'included' as const,
      note: null,
    };
    const first = applyLinks({ ...base, evidence: [agreement] }, [pair('P1')], docs, '2026-11-10')!;
    const earlier = { ...base, ...first } as typeof base;
    const again = applyLinks(
      earlier,
      [pair('P1'), pair('B1', { stage: 'definitive' })],
      docs,
      '2026-11-12',
    )!;
    expect(again.evidence.map((e) => e.kind)).toEqual(['agreement', 'prop', 'bet']);
    const human = { ...earlier, verdict: { ...earlier.verdict, assessedBy: 'human' as const } };
    expect(applyLinks(human, [pair('P1')], docs, '2026-11-12')).toBeNull();
  });

  it('leaves promises with an existing verdict or Riksdag evidence alone', () => {
    const decided = { ...base, verdict: { ...base.verdict, value: 'broken' as const } };
    expect(applyLinks(decided, [pair('P1')], docs, '2026-11-10')).toBeNull();
    const first = applyLinks(base, [pair('P1')], docs, '2026-11-10')!;
    const again = { ...base, evidence: first.evidence };
    expect(applyLinks(again, [pair('P1')], docs, '2026-11-10')).toBeNull();
  });

  describe('contradicts', () => {
    const against = (id: string, over: Partial<JudgedPair> = {}) =>
      pair(id, { label: 'contradicts', ...over });

    it('adds a contradicting document next to planning evidence without counting it', () => {
      const r = applyLinks(base, [pair('P1'), against('S1')], docs, '2026-11-10')!;
      expect(r.evidence.map((e) => [e.kind, (e as { relevance: string }).relevance])).toEqual([
        ['sou', 'contradicts'],
        ['prop', 'full'],
      ]);
      expect(r.verdict.value).toBe('in_progress');
      expect(r.verdict.reasoning).toContain('motverkar löftet');
      expect(promiseSchema.safeParse({ ...base, ...r }).success).toBe(true);
    });

    it('does not use a contradicting dir/sou/ds/prop as the planning that sets in_progress', () => {
      // Only a contradicting document: shown as evidence, the promise stays unassessed.
      const only = applyLinks(base, [against('S1')], docs, '2026-11-10')!;
      expect(only.verdict.value).toBe('unassessed');
      expect(only.evidence.map((e) => [e.kind, (e as { relevance: string }).relevance])).toEqual([
        ['sou', 'contradicts'],
      ]);
      expect(promiseSchema.safeParse({ ...base, ...only }).success).toBe(true);
      // Bet is full evidence but no planning, so there is still no verdict.
      const r = applyLinks(base, [pair('B1'), against('S1')], docs, '2026-11-10')!;
      expect(r.verdict.value).toBe('unassessed');
      expect(r.evidence.map((e) => e.kind)).toEqual(['sou', 'bet']);
    });

    it('skips background contradicts and unproposed pairs', () => {
      const r = applyLinks(
        base,
        [pair('P1'), against('S1', { stage: 'background' })],
        docs,
        '2026-11-10',
      )!;
      expect(r.evidence.map((e) => e.kind)).toEqual(['prop']);
    });

    it('falls an AI verdict back to unassessed when only a contradicting document remains', () => {
      const first = applyLinks(base, [pair('P1'), against('S1')], docs, '2026-11-10')!;
      const promise = promiseSchema.parse({ ...base, ...first });
      const r = applyLinks(
        promise,
        [pair('P1', { label: 'no_match' }), against('S1')],
        docs,
        '2026-11-11',
      )!;
      expect(r.verdict.value).toBe('unassessed');
      expect(r.evidence.map((e) => e.kind)).toEqual(['sou']);
    });

    it('is idempotent on a rerun', () => {
      const pairs = [pair('P1'), against('S1')];
      const first = applyLinks(base, pairs, docs, '2026-11-10')!;
      const promise = promiseSchema.parse({ ...base, ...first });
      expect(applyLinks(promise, pairs, docs, '2026-11-11')).toBeNull();
    });
  });
});

describe('applyLinks with SFS', () => {
  const sdocs = new Map([
    ...docs,
    ['P2', doc('P2', 'prop', '2025-09-01', '50')],
    ['PB', { ...doc('PB', 'prop', '2025-09-20', '1'), titel: 'Budgetpropositionen för 2026' }],
  ]);
  const today = '2026-11-10';
  const laws = {
    'sfs-2026-100': { sfs: '2026:100', title: 'Lag (2026:100) om X', ikraft: '2026-07-01' },
    'sfs-2026-101': { sfs: '2026:101', title: 'Lag (2026:101) om Y', ikraft: '2026-07-01' },
    'sfs-2027-5': { sfs: '2027:5', title: 'Lag (2027:5) om Z', ikraft: '2027-01-01' },
    'sfs-2026-200': { sfs: '2026:200', title: 'Lag (2026:200) om W', ikraft: null },
  };
  const sfsFor = (
    byProp: Record<string, string[]>,
    labels: Record<string, [SfsLabel, 'high' | 'medium' | 'low']>,
    overrides: Record<string, { label: SfsLabel; reason: string; missing_sv?: string }> = {},
  ): SfsInput => ({
    laws,
    byProp,
    judgements: sfsJudgements(
      Object.entries(labels).map(([key, [label, confidence]]) => ({
        id: `tido-x::${key}`,
        label,
        confidence,
        missing_sv: label === 'full' ? '' : 'Reglerna gäller bara en del.',
      })),
      overrides,
    ),
  });
  const run = (sfs: SfsInput, pairs = [pair('P1')], promise: typeof base = base, d = today) =>
    applyLinks(promise, pairs, sdocs, d, new Map(), sfs);
  const sfsOf = (r: NonNullable<ReturnType<typeof run>>) =>
    r.evidence.filter((e) => e.kind === 'sfs') as { dok_id: string; date: string }[];
  const valid = (r: NonNullable<ReturnType<typeof run>>, p = base) =>
    expect(promiseSchema.safeParse({ ...p, ...r }).success).toBe(true);

  it('lets an override replace the note about what the law leaves out', () => {
    const r = run(
      sfsFor(
        { P1: ['sfs-2026-100'] },
        { 'sfs-2026-100': ['partial', 'low'] },
        { 'tido-x::sfs-2026-100': { label: 'partial', reason: 'r', missing_sv: 'Ny anteckning.' } },
      ),
    )!;
    expect((r.evidence.find((e) => e.kind === 'sfs') as { note: string }).note).toBe(
      'Ny anteckning.',
    );
  });

  it('sets fulfilled for a law judged full at high confidence that is in force', () => {
    const r = run(sfsFor({ P1: ['sfs-2026-100'] }, { 'sfs-2026-100': ['full', 'high'] }))!;
    expect(r.verdict.value).toBe('fulfilled');
    expect(r.verdict.assessedBy).toBe('ai');
    expect(r.evidence.find((e) => e.kind === 'sfs')).toEqual({
      kind: 'sfs',
      dok_id: 'sfs-2026-100',
      designation: 'SFS 2026:100',
      title: 'Lag (2026:100) om X',
      date: '2026-07-01',
      url: 'https://svenskforfattningssamling.se/doc/2026100.html',
      relevance: 'full',
      note: null,
    });
    expect(r.verdict.reasoning).toContain('SFS 2026:100');
    expect(r.verdict.reasoning).toContain('2026-07-01');
    expect(r.verdict.reasoning).not.toContain('Ingen SFS-författning');
    valid(r);
  });

  it('keeps in_progress for a full below high confidence, with the sfs entry and neutral reasoning', () => {
    const r = run(sfsFor({ P1: ['sfs-2026-100'] }, { 'sfs-2026-100': ['full', 'medium'] }))!;
    expect(r.verdict.value).toBe('in_progress');
    expect((r.evidence.find((e) => e.kind === 'sfs') as { relevance: string }).relevance).toBe(
      'full',
    );
    expect(r.verdict.reasoning).not.toContain('bara en del');
    expect(r.verdict.reasoning).toContain('trädde i kraft 2026-07-01');
    valid(r);
  });

  it('a linked dir/sou/ds newer than the newest enacted proposition keeps in_progress', () => {
    const sfs = sfsFor({ P1: ['sfs-2026-100'] }, { 'sfs-2026-100': ['partial', 'high'] });
    const r = run(sfs, [pair('P1'), pair('S2')])!;
    expect(r.verdict.value).toBe('in_progress');
    expect(r.verdict.reasoning).toContain('SOU 2025/26:2');
    // An older inquiry (before the proposition) does not.
    expect(run(sfs, [pair('P1'), pair('S1')])!.verdict.value).toBe('partially_fulfilled');
  });

  it('a law judged weaker blocks fulfilled', () => {
    const r = run(
      sfsFor(
        { P1: ['sfs-2026-100', 'sfs-2026-101'] },
        { 'sfs-2026-100': ['full', 'high'], 'sfs-2026-101': ['weaker', 'high'] },
      ),
    )!;
    expect(r.verdict.value).toBe('partially_fulfilled');
    expect(r.verdict.reasoning).toContain('Lagarna genomför bara en del');
  });

  it('a future law on the same proposition does not block fulfilled', () => {
    const r = run(
      sfsFor(
        { P1: ['sfs-2026-100', 'sfs-2027-5'] },
        { 'sfs-2026-100': ['full', 'high'], 'sfs-2027-5': ['partial', 'high'] },
      ),
    )!;
    expect(r.verdict.value).toBe('fulfilled');
    expect(sfsOf(r)).toHaveLength(2);
    valid(r);
  });

  it('an undated judged law on the same proposition blocks fulfilled', () => {
    const r = run(
      sfsFor(
        { P1: ['sfs-2026-100', 'sfs-2026-200'] },
        { 'sfs-2026-100': ['full', 'high'], 'sfs-2026-200': ['partial', 'high'] },
      ),
    )!;
    expect(r.verdict.value).toBe('partially_fulfilled');
  });

  it('sets partially_fulfilled for a partial law in force, with the gap in note and reasoning', () => {
    const r = run(sfsFor({ P1: ['sfs-2026-100'] }, { 'sfs-2026-100': ['partial', 'high'] }))!;
    expect(r.verdict.value).toBe('partially_fulfilled');
    const e = r.evidence.find((x) => x.kind === 'sfs') as { relevance: string; note: string };
    expect(e.relevance).toBe('partial');
    expect(e.note).toBe('Reglerna gäller bara en del.');
    expect(r.verdict.reasoning).toContain('Reglerna gäller bara en del.');
    valid(r);
  });

  it('treats a weaker law as partial evidence', () => {
    const r = run(sfsFor({ P1: ['sfs-2026-100'] }, { 'sfs-2026-100': ['weaker', 'high'] }))!;
    expect(r.verdict.value).toBe('partially_fulfilled');
    expect((r.evidence.find((x) => x.kind === 'sfs') as { relevance: string }).relevance).toBe(
      'partial',
    );
  });

  it('stays in_progress while another linked proposition has no law in force', () => {
    const sfs = sfsFor({ P1: ['sfs-2026-100'] }, { 'sfs-2026-100': ['full', 'high'] });
    const r = run(sfs, [pair('P1'), pair('P2')])!;
    expect(r.verdict.value).toBe('in_progress');
    expect(sfsOf(r)).toHaveLength(1);
    expect(r.verdict.reasoning).toContain('Prop. 2025/26:50');
    valid(r);
  });

  it('ignores a budget proposition when looking for pending propositions', () => {
    const sfs = sfsFor({ P1: ['sfs-2026-100'] }, { 'sfs-2026-100': ['full', 'high'] });
    expect(run(sfs, [pair('P1'), pair('PB')])!.verdict.value).toBe('fulfilled');
  });

  it('counts a proposition whose only law was judged none as having a law in force', () => {
    const sfs = sfsFor(
      { P1: ['sfs-2026-100'], P2: ['sfs-2026-101'] },
      { 'sfs-2026-100': ['full', 'high'], 'sfs-2026-101': ['none', 'high'] },
    );
    const r = run(sfs, [pair('P1'), pair('P2')])!;
    expect(r.verdict.value).toBe('fulfilled');
    expect(sfsOf(r).map((e) => e.dok_id)).toEqual(['sfs-2026-100']);
  });

  it('a law with a future in-force date counts as fulfilled and names the date in future tense', () => {
    const r = run(sfsFor({ P1: ['sfs-2027-5'] }, { 'sfs-2027-5': ['full', 'high'] }))!;
    expect(r.verdict.value).toBe('fulfilled');
    expect(sfsOf(r)[0]!.date).toBe('2027-01-01');
    expect(r.verdict.reasoning).toContain('träder i kraft 2027-01-01');
    expect(r.verdict.reasoning).not.toContain('trädde i kraft');
    valid(r);
  });

  it('the verdict does not depend on today relative to the in-force date', () => {
    const sfs = sfsFor({ P1: ['sfs-2027-5'] }, { 'sfs-2027-5': ['full', 'high'] });
    expect(run(sfs, [pair('P1')], base, '2027-01-01')!.verdict.value).toBe('fulfilled');
    expect(run(sfs, [pair('P1')], base, '2026-12-31')!.verdict.value).toBe('fulfilled');
  });

  it('adds no sfs entry for a law without in-force date and stays in_progress', () => {
    const r = run(sfsFor({ P1: ['sfs-2026-200'] }, { 'sfs-2026-200': ['full', 'high'] }))!;
    expect(r.verdict.value).toBe('in_progress');
    expect(sfsOf(r)).toHaveLength(0);
    expect(r.verdict.reasoning).toContain('Ingen SFS-författning');
  });

  it('laws on two propositions, one still in the future, both count', () => {
    const sfs = sfsFor(
      { P1: ['sfs-2026-100'], P2: ['sfs-2027-5'] },
      { 'sfs-2026-100': ['full', 'high'], 'sfs-2027-5': ['full', 'high'] },
    );
    const r = run(sfs, [pair('P1'), pair('P2')])!;
    expect(r.verdict.value).toBe('fulfilled');
    expect(sfsOf(r)).toHaveLength(2);
  });

  it('a future law keeps in_progress when it is only a medium-confidence full', () => {
    const r = run(sfsFor({ P1: ['sfs-2027-5'] }, { 'sfs-2027-5': ['full', 'medium'] }))!;
    expect(r.verdict.value).toBe('in_progress');
    expect(sfsOf(r)).toHaveLength(1);
  });

  it('adds no sfs evidence for coverage none or a missing judgement', () => {
    const sfs = sfsFor(
      { P1: ['sfs-2026-100', 'sfs-2026-101'] },
      { 'sfs-2026-100': ['none', 'high'] },
    );
    const r = run(sfs)!;
    expect(r.verdict.value).toBe('in_progress');
    expect(sfsOf(r)).toHaveLength(0);
  });

  it('does not handle sfs for non-legislative promises', () => {
    const budgetPromise = promiseSchema.parse({ ...base, type: 'budget' });
    const sfs = sfsFor({ P1: ['sfs-2026-100'] }, { 'sfs-2026-100': ['full', 'high'] });
    const r = run(sfs, [pair('P1')], budgetPromise)!;
    expect(r.verdict.value).toBe('in_progress');
    expect(sfsOf(r)).toHaveLength(0);
    // The missing-law placeholder only makes sense for a law promise.
    expect(r.verdict.reasoning).not.toContain('SFS-författning');
  });

  it('only uses laws reached through linked propositions', () => {
    const sfs = sfsFor({ P2: ['sfs-2026-100'] }, { 'sfs-2026-100': ['full', 'high'] });
    const r = run(sfs)!;
    expect(r.verdict.value).toBe('in_progress');
    expect(sfsOf(r)).toHaveLength(0);
  });

  it('overrides replace the judge label before the rules run', () => {
    const labels: Record<string, [SfsLabel, 'high']> = { 'sfs-2026-100': ['full', 'high'] };
    const byProp = { P1: ['sfs-2026-100'] };
    const none = run(
      sfsFor(byProp, labels, { 'tido-x::sfs-2026-100': { label: 'none', reason: 'wrong' } }),
    )!;
    expect(none.verdict.value).toBe('in_progress');
    expect(sfsOf(none)).toHaveLength(0);
    const partial = run(
      sfsFor(byProp, labels, { 'tido-x::sfs-2026-100': { label: 'partial', reason: 'part' } }),
    )!;
    expect(partial.verdict.value).toBe('partially_fulfilled');
  });

  it('is idempotent and keeps earlier verdicts in history when the value changes', () => {
    const sfs = sfsFor({ P1: ['sfs-2026-100'] }, { 'sfs-2026-100': ['full', 'high'] });
    const first = run(sfs)!;
    const promise = promiseSchema.parse({ ...base, ...first });
    expect(run(sfs, [pair('P1')], promise, '2026-11-12')).toBeNull();
    // An override downgrades it: the fulfilled verdict goes to history.
    const down = run(
      sfsFor(
        { P1: ['sfs-2026-100'] },
        { 'sfs-2026-100': ['full', 'high'] },
        {
          'tido-x::sfs-2026-100': { label: 'partial', reason: 'r' },
        },
      ),
      [pair('P1')],
      promise,
      '2026-11-12',
    )!;
    expect(down.verdict.value).toBe('partially_fulfilled');
    expect(down.verdict.history.map((h) => h.value)).toEqual(['unassessed', 'fulfilled']);
    // A law that is no longer judged is dropped again.
    const dropped = run(sfsFor({ P1: ['sfs-2026-100'] }, {}), [pair('P1')], promise, '2026-11-12')!;
    expect(dropped.verdict.value).toBe('in_progress');
    expect(sfsOf(dropped)).toHaveLength(0);
  });

  it('leaves hand-set verdicts alone', () => {
    const hand = promiseSchema.parse({
      ...base,
      evidence: [evidenceFor(pair('P1'), sdocs.get('P1')!)],
      verdict: { value: 'in_progress', reasoning: 'Handskriven bedömning.', date: '2026-01-01' },
    });
    const sfs = sfsFor({ P1: ['sfs-2026-100'] }, { 'sfs-2026-100': ['full', 'high'] });
    expect(run(sfs, [pair('P1')], hand)).toBeNull();
  });

  it('without sfs input nothing changes and existing sfs evidence stays', () => {
    const first = run(sfsFor({ P1: ['sfs-2026-100'] }, { 'sfs-2026-100': ['full', 'high'] }))!;
    const promise = promiseSchema.parse({ ...base, ...first });
    expect(applyLinks(promise, [pair('P1')], sdocs, today)).toBeNull();
    expect(promise.verdict.value).toBe('fulfilled');
  });
});

describe('applyLinks for inquiry promises', () => {
  const inquiry = promiseSchema.parse({ ...base, type: 'inquiry' });
  const idocs = new Map([
    ['D1', doc('D1', 'dir', '2023-05-01', '40')],
    ['S9', doc('S9', 'sou', '2025-06-01', '9')],
    ['P1', doc('P1', 'prop', '2026-03-17', '207')],
  ]);
  const today = '2026-11-12';
  const run = (pairs: JudgedPair[], promise = inquiry) => applyLinks(promise, pairs, idocs, today)!;

  it('is fulfilled by a directive judged match at high confidence, without any law', () => {
    const r = run([pair('D1')]);
    expect(r.verdict.value).toBe('fulfilled');
    expect(r.verdict.reasoning).toContain('Dir. 2025/26:40');
    expect(r.verdict.reasoning).not.toMatch(/lag/i);
    expect(r.evidence.some((e) => e.kind === 'sfs')).toBe(false);
    expect(promiseSchema.safeParse({ ...inquiry, ...r }).success).toBe(true);
  });

  it('a later SOU is shown as evidence and does not block fulfilled', () => {
    const r = run([pair('D1'), pair('S9')]);
    expect(r.evidence.map((e) => e.kind)).toEqual(['dir', 'sou']);
    expect(r.verdict.value).toBe('fulfilled');
    expect(r.verdict.reasoning).toContain('SOU 2025/26:9');
    expect(promiseSchema.safeParse({ ...inquiry, ...r }).success).toBe(true);
  });

  it('is partially_fulfilled for a partial directive and in_progress for a medium one', () => {
    expect(run([pair('D1', { label: 'partial' })]).verdict.value).toBe('partially_fulfilled');
    expect(run([pair('D1', { confidence: 'medium' })]).verdict.value).toBe('in_progress');
  });

  it('words a supplementary directive as a changed assignment, not an appointment', () => {
    const tdocs = new Map(idocs);
    tdocs.set('D2', {
      ...doc('D2', 'dir', '2023-02-16', '26'),
      titel: 'Tilläggsdirektiv till Utredningen om X',
    });
    const r = applyLinks(inquiry, [pair('D2')], tdocs, today)!;
    expect(r.verdict.value).toBe('fulfilled');
    expect(r.verdict.reasoning).toContain('ett ändrat uppdrag');
    expect(r.verdict.reasoning).not.toContain('har tillsatt utredningen');
  });

  it('stays in_progress without a directive (SOU only)', () => {
    const r = run([pair('S9')]);
    expect(r.verdict.value).toBe('in_progress');
    expect(promiseSchema.safeParse({ ...inquiry, ...r }).success).toBe(true);
  });

  it('a rerun without sfs input recomputes and then settles', () => {
    const first = run([pair('D1')]);
    const promise = promiseSchema.parse({ ...inquiry, ...first });
    expect(applyLinks(promise, [pair('D1')], idocs, today)).toBeNull();
    const down = applyLinks(promise, [pair('D1', { confidence: 'medium' })], idocs, today)!;
    expect(down.verdict.value).toBe('in_progress');
  });

  it('a legislative promise with only a directive stays in_progress', () => {
    expect(run([pair('D1')], base).verdict.value).toBe('in_progress');
  });
});
