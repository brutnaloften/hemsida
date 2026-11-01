import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INPUTS,
  estimateFor,
  fallbackNotice,
  formatPart,
  formatTotal,
  krWords,
  parseMonthlySalary,
  revenuePartOf,
  partOf,
  perPeriod,
  periodLabel,
  salaryNavKey,
} from './salary-view';

const NBSP = ' ';

describe('parseMonthlySalary', () => {
  it('accepts spaces and plain digits', () => {
    expect(parseMonthlySalary('35 000')).toBe(35_000);
    expect(parseMonthlySalary('35000')).toBe(35_000);
    expect(parseMonthlySalary(`35${NBSP}000`)).toBe(35_000);
    expect(parseMonthlySalary('35 000,50')).toBe(35_000.5);
  });
  it('rejects empty, negative, text and absurd values', () => {
    for (const bad of ['', '  ', '-5', 'abc', '1e5', '99999999999'])
      expect(parseMonthlySalary(bad)).toBeNull();
  });
});

describe('estimateFor', () => {
  it('is null without a valid salary', () => {
    expect(estimateFor({ ...DEFAULT_INPUTS, monthly: '' }, 2026)).toBeNull();
  });
  it('matches estimateContribution at the default assumptions (40 000 kr/month)', () => {
    const e = estimateFor({ ...DEFAULT_INPUTS, monthly: '40 000' }, 2026);
    expect(e?.total).toBeCloseTo(51_489, -1);
    expect(e?.invalid).toEqual({ consumption: false, vat: false });
  });
  it('responds to edited assumptions', () => {
    const base = estimateFor({ ...DEFAULT_INPUTS, monthly: '40 000' }, 2026)!.total;
    const none = estimateFor({ ...DEFAULT_INPUTS, monthly: '40 000', consumption: '0' }, 2026)!;
    expect(none.total).toBeLessThan(base);
    const highVat = estimateFor({ ...DEFAULT_INPUTS, monthly: '40 000', vat: '18' }, 2026)!;
    expect(highVat.total).toBeGreaterThan(base);
  });
  it('falls back to defaults for out-of-range assumptions and says so', () => {
    const base = estimateFor({ ...DEFAULT_INPUTS, monthly: '40 000' }, 2026)!;
    const bad = estimateFor(
      { ...DEFAULT_INPUTS, monthly: '40 000', consumption: '150', vat: '30' },
      2026,
    )!;
    expect(bad.invalid).toEqual({ consumption: true, vat: true });
    expect(bad.total).toBeCloseTo(base.total, 6);
  });
  it('uses the nearest year and exposes the fallback notice', () => {
    const e = estimateFor({ ...DEFAULT_INPUTS, monthly: '35 000' }, 2019)!;
    expect(e.breakdown.usedFallbackYear).toBe(true);
    expect(fallbackNotice(e.breakdown)).toBe(
      `Skatteregler för 2019 saknas, uppskattningen använder ${e.breakdown.paramsYear} års regler.`,
    );
    expect(
      fallbackNotice(estimateFor({ ...DEFAULT_INPUTS, monthly: '35 000' }, 2026)!.breakdown),
    ).toBeNull();
  });
  it('the whole range up to the maximum salary gives finite numbers', () => {
    for (const m of ['0', '1', '63 000', '1000000']) {
      const e = estimateFor({ ...DEFAULT_INPUTS, monthly: m }, 2026)!;
      expect(Number.isFinite(e.total)).toBe(true);
    }
  });
});

describe('rounding', () => {
  it('rounds the total to 100 kr', () => {
    expect(formatTotal(9_849)).toBe(`9${NBSP}800${NBSP}kr`);
    expect(formatTotal(9_851)).toBe(`9${NBSP}900${NBSP}kr`);
  });
  it('rounds parts to 10 kr with ≈ and shows < 10 kr below that', () => {
    expect(formatPart(1_234)).toBe(`≈${NBSP}1${NBSP}230${NBSP}kr`);
    expect(formatPart(1_236)).toBe(`≈${NBSP}1${NBSP}240${NBSP}kr`);
    expect(formatPart(4)).toBe(`<${NBSP}10${NBSP}kr`);
    expect(formatPart(0)).toBe(`0${NBSP}kr`);
  });
  it('speaks the rounded amount for screen readers', () => {
    expect(krWords(1_234)).toBe(`ungefär 1${NBSP}230 kronor`);
    expect(krWords(3)).toBe('mindre än 10 kronor');
  });
  it('partOf scales the total by the box share of the side', () => {
    expect(partOf(10_000, 250, 1_000)).toBe(2_500);
    expect(partOf(10_000, 250, 0)).toBe(0);
  });
});

describe('revenuePartOf', () => {
  const b = estimateFor({ ...DEFAULT_INPUTS, monthly: '40000' }, 2026)!.breakdown;
  const amount = (id: string) => b.components.find((c) => c.id === id)!.amount;

  it('maps the covered revenue nodes to the panel breakdown', () => {
    expect(revenuePartOf(b, 'rev:skatter')).toBeCloseTo(b.total);
    expect(revenuePartOf(b, 'rev:1200')).toBeCloseTo(amount('arbetsgivaravgifter'));
    expect(revenuePartOf(b, 'rev:1400')).toBeCloseTo(amount('moms'));
    expect(revenuePartOf(b, 'rev:1100')).toBeCloseTo(
      amount('statlig-inkomstskatt') +
        amount('jobbskatteavdrag') +
        amount('skattereduktion-pensionsavgift') +
        amount('skattereduktion-forvarvsinkomst'),
    );
  });
  it('the three boxes add up to the total', () => {
    const sum = ['rev:1100', 'rev:1200', 'rev:1400'].reduce(
      (s, id) => s + revenuePartOf(b, id)!,
      0,
    );
    expect(sum).toBeCloseTo(b.total);
  });
  it('is null for nodes the estimate does not cover', () => {
    for (const id of ['rev:1300', 'rev:2000', 'rev:5200', 'rev:6000', 'rev:1115', 'other:ovriga'])
      expect(revenuePartOf(b, id)).toBeNull();
  });
  it('1100 can be zero or negative at a low salary', () => {
    const low = estimateFor({ ...DEFAULT_INPUTS, monthly: '15000' }, 2026)!.breakdown;
    expect(revenuePartOf(low, 'rev:1100')!).toBeLessThanOrEqual(0);
  });
  it('speaks a negative amount', () => {
    expect(krWords(-1_234)).toBe(`minus ungefär 1${NBSP}230 kronor`);
    expect(krWords(-3)).toBe('ungefär 0 kronor');
  });
});

describe('per month / per year', () => {
  it('labels the periods', () => {
    expect(periodLabel('year')).toBe('per år');
    expect(periodLabel('month')).toBe('per månad');
  });

  it('divides the yearly amount by twelve only in month mode', () => {
    expect(perPeriod(12_000, 'year')).toBe(12_000);
    expect(perPeriod(12_000, 'month')).toBe(1_000);
    expect(perPeriod(-600, 'month')).toBe(-50);
  });

  it('rounds the monthly total and parts to the nearest 10 kr, the yearly total to 100 kr', () => {
    expect(formatTotal(9_849)).toBe(`9${NBSP}800${NBSP}kr`);
    expect(formatTotal(perPeriod(9_849, 'month'), 'month')).toBe(`820${NBSP}kr`);
    expect(formatPart(perPeriod(9_849, 'month'))).toBe(`≈${NBSP}820${NBSP}kr`);
    expect(formatPart(perPeriod(60, 'month'))).toBe(`<${NBSP}10${NBSP}kr`);
    expect(krWords(perPeriod(9_849, 'month'))).toBe('ungefär 820 kronor');
  });

  it('keys the panel collapse on year, node and Mindre poster level', () => {
    const k = (mindre: number) => salaryNavKey({ year: 2026, nodeId: 'a', mindre });
    expect(k(0)).not.toBe(k(1));
    expect(salaryNavKey({ year: 2026, nodeId: null, mindre: 0 })).not.toBe(
      salaryNavKey({ year: 2025, nodeId: null, mindre: 0 }),
    );
  });
});
