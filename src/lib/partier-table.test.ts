import { describe, expect, it } from 'vitest';
import { buildPartierRows, rolesPresent } from './partier-table';

const term = {
  roles: { S: 'opposition', M: 'government', SD: 'support', KD: 'government' },
  agreements: ['avt'],
} as never;
const mk = (id: string, parties: string[], verdict: string, outcome?: string) => ({
  id,
  title: id,
  area: 'a',
  parties,
  verdict: { value: verdict },
  evidence: outcome
    ? [{ kind: 'agreement', outcome, date: '2022-10-14', promises: [], source: 'avt' }]
    : [],
});
const promises = [
  mk('1', ['M', 'KD'], 'unassessed', 'included'),
  mk('2', ['M'], 'fulfilled', 'weakened'),
  mk('3', ['S'], 'unassessed'),
] as never;
const sources = [{ id: 'avt', parties: ['M', 'KD', 'SD'] }] as never;

describe('buildPartierRows', () => {
  const rows = buildPartierRows(term, promises, sources);
  it('groups by role and skips parties without promises', () => {
    expect(rows.map((r) => r.party)).toEqual(['M', 'KD', 'S']);
    expect(rolesPresent(rows)).toEqual(['government', 'opposition']);
  });
  it('counts promises, assessed and agreement outcomes', () => {
    const m = rows[0];
    expect(m.promiseCount).toBe(2);
    expect(m.assessed).toBe(1);
    expect(m.agreements[0].counts.included).toBe(1);
    expect(m.agreements[0].counts.weakened).toBe(1);
    expect(m.agreements[0].stands).toBe(true);
  });
  it('marks parties outside the agreement', () => {
    expect(rows[2].agreements[0].stands).toBe(false);
  });
  it('has no agreement cells without agreements', () => {
    const r = buildPartierRows({ ...(term as object), agreements: [] } as never, promises, sources);
    expect(r[0].agreements).toEqual([]);
  });
});
