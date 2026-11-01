/**
 * Time series for advanced mode (docs/design/budget-explorer.md P10). The wire format and the pure
 * helpers the island uses; the data-backed builder is in advanced-data.ts. No data imports at
 * runtime, so the island never ships the committed JSON.
 */
import { formatMdkr, formatNumber } from '@/lib/budget/format';
import type { GovernmentYear } from '@/schema/budget';
import { toFixedPrices, type Kpi } from '@/lib/budget/real';

/** A value per year in `AdvancedFile.years`; null where the node has no value that year. */
export type YearSeries = (number | null)[];

/**
 * Everything advanced mode needs besides the year files. Per-row arrays follow the order of
 * names.json, so a node's row is found through its id there. Amounts are mn kr, nominal.
 */
export type AdvancedFile = {
  years: number[];
  /** Per year, whether the side is preliminary. */
  preliminary: { utgifter: boolean[]; inkomster: boolean[] };
  /** Statens utgifter and inkomster per year (the balance view's totals). */
  totals: { utgifter: number[]; inkomster: number[] };
  kpi: Kpi;
  /** GDP in mn kr per year, null where SCB has not published it. */
  bnp: YearSeries;
  utfall: YearSeries[];
  /** Statens budget; null for rows that have none. */
  budget: (YearSeries | null)[];
  /** Ändringsbudgetar; spending rows only. */
  andrad: (YearSeries | null)[];
  /** Budget-proposing government per year (meta.json); absent when the data has none. */
  governments?: GovernmentYear[];
  /** Codes to show, e.g. "Anslag 1:11, ESV-kod 0901011"; null for rows without one. */
  codes: (string | null)[];
};

export type Point = {
  year: number;
  value: number | null;
  preliminary: boolean;
};

export type Line = {
  /** Visible name in the legend. */
  name: string;
  points: Point[];
  dashed?: boolean;
  /** Marker shape, so the lines are told apart without colour. */
  marker: 'circle' | 'square';
};

/** Amount of year `from` in the prices of `latest`, when `fasta`, otherwise unchanged. */
export function priced(
  value: number | null,
  fasta: boolean,
  kpi: Kpi,
  from: number,
  latest: number,
): number | null {
  return fasta ? toFixedPrices(value, kpi, from, latest) : value;
}

/** The points of one series, optionally in fixed prices. */
export function pointsOf(
  file: AdvancedFile,
  series: YearSeries,
  side: 'utgifter' | 'inkomster',
  fasta: boolean,
): Point[] {
  const latest = file.years[file.years.length - 1];
  return file.years.map((year, i) => ({
    year,
    value: priced(series[i] ?? null, fasta, file.kpi, year, latest),
    preliminary: file.preliminary[side][i] ?? false,
  }));
}

/** Andel av BNP for each year (a fraction), null for a year without published GDP. */
export function bnpShares(file: AdvancedFile, series: YearSeries): (number | null)[] {
  return series.map((v, i) => {
    const bnp = file.bnp[i];
    return v === null || bnp == null || bnp === 0 ? null : v / bnp;
  });
}

/** Last year with a published GDP, or null. */
export function lastBnpYear(file: AdvancedFile): number | null {
  for (let i = file.bnp.length - 1; i >= 0; i--) if (file.bnp[i] != null) return file.years[i];
  return null;
}

/**
 * Text alternative of a line: first and last value, highest and lowest year, and the preliminary
 * years. Swedish prose for screen readers and as a visible summary.
 */
export function summarize(name: string, line: Line): string {
  const known = line.points.filter((p): p is Point & { value: number } => p.value !== null);
  if (known.length === 0) return `${name}: inga uppgifter.`;
  const first = known[0];
  const last = known[known.length - 1];
  const high = known.reduce((a, b) => (b.value > a.value ? b : a));
  const low = known.reduce((a, b) => (b.value < a.value ? b : a));
  let text = `${name} var ${formatMdkr(first.value)} ${first.year} och ${formatMdkr(last.value)} ${last.year}`;
  if (known.length > 2 && high.year !== low.year) {
    text += `, högst ${formatMdkr(high.value)} ${high.year} och lägst ${formatMdkr(low.value)} ${low.year}`;
  }
  text += '.';
  const prelim = known.filter((p) => p.preliminary).map((p) => p.year);
  if (prelim.length) text += ` Preliminärt: ${prelim.join(', ')}.`;
  return text;
}

/** Miljarder kronor as a bare number for table cells and axes; "–" for no value. */
export function mdkrNumber(mnKr: number | null, decimals = 1): string {
  return mnKr === null ? '–' : formatNumber(mnKr / 1000, decimals);
}

export type GovernmentRun = {
  government: string;
  parties: string;
  /** Index in `years` of the first and last year of the run. */
  from: number;
  to: number;
};

/**
 * Consecutive years with the same budget-proposing government, as bands over `years`. Years with no
 * entry in `governments` break a run and are not drawn.
 */
export function governmentRuns(governments: GovernmentYear[], years: number[]): GovernmentRun[] {
  const runs: GovernmentRun[] = [];
  years.forEach((year, i) => {
    const g = governments.find((e) => e.year === year);
    if (!g) return;
    const last = runs[runs.length - 1];
    if (last && last.to === i - 1 && last.government === g.government) last.to = i;
    else runs.push({ government: g.government, parties: g.parties, from: i, to: i });
  });
  return runs;
}
