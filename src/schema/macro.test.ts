import { describe, expect, it } from 'vitest';
import macroJson from '../data/budget/macro.json';
import { macroSchema } from './macro.ts';

const valid = {
  years: [2023, 2024],
  kpi: {
    source: 'TAB4352',
    fetched_at: '2026-10-28',
    base: '1980=100',
    values: { '2023': 403.7, '2024': 415.15 },
  },
  bnp: {
    source: 'TAB3610',
    fetched_at: '2026-10-28',
    unit: 'mn kr',
    values: { '2023': 6143187, '2024': 6443039 },
  },
};

describe('macroSchema', () => {
  it('accepts a valid file', () => {
    expect(macroSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a year missing from a series', () => {
    const bad = structuredClone(valid);
    delete (bad.kpi.values as Record<string, number>)['2024'];
    expect(macroSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects non-contiguous years', () => {
    expect(macroSchema.safeParse({ ...valid, years: [2022, 2024] }).success).toBe(false);
  });

  it('requires a note for null BNP', () => {
    const bad = structuredClone(valid) as {
      bnp: { values: Record<string, number | null>; note?: string };
    };
    bad.bnp.values['2024'] = null;
    expect(macroSchema.safeParse(bad).success).toBe(false);
    bad.bnp.note = 'Not published yet';
    expect(macroSchema.safeParse(bad).success).toBe(true);
  });
});

describe('committed macro.json', () => {
  const macro = macroSchema.parse(macroJson);

  it('starts in 2006 and covers the ESV years 2006-2025', () => {
    expect(macro.years[0]).toBe(2006);
    expect(macro.years.at(-1)).toBeGreaterThanOrEqual(2025);
  });

  it('matches known SCB values', () => {
    expect(macro.kpi.values['2024']).toBe(415.15);
    expect(macro.bnp.values['2024']).toBe(6443039);
  });
});
