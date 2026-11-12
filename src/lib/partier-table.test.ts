import { describe, expect, it } from 'vitest';
import { buildPartierRows, rolesPresent } from './partier-table';

const term = {
  roles: { S: 'opposition', M: 'government', SD: 'support', KD: 'government' },
  agreements: ['avt'],
} as never;
const mk = (
  id: string,
  parties: string[],
  verdict: string,
  outcome?: string,
  src = 'valmanifest-2022-m',
  agr = 'avt',
) => ({
  id,
  title: id,
  area: 'a',
  parties,
  source: { id: src },
  verdict: { value: verdict },
  evidence: outcome
    ? [{ kind: 'agreement', outcome, date: '2022-10-14', promises: [], source: agr }]
    : [],
});
const promises = [
  mk('1', ['M'], 'unassessed', 'included'),
  mk('2', ['M'], 'fulfilled', 'weakened'),
  mk('3', ['S'], 'unassessed', undefined, 'valmanifest-2022-s'),
  mk('tido-1', ['M', 'KD', 'SD'], 'in_progress', 'included', 'tidoavtalet'),
  mk('4', ['M'], 'unassessed', 'contradicted', 'valmanifest-2022-m', 'other'),
] as never;
const sources = [
  { id: 'avt', kind: 'government_agreement', parties: ['M', 'KD', 'SD'] },
  { id: 'valmanifest-2022-m', kind: 'manifesto', parties: ['M'] },
  { id: 'valmanifest-2022-s', kind: 'manifesto', parties: ['S'] },
  { id: 'tidoavtalet', kind: 'government_agreement', parties: ['M'] },
] as never;

describe('buildPartierRows', () => {
  const rows = buildPartierRows(term, promises, sources);
  it('groups by role and skips parties without promises', () => {
    expect(rows.map((r) => r.party)).toEqual(['M', 'KD', 'SD', 'S']);
    expect(rolesPresent(rows)).toEqual(['government', 'support', 'opposition']);
  });
  it('keeps parties without manifesto promises, with zero count', () => {
    expect(rows.find((r) => r.party === 'KD')?.promiseCount).toBe(0);
    expect(rows.find((r) => r.party === 'SD')?.promiseCount).toBe(0);
  });
  it('counts promises, assessed and agreement outcomes', () => {
    const m = rows[0];
    expect(m.promiseCount).toBe(3); // excludes tido-1
    expect(m.assessed).toBe(1);
    expect(m.agreements[0].counts.included).toBe(1);
    expect(m.agreements[0].counts.weakened).toBe(1);
    // the contradicted entry belongs to another agreement source
    expect(m.agreements[0].counts.contradicted).toBe(0);
    expect(m.agreements[0].stands).toBe(true);
  });
  it('counts the agreement own points and how many are assessed', () => {
    const m = rows[0].agreements[0];
    expect(m).toMatchObject({ points: 0, pointsAssessed: 0 }); // 'avt' has no points of its own
    const t = buildPartierRows(
      { ...(term as object), agreements: ['tidoavtalet'] } as never,
      promises,
      sources,
    );
    expect(t[0].agreements[0]).toMatchObject({ points: 1, pointsAssessed: 1 });
    expect(t.find((r) => r.party === 'S')?.agreements[0]).toMatchObject({ points: 0 });
  });
  it('marks parties outside the agreement', () => {
    expect(rows[3].agreements[0].stands).toBe(false);
  });
  it('has no agreement cells without agreements', () => {
    const r = buildPartierRows({ ...(term as object), agreements: [] } as never, promises, sources);
    expect(r[0].agreements).toEqual([]);
  });
});
