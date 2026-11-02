import { describe, expect, it } from 'vitest';
import { buildAgreementPage, hasAgreementPoints, type PageablePromise } from './agreement-page';

const agr = (outcome: string, promises: string[]) =>
  ({ kind: 'agreement', source: 'ex', date: '2022-10-14', promises, outcome, note: null }) as never;

function p(id: string, source: string, area: string, evidence: unknown[] = []): PageablePromise {
  return {
    id,
    title: id,
    area,
    parties: ['M'],
    source: { id: source },
    evidence: evidence as never,
  };
}

const data = [
  p('pt-b', 'ex', 'Energi'),
  p('pt-a', 'ex', 'Kriminalpolitik'),
  p('pt-c', 'ex', 'Kriminalpolitik'),
  p('m1', 'manifest', 'Kriminalpolitik', [agr('included', ['pt-a'])]),
  p('m2', 'manifest', 'Energi', [agr('not_addressed', [])]),
  p('m3', 'manifest', 'Energi'),
];

describe('buildAgreementPage', () => {
  const page = buildAgreementPage('ex', data);

  it('groups points by area in vocabulary order and keeps every point', () => {
    expect(page.points.map((g) => g.area)).toEqual(['Kriminalpolitik', 'Energi']);
    expect(page.points[0].items.map((i) => i.id)).toEqual(['pt-a', 'pt-c']);
    expect(page.pointCount).toBe(3);
  });

  it('maps matched manifesto promises onto points', () => {
    expect(page.points[0].items[0].matched.map((m) => m.id)).toEqual(['m1']);
    expect(page.unmatchedCount).toBe(2);
  });

  it('lists not addressed promises and counts outcomes', () => {
    expect(page.notAddressed).toEqual([
      { area: 'Energi', items: [{ id: 'm2', title: 'm2', parties: ['M'] }] },
    ]);
    expect(page.outcomeCounts.included).toBe(1);
    expect(page.outcomeCounts.not_addressed).toBe(1);
  });
});

describe('hasAgreementPoints', () => {
  it('is false when nothing cites the agreement', () => {
    expect(hasAgreementPoints('ex', data)).toBe(true);
    expect(hasAgreementPoints('other', data)).toBe(false);
  });
});
