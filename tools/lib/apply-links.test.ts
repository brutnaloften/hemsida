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

  it('ignores unproposed, contradicting and unknown pairs', () => {
    expect(
      applyLinks(
        base,
        [pair('P1', { proposed: false }), pair('B1', { label: 'contradicts' }), pair('ZZ')],
        docs,
        '2026-11-10',
      ),
    ).toBeNull();
  });

  it('leaves promises with an existing verdict or Riksdag evidence alone', () => {
    const decided = { ...base, verdict: { ...base.verdict, value: 'broken' as const } };
    expect(applyLinks(decided, [pair('P1')], docs, '2026-11-10')).toBeNull();
    const first = applyLinks(base, [pair('P1')], docs, '2026-11-10')!;
    const again = { ...base, evidence: first.evidence };
    expect(applyLinks(again, [pair('P1')], docs, '2026-11-10')).toBeNull();
  });
});
