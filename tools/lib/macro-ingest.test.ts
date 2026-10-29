import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { macroSchema } from './schema.ts';
import { buildMacro, parseJsonStat2Years, serializeMacro, tableUrl } from './macro-ingest.ts';

/** Hand-trimmed TAB4352 response shape (2005-2008). 2005 and 2006 are real SCB values; 2007 and 2008 are made up. */
const kpiFixture = {
  version: '2.0',
  class: 'dataset',
  id: ['ContentsCode', 'Tid'],
  size: [1, 4],
  dimension: {
    ContentsCode: { category: { index: { '000000KL': 0 } } },
    Tid: { category: { index: { '2005': 0, '2006': 1, '2007': 2, '2008': 3 } } },
  },
  value: [280.4, 284.22, 289.0, 297.0],
};

/** Hand-trimmed TAB3610 response shape (2005-2008). 2006 is a real SCB value; the rest are made up, and 2008 is null on purpose. */
const bnpFixture = {
  version: '2.0',
  class: 'dataset',
  id: ['Anvandningstyp', 'ContentsCode', 'Tid'],
  size: [1, 1, 4],
  dimension: {
    Anvandningstyp: { category: { index: { BNPM: 0 } } },
    ContentsCode: { category: { index: { '000000RQ': 0 } } },
    Tid: { category: { index: { '2005': 0, '2006': 1, '2007': 2, '2008': 3 } } },
  },
  value: [2900000, 3117499, 3300000, null],
};

describe('parseJsonStat2Years', () => {
  it('maps year labels to values', () => {
    const m = parseJsonStat2Years(kpiFixture);
    expect(m.get(2006)).toBe(284.22);
    expect(m.size).toBe(4);
  });

  it('maps missing values to null', () => {
    expect(parseJsonStat2Years(bnpFixture).get(2008)).toBeNull();
  });

  it('rejects datasets with an unselected extra dimension', () => {
    expect(() => parseJsonStat2Years({ ...bnpFixture, size: [2, 1, 4] })).toThrow(/Anvandningstyp/);
  });

  it('rejects non json-stat2 input', () => {
    expect(() => parseJsonStat2Years({ error: 'x' })).toThrow();
  });
});

describe('buildMacro', () => {
  const kpi = parseJsonStat2Years(kpiFixture);
  const bnp = parseJsonStat2Years(bnpFixture);

  it('starts in 2006, ends at the latest KPI year, and nulls the missing BNP year with a note', () => {
    const m = buildMacro({ kpi, bnp, today: '2026-10-28' });
    expect(m.years).toEqual([2006, 2007, 2008]);
    expect(m.kpi.values['2006']).toBe(284.22);
    expect(m.bnp.values['2008']).toBeNull();
    expect(m.bnp.note).toContain('2008');
  });

  it('keeps fetched_at when the values are unchanged, and bumps it when they change', () => {
    const first = buildMacro({ kpi, bnp, today: '2026-10-28' });
    const again = buildMacro({ kpi, bnp, today: '2026-11-30', previous: first });
    expect(serializeMacro(again)).toBe(serializeMacro(first));

    const revised = new Map(bnp).set(2007, 3300001);
    const changed = buildMacro({ kpi, bnp: revised, today: '2026-11-30', previous: first });
    expect(changed.bnp.fetched_at).toBe('2026-11-30');
    expect(changed.kpi.fetched_at).toBe('2026-10-28');
  });

  it('throws when a KPI year is missing', () => {
    const holes = new Map(kpi).set(2007, null);
    expect(() => buildMacro({ kpi: holes, bnp, today: '2026-10-28' })).toThrow(/2007/);
  });
});

describe('serializeMacro', () => {
  it('reproduces the committed macro.json byte for byte', () => {
    const path = new URL('../../src/data/budget/macro.json', import.meta.url);
    const text = readFileSync(path, 'utf8');
    expect(serializeMacro(macroSchema.parse(JSON.parse(text)))).toBe(text);
  });
});

describe('tableUrl', () => {
  it('builds a v2 data url', () => {
    expect(tableUrl('TAB4352', 'lang=sv')).toBe(
      'https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB4352/data?lang=sv',
    );
  });
});
