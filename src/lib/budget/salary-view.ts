/**
 * View logic for the salary panel "Vad betalar jag?" (docs/design/budget-explorer.md P8): parsing
 * of the inputs, the estimate for a year and the rounding of what is shown. Pure functions, no
 * I/O: the salary exists only in the component state that calls these.
 */
import { formatKr, formatNumber } from './format';
import {
  estimateContribution,
  getTaxYear,
  vatMixFromEffectiveRate,
  type Breakdown,
  type VatMix,
} from './personal';
import { DEFAULT_CONSUMPTION_SHARE, DEFAULT_VAT_MIX } from './personal-params';

/** Default average moms of consumption incl. moms, in percent, implied by DEFAULT_VAT_MIX. */
const DEFAULT_VAT_PERCENT = 11.4;
/** Highest monthly salary the panel accepts; above it the input is rejected as a typo. */
export const MAX_MONTHLY_SALARY = 10_000_000;

export type SalaryInputs = {
  /** Monthly gross salary as typed. */
  monthly: string;
  /** Share of income after tax spent on consumption, percent as typed. */
  consumption: string;
  /** Average moms of what is bought, percent as typed. */
  vat: string;
};

function formatDecimal(v: number): string {
  return String(v).replace('.', ',');
}

export const DEFAULT_INPUTS: SalaryInputs = {
  monthly: '',
  consumption: formatDecimal(DEFAULT_CONSUMPTION_SHARE * 100),
  vat: formatDecimal(DEFAULT_VAT_PERCENT),
};

/** A non-negative number typed with spaces (also non-breaking) and a decimal comma or point. */
export function parseNumber(text: string): number | null {
  const cleaned = text.replace(/[\s  ]/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** "35 000" and "35000" both give 35000. Null when empty, not a number or implausibly large. */
export function parseMonthlySalary(text: string): number | null {
  const n = parseNumber(text);
  return n === null || n > MAX_MONTHLY_SALARY ? null : n;
}

export type Estimate = {
  breakdown: Breakdown;
  /** Kr per year to the state, unrounded: the base of the box values. */
  total: number;
  /** An assumption that was out of range and replaced by its default. */
  invalid: { consumption: boolean; vat: boolean };
};

/** Maximum moms percent the single-average input accepts for `year`. */
export function maxVatPercent(year: number): number {
  const v = getTaxYear(year).vat.standard;
  return (v / (1 + v)) * 100;
}

/**
 * The state's estimate for the inputs and `year`, or null when the salary is not a valid number.
 * An assumption that does not parse or is out of range falls back to its default and is reported
 * in `invalid` so the panel can say so.
 */
export function estimateFor(inputs: SalaryInputs, year: number): Estimate | null {
  const monthly = parseMonthlySalary(inputs.monthly);
  if (monthly === null) return null;
  const params = getTaxYear(year);
  const consumptionPct = parseNumber(inputs.consumption);
  const vatPct = parseNumber(inputs.vat);
  const consumptionOk = consumptionPct !== null && consumptionPct <= 100;
  const vatOk = vatPct !== null && vatPct <= maxVatPercent(year);
  let vatMix: VatMix = DEFAULT_VAT_MIX;
  if (vatOk && Math.abs(vatPct - DEFAULT_VAT_PERCENT) >= 0.05) {
    vatMix = vatMixFromEffectiveRate(vatPct / 100, params);
  }
  const breakdown = estimateContribution(
    {
      grossSalary: monthly * 12,
      consumptionShare: consumptionOk ? consumptionPct / 100 : DEFAULT_CONSUMPTION_SHARE,
      vatMix,
    },
    year,
  ).stat;
  return {
    breakdown,
    total: breakdown.total,
    invalid: { consumption: !consumptionOk, vat: !vatOk },
  };
}

/** The headline total: nearest 100 kr. */
export function formatTotal(kr: number): string {
  return formatKr(kr, 100);
}

/** A component or box value: nearest 10 kr, "≈" in front, "< 10 kr" below that. */
export function formatPart(kr: number): string {
  const s = formatKr(kr, 10);
  return s.startsWith('<') || kr === 0 ? s : `≈ ${s}`;
}

/** A box's share of the person's total, `total x value / sideTotal`, in kr per year. */
export function partOf(total: number, value: number, sideTotal: number): number {
  return sideTotal > 0 ? (total * value) / sideTotal : 0;
}

/**
 * The person's own kr on a revenue node, taken from the panel's breakdown, not spread pro rata:
 * Skatter netto is the total, 1100 is statlig inkomstskatt plus the skattereduktioner, 1200 the
 * arbetsgivaravgifter (statens del) and 1400 the moms. Null for every other node (the estimate
 * has no component for them). Can be zero or negative for 1100.
 */
export function revenuePartOf(b: Breakdown, nodeId: string): number | null {
  const sum = (ids: string[]) =>
    b.components.filter((c) => ids.includes(c.id)).reduce((a, c) => a + c.amount, 0);
  switch (nodeId) {
    case 'rev:skatter':
      return b.total;
    case 'rev:1100':
      return sum([
        'statlig-inkomstskatt',
        'jobbskatteavdrag',
        'skattereduktion-pensionsavgift',
        'skattereduktion-forvarvsinkomst',
      ]);
    case 'rev:1200':
      return sum(['arbetsgivaravgifter']);
    case 'rev:1400':
      return sum(['moms']);
    default:
      return null;
  }
}

/** For screen readers: "ungefär 1 230 kronor". */
export function krWords(kr: number, step = 10): string {
  if (kr < 0) return Math.abs(kr) < step ? 'ungefär 0 kronor' : `minus ${krWords(-kr, step)}`;
  if (kr === 0) return '0 kronor';
  if (Math.abs(kr) < step) return `mindre än ${formatNumber(step)} kronor`;
  return `ungefär ${formatNumber(Math.round(kr / step) * step)} kronor`;
}

/** "Skatteregler för 2023 saknas, uppskattningen använder 2024 års regler." or null. */
export function fallbackNotice(b: Breakdown): string | null {
  return b.usedFallbackYear
    ? `Skatteregler för ${b.year} saknas, uppskattningen använder ${b.paramsYear} års regler.`
    : null;
}
