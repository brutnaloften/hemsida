import { describe, expect, it } from 'vitest';
import {
  buildSeries,
  dataUrl,
  latestYear,
  parseConfig,
  parseJsonStat2,
  periodKey,
  serializeSeries,
  seriesConfigSchema,
} from './statistics-ingest.ts';

const base = {
  id: 'scb-test',
  source: 'scb',
  table: 'TAB1',
  selection: { ContentsCode: 'X', Kon: '1+2' },
  label: 'Test',
  unit: 'antal',
  frequency: 'year',
};
const cfg = (over: object = {}) => seriesConfigSchema.parse({ ...base, ...over });

/** Two house types x three years; the last dimension (Tid) varies fastest. */
const grid = {
  id: ['Hustyp', 'Tid'],
  size: [2, 3],
  dimension: { Tid: { category: { index: { '2021': 0, '2022': 1, '2023': 2 } } } },
  value: [1, 2, 3, 10, 20, null],
};

describe('parseJsonStat2', () => {
  it('sums over the other dimensions per period and cuts at from', () => {
    const { values, missing } = parseJsonStat2(grid, { sum: true, from: '2022' });
    expect([...values]).toEqual([['2022', 22]]);
    expect(missing).toEqual(['2023']);
  });

  it('rejects a multi-category dimension without sum', () => {
    expect(() => parseJsonStat2(grid, { sum: false, from: '2018' })).toThrow(/Hustyp/);
  });

  it('reads a single series', () => {
    const raw = {
      id: ['ContentsCode', 'Tid'],
      size: [1, 2],
      dimension: { Tid: { category: { index: { '2024': 0, '2025': 1 } } } },
      value: [0.1, 0.2],
    };
    const { values } = parseJsonStat2(raw, { sum: false, from: '2018' });
    expect(values.get('2025')).toBe(0.2);
  });

  it('sums floats without noise', () => {
    const raw = {
      id: ['A', 'Tid'],
      size: [2, 1],
      dimension: { Tid: { category: { index: { '2024': 0 } } } },
      value: [0.1, 0.2],
    };
    expect(parseJsonStat2(raw, { sum: true, from: '2018' }).values.get('2024')).toBe(0.3);
  });

  it('rejects non-json-stat input and a size mismatch', () => {
    expect(() => parseJsonStat2({}, { sum: false, from: '2018' })).toThrow(/json-stat2/);
    expect(() => parseJsonStat2({ ...grid, value: [1] }, { sum: true, from: '2018' })).toThrow(
      /expected 6/,
    );
  });
});

describe('periodKey', () => {
  it('maps SCB labels to schema keys', () => {
    expect(periodKey('2022')).toBe('2022');
    expect(periodKey('2022K3')).toBe('2022-Q3');
    expect(periodKey('2022M03')).toBe('2022-03');
  });
});

describe('dataUrl', () => {
  it('sorts parameters, encodes codes and asks for every period', () => {
    const url = dataUrl(
      cfg({ selection: { Kon: '1+2', ContentsCode: 'X', A: 'FLERBO,SMÅHUS' }, sum: true }),
    );
    expect(url).toBe(
      'https://statistikdatabasen.scb.se/api/v2/tables/TAB1/data?lang=sv&outputFormat=json-stat2&valueCodes[A]=FLERBO,SM%C3%85HUS&valueCodes[ContentsCode]=X&valueCodes[Kon]=1%2B2&valueCodes[Tid]=*',
    );
  });
});

describe('parseConfig', () => {
  const ok = { term: '2022-2026', series: [base] };
  it('accepts a valid config', () => {
    expect(parseConfig(ok).series).toHaveLength(1);
  });
  it('requires sum for a multi-code dimension and forbids Tid and wildcards', () => {
    const bad = (over: object) => () => parseConfig({ ...ok, series: [{ ...base, ...over }] });
    expect(bad({ selection: { ContentsCode: 'X', A: 'a,b' } })).toThrow(/sum: true/);
    expect(bad({ sum: true })).toThrow(/without a multi-code/);
    expect(bad({ selection: { ContentsCode: 'X', Tid: '2022' } })).toThrow(/Tid/);
    expect(bad({ selection: { ContentsCode: 'X', A: '*' } })).toThrow(/wildcards/);
  });
  it('rejects duplicate ids', () => {
    expect(() => parseConfig({ ...ok, series: [base, base] })).toThrow(/duplicate/);
  });
});

describe('buildSeries', () => {
  const values = new Map([
    ['2023', 2],
    ['2022', 1],
  ]);
  it('sorts periods and validates against the series schema', () => {
    const s = buildSeries({ config: cfg(), values, today: '2026-11-24' });
    expect(Object.keys(s.values)).toEqual(['2022', '2023']);
    expect(s.fetched_at).toBe('2026-11-24');
  });
  it('keeps fetched_at when unchanged, so a rerun is byte-identical', () => {
    const first = buildSeries({ config: cfg(), values, today: '2026-11-24' });
    const again = buildSeries({ config: cfg(), values, today: '2026-12-01', previous: first });
    expect(serializeSeries(again)).toBe(serializeSeries(first));
    const changed = buildSeries({
      config: cfg(),
      values: new Map([['2022', 5]]),
      today: '2026-12-01',
      previous: first,
    });
    expect(changed.fetched_at).toBe('2026-12-01');
  });
  it('requires priceBasis for a price unit (schema rule)', () => {
    expect(() =>
      buildSeries({ config: cfg({ unit: 'kr/liter' }), values, today: '2026-11-24' }),
    ).toThrow();
  });
  it('rejects a period that does not match the frequency', () => {
    expect(() =>
      buildSeries({ config: cfg(), values: new Map([['2022-Q1', 1]]), today: '2026-11-24' }),
    ).toThrow();
  });
});

describe('latestYear', () => {
  it('is the newest year over all series', () => {
    const a = buildSeries({ config: cfg(), values: new Map([['2024', 1]]), today: '2026-11-24' });
    const b = buildSeries({
      config: cfg({ id: 'scb-b' }),
      values: new Map([['2025', 1]]),
      today: '2026-11-24',
    });
    expect(latestYear([a, b])).toBe('2025');
  });
});
