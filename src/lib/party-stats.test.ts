import { describe, expect, it } from 'vitest';
import type { AgreementOutcome, Evidence } from '@/schema/promise';
import {
  agreementOutcomeCounts,
  assessedCount,
  isTermComplete,
  verdictBarSegments,
  promisesForParty,
  verdictAriaLabel,
  verdictCounts,
  verdictSummaryText,
  type PartyPromise,
} from '@/lib/party-stats';

const p = (
  id: string,
  parties: string[],
  value: PartyPromise['verdict']['value'] = 'unassessed',
  area = 'Skatter',
): PartyPromise => ({ id, title: id, area, parties, verdict: { value } });

const all = [
  p('a', ['M', 'KD', 'L', 'SD']),
  p('b', ['L'], 'fulfilled', 'Skola'),
  p('c', ['L'], 'broken', 'Skola'),
  p('d', ['L'], 'not_assessable'),
  p('e', ['L'], 'expired'),
];

describe('party-stats', () => {
  it('counts joint promises for every party', () => {
    expect(promisesForParty(all, 'L')).toHaveLength(5);
    expect(promisesForParty(all, 'SD')).toHaveLength(1);
    expect(promisesForParty(all, 'S')).toHaveLength(0);
  });

  it('counts every verdict, including zeros', () => {
    const c = verdictCounts(all);
    expect(c.unassessed).toBe(1);
    expect(c.fulfilled).toBe(1);
    expect(c.broken).toBe(1);
    expect(c.in_progress).toBe(0);
    expect(c.not_assessable).toBe(1);
    expect(c.expired).toBe(1);
    expect(assessedCount(all)).toBe(2);
  });
});

describe('agreementOutcomeCounts', () => {
  const ag = (outcome: AgreementOutcome, date = '2022-11-14') =>
    ({
      kind: 'agreement',
      source: 'tidoavtalet',
      date,
      promises: outcome === 'not_addressed' ? [] : ['x'],
      outcome,
      note: null,
    }) as Evidence;

  it('counts every outcome, zero when absent', () => {
    const { counts, total } = agreementOutcomeCounts([
      { evidence: [ag('included')] },
      { evidence: [ag('included')] },
      { evidence: [ag('not_addressed')] },
    ]);
    expect(counts).toEqual({
      included: 2,
      weakened: 0,
      strengthened: 0,
      contradicted: 0,
      not_addressed: 1,
    });
    expect(total).toBe(3);
  });

  it('skips promises without agreement evidence', () => {
    const { counts, total } = agreementOutcomeCounts([{ evidence: [] }]);
    expect(total).toBe(0);
    expect(Object.values(counts).every((n) => n === 0)).toBe(true);
  });

  it('counts a promise once, under its latest agreement entry', () => {
    const { counts, total } = agreementOutcomeCounts([
      { evidence: [ag('included', '2022-01-01'), ag('weakened', '2023-01-01')] },
    ]);
    expect(counts.weakened).toBe(1);
    expect(counts.included).toBe(0);
    expect(total).toBe(1);
  });
});

describe('verdict count texts', () => {
  const c = (o: Record<string, number>) =>
    ({ ...verdictCounts([]), ...o }) as ReturnType<typeof verdictCounts>;
  it('leads with the outcome and the expiry sentence when the term is complete', () => {
    const counts = c({ expired: 3 });
    expect(isTermComplete(counts)).toBe(true);
    expect(verdictSummaryText(3, counts)).toBe(
      'Alla 3 löften har granskats. 3 löpte ut utan avgörande verdikt när mandatperioden tog slut.',
    );
    expect(verdictAriaLabel(3, counts)).toBe('Alla 3 löften granskade: 3 löpte ut');
  });
  it('lists outcomes in bar order for a complete term', () => {
    const counts = c({ fulfilled: 2, in_progress: 1, broken: 1, expired: 4 });
    expect(verdictSummaryText(8, counts)).toBe(
      'Alla 8 löften har granskats: 2 uppfyllda, 1 pågår, 1 brutna. 4 löpte ut utan avgörande verdikt när mandatperioden tog slut.',
    );
  });
  it('keeps the unjudged framing when unassessed promises remain', () => {
    const counts = c({ unassessed: 2 });
    expect(isTermComplete(counts)).toBe(false);
    expect(verdictSummaryText(2, counts)).toContain('2 löften är ännu inte bedömda');
    expect(verdictSummaryText(2, counts)).not.toContain('Alla');
    expect(verdictAriaLabel(2, counts)).toBe('2 löften: 2 inte bedömda');
  });
  it('mentions not assessable promises in summary and aria label', () => {
    const counts = c({ fulfilled: 1, not_assessable: 2 });
    expect(verdictAriaLabel(3, counts)).toBe(
      'Alla 3 löften granskade: 1 uppfyllda, 2 ej bedömbara',
    );
    expect(verdictSummaryText(3, counts)).toBe(
      'Alla 3 löften har granskats: 1 uppfyllda, 2 ej bedömbara.',
    );
  });
  it('an empty set is not complete', () => {
    expect(isTermComplete(c({}))).toBe(false);
  });
  it('leaves zero-count segments out of the bar', () => {
    expect(verdictBarSegments(c({ expired: 2, fulfilled: 1 }))).toEqual([
      { verdict: 'fulfilled', n: 1 },
      { verdict: 'expired', n: 2 },
    ]);
  });
});
