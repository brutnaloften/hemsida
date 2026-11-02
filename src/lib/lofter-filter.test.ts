import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTERS,
  hasActiveFilters,
  matchesFilters,
  parseFilters,
  serializeFilters,
  toggleValue,
} from './lofter-filter';

describe('lofter filters in the URL', () => {
  it('round-trips', () => {
    const f = {
      q: 'skatt',
      parties: ['M', 'KD'],
      area: 'Energi',
      verdicts: ['fulfilled' as const],
      outcomes: ['included' as const],
    };
    const parsed = parseFilters(serializeFilters(f));
    expect(parsed.q).toBe('skatt');
    expect(parsed.parties.sort()).toEqual(['KD', 'M']);
    expect(parsed.area).toBe('Energi');
    expect(parsed.verdicts).toEqual(['fulfilled']);
    expect(parsed.outcomes).toEqual(['included']);
  });

  it('serialises empty state to an empty string', () => {
    expect(serializeFilters(EMPTY_FILTERS)).toBe('');
  });

  it('drops unknown values', () => {
    const f = parseFilters('?parti=XX&omrade=Nope&bedomning=bogus&parti=M');
    expect(f.parties).toEqual(['M']);
    expect(f.area).toBe('');
    expect(f.verdicts).toEqual([]);
  });

  it('reads ?q= from the start page', () => {
    expect(parseFilters('?q=lag').q).toBe('lag');
  });
});

describe('matchesFilters', () => {
  const row = { parties: ['M', 'KD'], area: 'Energi', verdict: 'unassessed' as const };
  it('matches with no filters', () => {
    expect(matchesFilters(row, EMPTY_FILTERS)).toBe(true);
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
  });
  it('ORs within a group and ANDs across groups', () => {
    expect(matchesFilters(row, { ...EMPTY_FILTERS, parties: ['S', 'KD'] })).toBe(true);
    expect(
      matchesFilters(row, { ...EMPTY_FILTERS, parties: ['KD'], area: 'Klimat och miljö' }),
    ).toBe(false);
  });
  it('requires an outcome when filtering on outcome', () => {
    expect(matchesFilters(row, { ...EMPTY_FILTERS, outcomes: ['included'] })).toBe(false);
    expect(
      matchesFilters({ ...row, outcome: 'included' }, { ...EMPTY_FILTERS, outcomes: ['included'] }),
    ).toBe(true);
  });
});

describe('toggleValue', () => {
  it('adds and removes', () => {
    expect(toggleValue(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleValue(['a', 'b'], 'a')).toEqual(['b']);
  });
});
