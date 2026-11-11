import { describe, expect, it } from 'vitest';
import { promiseSchema } from './schema.ts';
import { applyLinks, designationOf, type JudgedPair, type StoreDocument } from './apply-links.ts';

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
