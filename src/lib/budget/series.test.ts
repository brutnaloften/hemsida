import { describe, expect, it } from 'vitest';
import { buildAdvancedFile, sumSeries } from '@/lib/budget/advanced-data';
import { totalsForYear, years } from '@/lib/budget/data';
import { flattenTrees } from '@/lib/budget/tree';
import { buildRevenueTree, buildSpendingTree } from '@/lib/budget/view';
import {
  bnpShares,
  lastBnpYear,
  pointsOf,
  summarize,
  type AdvancedFile,
  type Line,
} from '@/lib/budget/series';

const file: AdvancedFile = buildAdvancedFile();
const { names } = flattenTrees(buildSpendingTree(2025), buildRevenueTree(2025));
const row = (id: string) => names.rows.findIndex((r) => r[0] === id);

describe('advanced file', () => {
  it('has one row of every kind per names row, one value per year', () => {
    const n = names.rows.length;
    expect(file.utfall).toHaveLength(n);
    expect(file.budget).toHaveLength(n);
    expect(file.andrad).toHaveLength(n);
    expect(file.codes).toHaveLength(n);
    expect(file.utfall.every((s) => s.length === years.length)).toBe(true);
  });

  it('keeps the outcome of the roots equal to the year trees', () => {
    const i = years.indexOf(2020);
    expect(file.utfall[row('root:utgifter')][i]).toBe(buildSpendingTree(2020).value);
    expect(file.utfall[row('root:inkomster')][i]).toBe(buildRevenueTree(2020).value);
    expect(file.totals.utgifter[i]).toBe(totalsForYear(2020).utgifter);
  });

  it('sums budget and ändringsbudget of the anslag into the UO and the root', () => {
    const uos = names.rows.filter((r) => /^uo:/.test(r[0])).map((r) => row(r[0]));
    const i = years.indexOf(2025);
    const sum = (series: (number[] | (number | null)[] | null)[]) =>
      Math.round(series.reduce((s, x) => s + (x?.[i] ?? 0), 0) * 10) / 10;
    expect(file.budget[row('root:utgifter')]![i]).toBe(sum(uos.map((r) => file.budget[r])));
    expect(file.andrad[row('root:utgifter')]![i]).toBe(sum(uos.map((r) => file.andrad[r])));
    expect(file.andrad[row('root:inkomster')]).toBeNull();
  });

  it('shows codes for UO, anslag and inkomsttitlar', () => {
    expect(file.codes[row('uo:9')]).toBe('Utgiftsområde 9');
    expect(file.codes[row('anslag:0901011')]).toMatch(/^Anslag \d+:\d+, ESV-kod 0901011$/);
    expect(file.codes[row('rev:1111')]).toBe('Inkomsttitel 1111');
    expect(file.codes[row('root:utgifter')]).toBeNull();
  });

  it('marks the preliminary years per side', () => {
    expect(file.preliminary.inkomster).toHaveLength(years.length);
    expect(file.preliminary.inkomster.some(Boolean)).toBe(true);
  });
});

describe('sumSeries', () => {
  it('keeps null when nothing has a value', () => {
    const n = years.length;
    expect(sumSeries([Array(n).fill(null)]).every((v) => v === null)).toBe(true);
    expect(sumSeries([Array(n).fill(null), Array(n).fill(1.25)])[0]).toBe(1.3);
  });
});

describe('pointsOf and fixed prices', () => {
  it('leaves the latest year unchanged and scales earlier years up', () => {
    const series = years.map(() => 1000);
    const nominal = pointsOf(file, series, 'utgifter', false);
    const fixed = pointsOf(file, series, 'utgifter', true);
    expect(nominal.every((p) => p.value === 1000)).toBe(true);
    expect(fixed[fixed.length - 1].value).toBe(1000);
    expect(fixed[0].value!).toBeGreaterThan(1400);
  });
});

describe('bnp', () => {
  it('gives no share for 2025 and reports the last GDP year', () => {
    const series = years.map(() => 100000);
    const shares = bnpShares(file, series);
    expect(shares[shares.length - 1]).toBeNull();
    expect(shares[0]).toBeCloseTo(100000 / 3117499, 10);
    expect(lastBnpYear(file)).toBe(2024);
  });
});

describe('summarize', () => {
  const line: Line = {
    name: 'Utfall',
    marker: 'circle',
    points: [
      { year: 2006, value: 1000, preliminary: false },
      { year: 2007, value: 3000, preliminary: false },
      { year: 2008, value: 2000, preliminary: true },
    ],
  };
  it('names first, last, high, low and preliminary years', () => {
    const text = summarize('Utfallet', line).replaceAll(' ', ' ');
    expect(text).toContain('1,0 mdkr 2006');
    expect(text).toContain('2,0 mdkr 2008');
    expect(text).toContain('högst 3,0 mdkr 2007');
    expect(text).toContain('Preliminärt: 2008.');
  });
  it('handles a line without values', () => {
    expect(summarize('Budget', { ...line, points: [] })).toBe('Budget: inga uppgifter.');
  });
});
