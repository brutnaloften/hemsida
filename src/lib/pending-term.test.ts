import { describe, expect, it } from 'vitest';
import { buildPartierRows } from './partier-table';
import { buildStartModel } from './start-page';
import { termParties } from './terms';

// A term whose government is not formed yet: no roles, no agreements.
const pending = { id: '2026-2030', roles: {}, rolesPending: true, agreements: [] } as never;

const mk = (id: string, parties: string[]) =>
  ({
    id,
    title: id,
    area: 'a',
    parties,
    source: { id: `valmanifest-2026-${parties[0]?.toLowerCase()}` },
    verdict: { value: 'unassessed' },
    evidence: [],
  }) as never;
const promises = [mk('1', ['M']), mk('2', ['S']), mk('3', ['S'])];
const sources = [
  { id: 'valmanifest-2026-m', kind: 'manifesto', parties: ['M'] },
  { id: 'valmanifest-2026-s', kind: 'manifesto', parties: ['S'] },
] as never;

describe('termParties', () => {
  it('uses the promises, in party order and without roles, while roles are pending', () => {
    expect(termParties(pending, promises)).toEqual([
      { party: 'S', role: undefined },
      { party: 'M', role: undefined },
    ]);
  });

  it('is empty for a pending term without promises', () => {
    expect(termParties(pending, [])).toEqual([]);
  });

  it('uses the term record once roles are known', () => {
    const t = { roles: { M: 'government', S: 'opposition' }, rolesPending: false } as never;
    expect(termParties(t, [])).toEqual([
      { party: 'M', role: 'government' },
      { party: 'S', role: 'opposition' },
    ]);
  });
});

describe('Partier rows for a pending term', () => {
  it('has one role-less row per party named by the promises', () => {
    const rows = buildPartierRows(pending, promises, sources);
    expect(rows.map((r) => [r.party, r.role, r.promiseCount])).toEqual([
      ['S', undefined, 2],
      ['M', undefined, 1],
    ]);
  });

  it('has no rows without promises', () => {
    expect(buildPartierRows(pending, [], sources)).toEqual([]);
  });
});

describe('Start model for a pending term', () => {
  it('lists the parties in one role-less group and no government groups', () => {
    const m = buildStartModel(pending, sources as never, promises as never);
    expect(m.rolesPending).toBe(true);
    expect(m.keyNumbers.parties).toBe(2);
    expect(m.roleGroups).toEqual([]);
    expect(m.cardGroups).toHaveLength(1);
    expect(m.cardGroups[0]?.role).toBeUndefined();
    expect(m.cardGroups[0]?.cards.map((c) => [c.party, c.role, c.promises])).toEqual([
      ['S', undefined, 2],
      ['M', undefined, 1],
    ]);
  });

  it('has zero parties and no cards without promises', () => {
    const m = buildStartModel(pending, [], []);
    expect(m.keyNumbers.parties).toBe(0);
    expect(m.cardGroups).toEqual([]);
    expect(m.roleGroups).toEqual([]);
  });
});
