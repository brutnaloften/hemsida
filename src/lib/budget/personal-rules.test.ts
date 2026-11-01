import { describe, expect, it } from 'vitest';
import {
  allocateProportionally,
  estimateContribution,
  forvarvsinkomstReduction,
  getTaxYear,
  pensionFee,
  vatInConsumption,
  vatMixFromEffectiveRate,
} from './personal';

const p = getTaxYear(2026);
const by = (income: number) =>
  Object.fromEntries(
    estimateContribution({ grossSalary: income }, 2026).stat.components.map((c) => [
      c.id,
      c.amount,
    ]),
  );

describe('default path at 480 000 kr (hand-computed from SKV 433 2026)', () => {
  // GA 17 400; JSA = floor((3,027 PBB 179 198,40 - 17 400) * 0,3238) = 52 390;
  // pension fee 7 % = 33 600 (fully offset); förvärvsinkomst reduction capped 1 500;
  // arbetsgivaravgifter 21,21 % = 101 808; no statlig skatt (taxable 462 600 < 643 000).
  const c = by(480_000);
  it('matches independent values', () => {
    expect(c['jobbskatteavdrag']).toBe(-52_390);
    expect(c['skattereduktion-pensionsavgift']).toBe(-33_600);
    expect(c['skattereduktion-forvarvsinkomst']).toBe(-1_500);
    expect(c['arbetsgivaravgifter']).toBeCloseTo(101_808);
    expect(c['statlig-inkomstskatt']).toBe(0);
  });
  it('moms is about 11,4 % of consumption (default mix)', () => {
    // disposable 480 000 - 149 789,88 + 52 389 + 1 500 = 384 100,12; x 0,85 x 0,11385
    expect(c['moms']).toBeCloseTo(37_170, -1);
  });
  it('total is about 51 500', () => {
    expect(estimateContribution({ grossSalary: 480_000 }, 2026).stat.total).toBeCloseTo(51_489, -1);
  });
});

describe('pension fee and förvärvsinkomst reduction', () => {
  it('matches SKV 433 examples and bounds', () => {
    expect(pensionFee(181_200, p)).toBe(12_700);
    expect(pensionFee(10_000, p)).toBe(0);
    expect(pensionFee(2_000_000, p)).toBe(47_100);
    expect(forvarvsinkomstReduction(200_000, p)).toBe(1_200);
    expect(forvarvsinkomstReduction(400_000, p)).toBe(1_500);
    expect(forvarvsinkomstReduction(30_000, p)).toBe(0);
  });
});

describe('low incomes and negative totals', () => {
  it('reductions never push the total below zero in 2026, and the total is the sum', () => {
    for (let g = 0; g <= 1_000_000; g += 5_000) {
      const { stat } = estimateContribution({ grossSalary: g, consumptionShare: 0 }, 2026);
      expect(stat.total).toBeGreaterThanOrEqual(0);
      expect(stat.total).toBeCloseTo(stat.components.reduce((s, x) => s + x.amount, 0));
    }
  });
  it('reductions are capped by the tax available and low salaries stay sane', () => {
    const c = by(30_000);
    expect(-c['jobbskatteavdrag'] - c['skattereduktion-pensionsavgift']).toBeLessThanOrEqual(
      30_000 * 0.3238,
    );
  });
  it('allocateProportionally keeps the sign and sums exactly', () => {
    const a = allocateProportionally(-1000, [1, 1, 1]);
    expect(a.reduce((x, y) => x + y, 0)).toBe(-1000);
    expect(a.every((x) => x <= 0)).toBe(true);
    expect(allocateProportionally(-100, [3, 1, 0])).toEqual([-75, -25, 0]);
  });
});

describe('vat helpers', () => {
  it('rejects negative shares that still sum to 1', () => {
    expect(() =>
      vatInConsumption(1000, { standard: 1.5, reduced12: -0.5, reduced6: 0, exempt: 0 }, p),
    ).toThrow();
  });
  it('vatMixFromEffectiveRate reproduces the requested average', () => {
    const mix = vatMixFromEffectiveRate(0.1);
    expect(vatInConsumption(1000, mix, p)).toBeCloseTo(100);
    expect(() => vatMixFromEffectiveRate(0.25)).toThrow();
  });
});
