import { describe, expect, it } from 'vitest';
import {
  dataStatusLabel,
  defaultTerm,
  partyRole,
  sortTerms,
  termOfFilePath,
  termPagePath,
} from './terms';

describe('termOfFilePath', () => {
  it('reads the term from a promise file path', () => {
    expect(termOfFilePath('src/data/2022-2026/promises/x.json')).toBe('2022-2026');
    expect(termOfFilePath('src/data/sources/x.json')).toBeUndefined();
  });
});

describe('defaultTerm', () => {
  it('is the latest term with data', () => {
    expect(
      defaultTerm([
        { id: '2026-2030', promiseCount: 0 },
        { id: '2022-2026', promiseCount: 5 },
      ]),
    ).toBe('2022-2026');
  });
  it('falls back to the latest term when none has data', () => {
    expect(defaultTerm([{ id: '2022-2026', promiseCount: 0 }])).toBe('2022-2026');
  });
  it('throws without terms', () => {
    expect(() => defaultTerm([])).toThrow();
  });
});

describe('labels and paths', () => {
  it('labels data status', () => {
    expect(dataStatusLabel({ id: 'a', promiseCount: 1 })).toBe('Löften insamlade');
    expect(dataStatusLabel({ id: 'a', promiseCount: 0 })).toBe('Insamling pågår');
  });
  it('builds term-scoped paths', () => {
    expect(termPagePath('start', '2022-2026')).toBe('2022-2026/');
    expect(termPagePath('partier', '2022-2026')).toBe('2022-2026/partier');
    expect(termPagePath('party', '2022-2026', 'M')).toBe('2022-2026/partier/m');
    expect(termPagePath('lofter', '2022-2026')).toBe('2022-2026/lofter');
    expect(termPagePath('agreement', '2022-2026', 'tidoavtalet')).toBe(
      '2022-2026/overenskommelse/tidoavtalet',
    );
  });
  it('sorts terms and reads roles', () => {
    expect(sortTerms([{ id: '2026-2030' }, { id: '2022-2026' }]).map((t) => t.id)).toEqual([
      '2022-2026',
      '2026-2030',
    ]);
    expect(partyRole({ roles: { M: 'government' } as never }, 'M')).toBe('government');
  });
});
