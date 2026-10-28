import { describe, expect, it } from 'vitest';
import {
  activeAnslag,
  anslagByKod,
  anslagForUo,
  areas,
  assertSameYears,
  latestYear,
  meta,
  revenueTree,
  totalsForYear,
  totalsPerYear,
  uoUtfall,
  years,
} from '@/lib/budget/data';

describe('budget data', () => {
  it('covers 2006 to the latest year with 27 utgiftsområden', () => {
    expect(years[0]).toBe(2006);
    expect(latestYear).toBe(years[years.length - 1]);
    expect(areas.map((a) => a.nr)).toEqual(Array.from({ length: 27 }, (_, i) => i + 1));
  });

  it('reproduces the 2024 reconciliation in docs/budget-data.md', () => {
    const t = totalsForYear(2024);
    // Documented from unrounded data: 1 377 021.45 / 1 272 749.1 / -104 272.3 / UO sum 1 364 651.11.
    // Stored values are rounded to one decimal per row, so allow the accumulated rounding error.
    expect(Math.abs(t.utgifter - 1377021.45)).toBeLessThan(1);
    expect(Math.abs(t.inkomster - 1272749.1)).toBeLessThan(1);
    expect(Math.abs(t.saldo - -104272.3)).toBeLessThan(1);
    expect(Math.abs(t.uoSum - 1364651.11)).toBeLessThan(1);
    expect(Math.round(t.saldo / 1000)).toBe(-104);
  });

  it('tags revenue status from config and expenditure as final', () => {
    expect(totalsForYear(2023).revenueStatus).toBe('final');
    expect(totalsForYear(latestYear).revenueStatus).toBe('preliminary');
    expect(totalsForYear(latestYear).expenditureStatus).toBe('final');
    expect(meta.licence).toBe('CC0-1.0');
  });

  it('computes totals for every year', () => {
    const all = totalsPerYear();
    expect(all).toHaveLength(years.length);
    for (const t of all) expect(t.utgifter).toBeGreaterThan(0);
  });

  it('keys anslag on the full code including the suffix', () => {
    const active = anslagByKod('0501003');
    const old = anslagByKod('0501003 2024');
    expect(active).toBeDefined();
    expect(old).toBeDefined();
    expect(active!.namn).not.toBe(old!.namn);
    expect(active!.upphort).toBeNull();
    expect(old!.upphort).toBe(2024);
    expect(anslagByKod('0901011')?.beteckning).toBe('1:11');
  });

  it('lists active anslag for the latest year and anslag per UO', () => {
    expect(activeAnslag()).toHaveLength(490);
    expect(anslagForUo(9).every((a) => a.uo === 9)).toBe(true);
    expect(uoUtfall(9, 2024)).toBeGreaterThan(0);
  });

  it('builds a revenue tree whose type sums add up to total revenue', () => {
    const tree = revenueTree();
    const i = years.indexOf(2024);
    const sum = tree.reduce((s, typ) => s + typ.utfall[i], 0);
    expect(Math.abs(sum - totalsForYear(2024).inkomster)).toBeLessThan(0.5);
    // titles without a titelgrupp sit directly under their huvudgrupp
    const typ6000 = tree.find((t) => t.kod === '6000')!;
    expect(typ6000.children.some((h) => h.children.some((c) => c.children.length === 0))).toBe(
      true,
    );
  });

  it('rejects files whose year lists differ from meta', () => {
    expect(() => assertSameYears([2006, 2007], [2006, 2007], [2006, 2007])).not.toThrow();
    expect(() => assertSameYears([2006, 2007], [2006], [2006, 2007])).toThrow(/expenditure/);
    expect(() => assertSameYears([2006, 2007], [2006, 2007], [2007])).toThrow(/revenue/);
  });
});
