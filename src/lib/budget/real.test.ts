import { describe, expect, it } from 'vitest';
import macro from '@/data/budget/macro.json';
import { kpiFactor, toFixedPrices } from '@/lib/budget/real';

const kpi = macro.kpi.values;

describe('kpiFactor', () => {
  it('matches the factor in docs/budget-data.md (2024 to 2025 prices is 1,0068)', () => {
    expect(kpiFactor(kpi, 2024, 2025)).toBeCloseTo(417.98 / 415.15, 10);
    expect(kpiFactor(kpi, 2024, 2025).toFixed(4)).toBe('1.0068');
  });

  it('is 1 for the same year and inverts when the direction does', () => {
    expect(kpiFactor(kpi, 2020, 2020)).toBe(1);
    expect(kpiFactor(kpi, 2010, 2025) * kpiFactor(kpi, 2025, 2010)).toBeCloseTo(1, 12);
  });

  it('throws for a year without KPI', () => {
    expect(() => kpiFactor(kpi, 1990, 2025)).toThrow();
  });
});

describe('toFixedPrices', () => {
  it('scales an amount to the later price level', () => {
    expect(toFixedPrices(1000, kpi, 2024, 2025)).toBeCloseTo(1006.8, 1);
  });
  it('keeps null', () => {
    expect(toFixedPrices(null, kpi, 2024, 2025)).toBeNull();
  });
});
