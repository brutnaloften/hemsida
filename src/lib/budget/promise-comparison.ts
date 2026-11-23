/**
 * Nominal before/after comparison of one anslag for budget promises (docs/data-model.md, "Rules
 * for setting a verdict from budget evidence", hemsida-dl5.6). Pure: the caller passes the
 * expenditure data; `compareAnslagFromData` is the convenience wrapper over the committed ESV file.
 *
 * Only the NOMINAL change decides a verdict. The real (KPI-deflated) change is returned as
 * context for the promise page and the reasoning; it never qualifies or blocks a verdict.
 */
import expenditureJson from '@/data/budget/expenditure.json';
import macroJson from '@/data/budget/macro.json';
import { kpiFactor, type Kpi } from '@/lib/budget/real';

export type ExpenditureLike = {
  years: number[];
  anslag: { kod: string; namn: string; utfall: (number | null)[]; budget: (number | null)[] }[];
};

export type ComparisonSeries = 'utfall' | 'budget';

export type NominalComparison = {
  kod: string;
  namn: string;
  /** `utfall` is the outcome tier, `budget` the ceiling tier (see the budget evidence `tier`). */
  series: ComparisonSeries;
  baselineYear: number;
  endYear: number;
  /** mn kr nominal, as in the data. */
  before: number;
  after: number;
  /** after - before, mn kr nominal. */
  change: number;
  /** Percent change, nominal; null when the baseline is 0. */
  changePct: number | null;
  /** Direction of the NOMINAL change. This is the only thing a verdict may rest on. */
  direction: 'up' | 'down' | 'flat';
  /** Context only, never used for a verdict: change in constant prices, when KPI exists. */
  realContext: { afterInBaselinePrices: number; changePct: number | null } | null;
};

export type ComparisonResult = ({ ok: true } & NominalComparison) | { ok: false; reason: string };

const round1 = (v: number): number => Math.round(v * 10) / 10;
const pct = (b: number, x: number): number | null =>
  b === 0 ? null : round1(((x - b) / Math.abs(b)) * 100);

/**
 * Compares `kod` between two years. Fails (never guesses) when the anslag is unknown, a year is
 * outside the data, or either value is missing: a missing outcome is not 0.
 */
export function compareAnslag(
  data: ExpenditureLike,
  opts: {
    kod: string;
    baselineYear: number;
    endYear: number;
    series?: ComparisonSeries;
    kpi?: Kpi;
  },
): ComparisonResult {
  const { kod, baselineYear, endYear, series = 'utfall', kpi } = opts;
  if (baselineYear >= endYear) return { ok: false, reason: 'baselineYear must be before endYear' };
  const a = data.anslag.find((x) => x.kod === kod);
  if (!a) return { ok: false, reason: `anslag ${kod} not found` };
  const bi = data.years.indexOf(baselineYear);
  const ei = data.years.indexOf(endYear);
  if (bi === -1 || ei === -1) {
    return { ok: false, reason: `year outside the data (${data.years[0]}-${data.years.at(-1)})` };
  }
  const before = a[series][bi];
  const after = a[series][ei];
  if (before == null || after == null) {
    return {
      ok: false,
      reason: `${series} missing for ${kod} in ${before == null ? baselineYear : endYear}`,
    };
  }
  const change = round1(after - before);
  let realContext: NominalComparison['realContext'] = null;
  if (kpi && kpi[String(baselineYear)] !== undefined && kpi[String(endYear)] !== undefined) {
    // End amount expressed in baseline-year prices, so it compares directly with `before`.
    const afterReal = after / kpiFactor(kpi, baselineYear, endYear);
    realContext = { afterInBaselinePrices: round1(afterReal), changePct: pct(before, afterReal) };
  }
  return {
    ok: true,
    kod,
    namn: a.namn,
    series,
    baselineYear,
    endYear,
    before,
    after,
    change,
    changePct: pct(before, after),
    direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
    realContext,
  };
}

/** Defaults follow docs/budget-promises.md: baseline 2022 outcome, end 2025. */
export function compareAnslagFromData(
  kod: string,
  opts: { baselineYear?: number; endYear?: number; series?: ComparisonSeries } = {},
): ComparisonResult {
  return compareAnslag(expenditureJson as ExpenditureLike, {
    kod,
    baselineYear: opts.baselineYear ?? 2022,
    endYear: opts.endYear ?? 2025,
    series: opts.series,
    kpi: macroJson.kpi.values as Kpi,
  });
}
