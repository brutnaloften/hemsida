import { describe, expect, it } from 'vitest';
import {
  allocateProportionally,
  estimateContribution,
  getTaxYear,
  grundavdrag,
  jobbskatteavdrag,
  stateIncomeTax,
  vatInConsumption,
} from './personal';
import { DEFAULT_VAT_MIX } from './personal-params';

const p = getTaxYear(2026);
const by = (income: number, extra = {}) =>
  Object.fromEntries(
    estimateContribution({ grossSalary: income, ...extra }, 2026).stat.components.map((c) => [
      c.id,
      c.amount,
    ]),
  );

describe('grundavdrag (SKV 433 2026 worked examples)', () => {
  it('120 000 kr gives 37 400', () => expect(grundavdrag(120_000, p)).toBe(37_400));
  it('324 000 kr gives 31 600', () => expect(grundavdrag(324_000, p)).toBe(31_600));
  it('high income gives the minimum 17 400', () => expect(grundavdrag(900_000, p)).toBe(17_400));
  it('never exceeds income', () => expect(grundavdrag(10_000, p)).toBe(10_000));
});

describe('jobbskatteavdrag (SKV 433 2026 worked examples, kommunal rate 34 %)', () => {
  it('90 000 kr gives 11 976', () => expect(jobbskatteavdrag(90_000, 0.34, p)).toBe(11_976));
  it('240 000 kr gives 26 083', () => expect(jobbskatteavdrag(240_000, 0.34, p)).toBe(26_083));
  it('is constant-ish above 8,08 PBB and never negative', () => {
    expect(jobbskatteavdrag(900_000, 0.34, p)).toBe(jobbskatteavdrag(1_500_000, 0.34, p));
    expect(jobbskatteavdrag(0, 0.34, p)).toBe(0);
  });
});

describe('stateIncomeTax', () => {
  it('is zero at the 2026 brytpunkt (643 000 + 17 400)', () => {
    expect(stateIncomeTax(660_400, p)).toBe(0);
    expect(stateIncomeTax(300_000, p)).toBe(0);
  });
  it('is 20 % of the excess', () => {
    expect(stateIncomeTax(760_400, p)).toBeCloseTo(20_000);
  });
});

describe('vatInConsumption', () => {
  it('extracts 25 % moms as 20 % of the price', () => {
    const mix = { standard: 1, reduced12: 0, reduced6: 0, exempt: 0 };
    expect(vatInConsumption(1000, mix, p)).toBeCloseTo(200);
  });
  it('is zero for exempt spending and rejects bad mixes', () => {
    expect(vatInConsumption(1000, { standard: 0, reduced12: 0, reduced6: 0, exempt: 1 }, p)).toBe(
      0,
    );
    expect(() => vatInConsumption(1000, { ...DEFAULT_VAT_MIX, exempt: 0 }, p)).toThrow();
  });
});

describe('estimateContribution', () => {
  it('counts only the state part of arbetsgivaravgifter (31,42 - 10,21 %)', () => {
    expect(by(480_000)['arbetsgivaravgifter']).toBeCloseTo(480_000 * 0.2121);
  });
  it('has jobbskatteavdrag as a separate negative component', () => {
    const c = by(480_000);
    expect(c['jobbskatteavdrag']).toBeLessThan(0);
    expect(c['statlig-inkomstskatt']).toBe(0);
  });
  it('total is the sum of components and keeps kommunalskatt out', () => {
    const { stat } = estimateContribution({ grossSalary: 480_000 }, 2026);
    expect(stat.total).toBeCloseTo(stat.components.reduce((s, c) => s + c.amount, 0));
    expect(stat.components.map((c) => c.id)).not.toContain('kommunalskatt');
    expect(stat.memo.kommunalskatt).toBeGreaterThan(0);
    expect(stat.level).toBe('stat');
    expect(stat.components.every((c) => c.explanation.length > 0)).toBe(true);
  });
  it('reserves kommun and region keys without filling them', () => {
    const r = estimateContribution({ grossSalary: 480_000 }, 2026);
    expect(r.kommun).toBeUndefined();
    expect(r.region).toBeUndefined();
  });
  it('moms scales with consumption share', () => {
    expect(by(480_000, { consumptionShare: 1 })['moms']).toBeCloseTo(
      by(480_000, { consumptionShare: 0.5 })['moms'] * 2,
    );
  });
  it('falls back to the nearest year and flags it', () => {
    const a = estimateContribution({ grossSalary: 480_000 }, 2023).stat;
    expect(a.year).toBe(2023);
    expect(a.paramsYear).toBe(2026);
    expect(a.usedFallbackYear).toBe(true);
    expect(estimateContribution({ grossSalary: 1 }, 2026).stat.usedFallbackYear).toBe(false);
  });
  it('handles zero salary and validates input', () => {
    expect(estimateContribution({ grossSalary: 0 }, 2026).stat.total).toBe(0);
    expect(() => estimateContribution({ grossSalary: -1 })).toThrow();
    expect(() => estimateContribution({ grossSalary: 1, consumptionShare: 2 })).toThrow();
    expect(() => estimateContribution({ grossSalary: 1, kommunalskattesats: 2 })).toThrow();
  });
});

describe('allocateProportionally', () => {
  it('sums exactly to the rounded total', () => {
    const a = allocateProportionally(1000, [1, 1, 1]);
    expect(a.reduce((x, y) => x + y, 0)).toBe(1000);
    expect(Math.max(...a) - Math.min(...a)).toBeLessThanOrEqual(1);
  });
  it('is proportional and ignores non-positive weights', () => {
    expect(allocateProportionally(100, [3, 1, 0, -5])).toEqual([75, 25, 0, 0]);
  });
  it('returns zeros for empty or zero input', () => {
    expect(allocateProportionally(100, [])).toEqual([]);
    expect(allocateProportionally(100, [0, 0])).toEqual([0, 0]);
    expect(allocateProportionally(0, [1, 2])).toEqual([0, 0]);
  });
});
