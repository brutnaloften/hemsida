import { describe, expect, it } from 'vitest';
import {
  allocateProportionally,
  estimatePersonalContribution,
  getTaxYear,
  stateIncomeTax,
  vatInConsumption,
} from './personal';
import { DEFAULT_VAT_MIX } from './personal-params';

const p = getTaxYear(2026);

describe('stateIncomeTax', () => {
  it('is zero at the 2026 brytpunkt (skiktgräns + grundavdrag = 660 400)', () => {
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

describe('estimatePersonalContribution', () => {
  it('computes components for a 40 000 kr/month salary', () => {
    const r = estimatePersonalContribution({ grossSalary: 480_000 });
    const by = Object.fromEntries(r.components.map((c) => [c.id, c.amount]));
    expect(by['statlig-inkomstskatt']).toBe(0);
    expect(by['arbetsgivaravgifter']).toBeCloseTo(480_000 * 0.3142);
    expect(by['moms']).toBeGreaterThan(0);
    expect(r.stateTotal).toBeCloseTo(by['arbetsgivaravgifter'] + by['moms']);
  });
  it('keeps kommunalskatt out of the state total', () => {
    const r = estimatePersonalContribution({ grossSalary: 480_000 });
    expect(r.components.every((c) => c.level === 'stat')).toBe(true);
    expect(r.otherLevels[0]).toMatchObject({ id: 'kommunalskatt', level: 'kommun' });
    expect(r.otherLevels[0].amount).toBeCloseTo((480_000 - 17_400) * 0.3238);
  });
  it('moms scales with consumption share', () => {
    const lo = estimatePersonalContribution({ grossSalary: 480_000, consumptionShare: 0.5 });
    const hi = estimatePersonalContribution({ grossSalary: 480_000, consumptionShare: 1 });
    expect(hi.components[2].amount).toBeCloseTo(lo.components[2].amount * 2);
  });
  it('handles zero salary and validates input', () => {
    expect(estimatePersonalContribution({ grossSalary: 0 }).stateTotal).toBe(0);
    expect(() => estimatePersonalContribution({ grossSalary: -1 })).toThrow();
    expect(() => estimatePersonalContribution({ grossSalary: 1, consumptionShare: 2 })).toThrow();
    expect(() => estimatePersonalContribution({ grossSalary: 1, year: 1999 })).toThrow();
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
