import { describe, expect, it } from 'vitest';
import { compareAnslag, compareAnslagFromData, type ExpenditureLike } from './promise-comparison';

const data: ExpenditureLike = {
  years: [2022, 2023, 2024, 2025],
  anslag: [
    { kod: '1111111', namn: 'Upp', utfall: [100, 110, 120, 130], budget: [90, 100, 110, 120] },
    { kod: '2222222', namn: 'Ner', utfall: [100, 90, 80, 70], budget: [100, 90, 80, 70] },
    { kod: '3333333', namn: 'Lika', utfall: [100, 100, 100, 100], budget: [100, 100, 100, 100] },
    { kod: '4444444', namn: 'Saknas', utfall: [100, null, null, null], budget: [0, 0, 0, 0] },
    { kod: '5555555', namn: 'Noll', utfall: [0, 5, 5, 5], budget: [0, 5, 5, 5] },
  ],
};
const kpi = { '2022': 100, '2025': 125 };

describe('compareAnslag', () => {
  it('reports a nominal rise with the real figure as context only', () => {
    const r = compareAnslag(data, { kod: '1111111', baselineYear: 2022, endYear: 2025, kpi });
    expect(r).toMatchObject({ ok: true, before: 100, after: 130, change: 30, changePct: 30 });
    if (r.ok) {
      expect(r.direction).toBe('up');
      expect(r.realContext).toEqual({ afterInBaselinePrices: 104, changePct: 4 });
    }
  });

  it('a nominal rise stays up even when real is negative', () => {
    const r = compareAnslag(data, {
      kod: '1111111',
      baselineYear: 2022,
      endYear: 2025,
      kpi: { '2022': 100, '2025': 200 },
    });
    expect(r.ok && r.direction).toBe('up');
    expect(r.ok && r.realContext!.changePct).toBe(-35);
  });

  it('reports a fall and a flat series', () => {
    const down = compareAnslag(data, { kod: '2222222', baselineYear: 2022, endYear: 2025 });
    expect(down.ok && down.direction).toBe('down');
    expect(down.ok && down.changePct).toBe(-30);
    const flat = compareAnslag(data, { kod: '3333333', baselineYear: 2022, endYear: 2025 });
    expect(flat.ok && flat.direction).toBe('flat');
  });

  it('reads the ceiling series on request and has no real context without KPI', () => {
    const r = compareAnslag(data, {
      kod: '1111111',
      baselineYear: 2022,
      endYear: 2025,
      series: 'budget',
    });
    expect(r).toMatchObject({ ok: true, series: 'budget', before: 90, after: 120 });
    expect(r.ok && r.realContext).toBeNull();
  });

  it('fails instead of guessing', () => {
    const f = (o: object) =>
      compareAnslag(data, { kod: '1111111', baselineYear: 2022, endYear: 2025, ...o });
    expect(f({ kod: '9999999' })).toMatchObject({ ok: false });
    expect(f({ endYear: 2030 })).toMatchObject({ ok: false });
    expect(f({ baselineYear: 2025, endYear: 2022 })).toMatchObject({ ok: false });
    expect(f({ kod: '4444444' })).toMatchObject({ ok: false });
  });

  it('gives a null percentage from a zero baseline', () => {
    const r = compareAnslag(data, { kod: '5555555', baselineYear: 2022, endYear: 2025, kpi });
    expect(r).toMatchObject({ ok: true, change: 5, changePct: null, direction: 'up' });
  });
});

describe('compareAnslagFromData', () => {
  it('reads the committed ESV data with the 2022 to 2025 defaults', () => {
    // 2201001 Utveckling av statens transportinfrastruktur: 29 277 to 37 836 in docs/budget-promises.md.
    const r = compareAnslagFromData('2201001');
    expect(r).toMatchObject({ ok: true, baselineYear: 2022, endYear: 2025, direction: 'up' });
    if (r.ok) {
      expect(Math.round(r.before)).toBe(29277);
      expect(r.changePct).toBe(29.2);
      expect(r.realContext!.changePct).toBeCloseTo(15.0, 0);
    }
  });
});
