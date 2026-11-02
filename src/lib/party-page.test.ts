import { describe, expect, it } from 'vitest';
import {
  buildPartyModel,
  filterPartyRows,
  groupRows,
  limitGroups,
  type PartyPagePromise,
  type PartyRow,
  type PartySource,
} from '@/lib/party-page';

const src = (id: string, kind: string, parties: string[], shortTitle?: string): PartySource => ({
  id,
  title: `Long ${id}`,
  shortTitle,
  kind,
  parties,
  date: '2022-10-14',
  url: 'https://example.com',
  archive: 'https://example.com/a',
});

const sources = [
  src('man-m', 'manifesto', ['M']),
  src('man-s', 'manifesto', ['S']),
  src('pledge', 'speech', ['M']),
  src('deal', 'government_agreement', ['M', 'KD'], 'Avtalet'),
];

const p = (source: string, parties: string[], outcome?: string): PartyPagePromise =>
  ({
    source: { id: source },
    parties,
    verdict: { value: 'unassessed' },
    evidence: outcome ? [{ kind: 'agreement', source: 'deal', outcome, date: '2022-10-14' }] : [],
  }) as unknown as PartyPagePromise;

const promises = [
  p('man-m', ['M'], 'included'),
  p('man-m', ['M'], 'not_addressed'),
  p('man-m', ['M']),
  p('pledge', ['M']),
  p('deal', ['M', 'KD']),
  p('man-s', ['S']),
];

describe('buildPartyModel', () => {
  it('counts manifesto promises only, with pledges and agreement points apart', () => {
    const m = buildPartyModel({ agreements: ['deal'] }, 'M', sources, promises);
    expect(m.manifesto).toHaveLength(3);
    expect(m.other).toHaveLength(1);
    expect(m.manifestoSources.map((s) => s.id)).toEqual(['man-m']);
    expect(m.agreements).toHaveLength(1);
    expect(m.agreements[0]?.name).toBe('Avtalet');
    expect(m.agreements[0]?.total).toBe(2);
  });

  it('has no agreement when the party is not behind it', () => {
    expect(buildPartyModel({ agreements: ['deal'] }, 'S', sources, promises).agreements).toEqual(
      [],
    );
  });

  it('has no agreement when the term lists none', () => {
    const m = buildPartyModel({ agreements: [] }, 'M', sources, promises);
    expect(m.agreements).toEqual([]);
    // Without a listed agreement the agreement source is just another non-manifesto source.
    expect(m.other).toHaveLength(2);
  });
});

const row = (
  id: string,
  area: string,
  other = false,
  verdict: PartyRow['verdict'] = 'unassessed',
) => ({ id, title: id, area, href: id, verdict, other }) as PartyRow;

describe('rows', () => {
  const rows = [
    row('b', 'Energi'),
    row('a', 'Energi'),
    row('c', 'Kriminalpolitik', false, 'broken'),
    row('z', 'Energi', true),
  ];

  it('groups by area order with pledges last', () => {
    const g = groupRows(rows);
    expect(g.map((x) => x.area)).toEqual(['Kriminalpolitik', 'Energi', null]);
    expect(g[1]?.rows.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('filters', () => {
    const f = { q: '', verdicts: ['broken' as const], outcomes: [], area: '' };
    expect(filterPartyRows(rows, f).map((r) => r.id)).toEqual(['c']);
    expect(filterPartyRows(rows, { ...f, verdicts: [], q: 'B' }).map((r) => r.id)).toEqual(['b']);
  });

  it('limits across groups', () => {
    const l = limitGroups(groupRows(rows), 2);
    expect(l.map((g) => g.rows.length)).toEqual([1, 1]);
  });
});
