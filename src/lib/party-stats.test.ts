import { describe, expect, it } from 'vitest';
import type { AgreementOutcome, Evidence } from '@/schema/promise';
import {
  agreementOutcomeCounts,
  areaCounts,
  assessedCount,
  filterPromises,
  partiesWithPromises,
  promisesForParty,
  sortByTitle,
  verdictCounts,
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
];

describe('party-stats', () => {
  it('counts joint promises for every party', () => {
    expect(promisesForParty(all, 'L')).toHaveLength(4);
    expect(promisesForParty(all, 'SD')).toHaveLength(1);
    expect(promisesForParty(all, 'S')).toHaveLength(0);
  });

  it('lists parties with promises in canonical order', () => {
    expect(partiesWithPromises(all)).toEqual(['M', 'SD', 'KD', 'L']);
  });

  it('counts every verdict, including zeros', () => {
    const c = verdictCounts(all);
    expect(c.unassessed).toBe(1);
    expect(c.fulfilled).toBe(1);
    expect(c.broken).toBe(1);
    expect(c.in_progress).toBe(0);
    expect(c.not_assessable).toBe(1);
    expect(assessedCount(all)).toBe(2);
  });

  it('filters by query, area and verdict', () => {
    expect(filterPromises(all, { query: 'B' }).map((x) => x.id)).toEqual(['b']);
    expect(filterPromises(all, { area: 'Skola' })).toHaveLength(2);
    expect(filterPromises(all, { area: 'Skola', verdict: 'broken' }).map((x) => x.id)).toEqual([
      'c',
    ]);
    expect(filterPromises(all, {})).toHaveLength(4);
  });

  it('groups areas and sorts titles without mutating', () => {
    expect(areaCounts(all)).toEqual([
      { area: 'Skatter', count: 2 },
      { area: 'Skola', count: 2 },
    ]);
    const input = [p('b', []), p('a', [])];
    expect(sortByTitle(input).map((x) => x.id)).toEqual(['a', 'b']);
    expect(input[0]!.id).toBe('b');
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
