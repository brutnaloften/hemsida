/**
 * Estimate of one person's yearly contribution to the STATE budget from
 * gross salary. Pure functions, no I/O. Level-agnostic: the result is a list
 * of named components tagged with the level of government that receives
 * them, so kommunal/regional components can be added later. Kommunalskatt is
 * reported separately (`otherLevels`) and never counts toward `stateTotal`.
 *
 * Simplifications (documented, deliberate): no jobbskatteavdrag or other
 * deductions, no sector-specific arbetsgivaravgift reductions; grundavdrag is
 * the high-income minimum, which is the only value relevant where statlig
 * skatt is paid. Not tax advice.
 */
import {
  DEFAULT_CONSUMPTION_SHARE,
  DEFAULT_VAT_MIX,
  LATEST_TAX_YEAR,
  TAX_YEARS,
  type TaxYearParams,
} from './personal-params';

export type GovLevel = 'stat' | 'kommun' | 'region';
export type VatMix = typeof DEFAULT_VAT_MIX;

export interface PersonalInput {
  /** Gross yearly salary in kr. */
  grossSalary: number;
  /** Tax year; defaults to the latest supported. */
  year?: number;
  /** Share of disposable income spent on consumption (0-1). */
  consumptionShare?: number;
  /** Split of consumption over moms categories; must sum to 1. */
  vatMix?: VatMix;
  /** Total kommun + region tax rate, used for disposable income and the kommunalskatt memo. */
  municipalTaxRate?: number;
}

export interface Component {
  id: 'statlig-inkomstskatt' | 'arbetsgivaravgifter' | 'moms' | 'kommunalskatt';
  label: string;
  level: GovLevel;
  /** Kr per year. */
  amount: number;
}

export interface PersonalResult {
  year: number;
  /** Components that go to the state budget. */
  components: Component[];
  /** Other levels, informational only (not state budget). */
  otherLevels: Component[];
  stateTotal: number;
  disposableIncome: number;
  consumption: number;
  assumptions: Required<Omit<PersonalInput, 'grossSalary' | 'year'>> & { year: number };
}

export function getTaxYear(year: number = LATEST_TAX_YEAR): TaxYearParams {
  const p = TAX_YEARS[year];
  if (!p) throw new Error(`No tax parameters for year ${year}`);
  return p;
}

/** Statlig inkomstskatt: rate on taxable income above the skiktgräns. */
export function stateIncomeTax(grossSalary: number, p: TaxYearParams): number {
  const taxable = Math.max(0, grossSalary - p.grundavdragHighIncome);
  return Math.max(0, taxable - p.skiktgrans) * p.stateTaxRate;
}

/** Moms contained in `consumption` (spending incl. moms) for a category mix. */
export function vatInConsumption(consumption: number, mix: VatMix, p: TaxYearParams): number {
  const sum = mix.standard + mix.reduced12 + mix.reduced6 + mix.exempt;
  if (Math.abs(sum - 1) > 1e-9) throw new Error('vatMix shares must sum to 1');
  const part = (share: number, rate: number) => (consumption * share * rate) / (1 + rate);
  return (
    part(mix.standard, p.vat.standard) +
    part(mix.reduced12, p.vat.reduced12) +
    part(mix.reduced6, p.vat.reduced6)
  );
}

export function estimatePersonalContribution(input: PersonalInput): PersonalResult {
  const p = getTaxYear(input.year);
  const gross = input.grossSalary;
  if (!Number.isFinite(gross) || gross < 0) throw new Error('grossSalary must be >= 0');
  const consumptionShare = input.consumptionShare ?? DEFAULT_CONSUMPTION_SHARE;
  if (consumptionShare < 0 || consumptionShare > 1)
    throw new Error('consumptionShare must be between 0 and 1');
  const vatMix = input.vatMix ?? DEFAULT_VAT_MIX;
  const municipalTaxRate = input.municipalTaxRate ?? p.avgMunicipalTaxRate;

  const statTax = stateIncomeTax(gross, p);
  const employer = gross * p.employerContributionRate;
  const kommunal = Math.max(0, gross - p.grundavdragHighIncome) * municipalTaxRate;
  const disposableIncome = gross - statTax - kommunal;
  const consumption = Math.max(0, disposableIncome) * consumptionShare;
  const moms = vatInConsumption(consumption, vatMix, p);

  const components: Component[] = [
    { id: 'statlig-inkomstskatt', label: 'Statlig inkomstskatt', level: 'stat', amount: statTax },
    { id: 'arbetsgivaravgifter', label: 'Arbetsgivaravgifter', level: 'stat', amount: employer },
    { id: 'moms', label: 'Moms', level: 'stat', amount: moms },
  ];
  return {
    year: p.year,
    components,
    otherLevels: [
      { id: 'kommunalskatt', label: 'Kommunalskatt', level: 'kommun', amount: kommunal },
    ],
    stateTotal: components.reduce((s, c) => s + c.amount, 0),
    disposableIncome,
    consumption,
    assumptions: { year: p.year, consumptionShare, vatMix, municipalTaxRate },
  };
}

/**
 * Distribute `total` over `weights` proportionally (e.g. treemap box sizes).
 * Result sums exactly to the rounded total (largest remainder on whole kr);
 * zero or negative weights get 0. All-zero weights yield all zeros.
 */
export function allocateProportionally(total: number, weights: number[]): number[] {
  const w = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const sum = w.reduce((a, b) => a + b, 0);
  if (sum === 0 || total <= 0) return w.map(() => 0);
  const exact = w.map((x) => (x / sum) * total);
  const floors = exact.map(Math.floor);
  let rest = Math.round(total) - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, i) => ({ i, frac: e - floors[i] }))
    .filter(({ i }) => w[i] > 0)
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; rest > 0 && order.length; k = (k + 1) % order.length, rest--)
    floors[order[k].i]++;
  return floors;
}
