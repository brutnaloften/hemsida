/**
 * Estimate of one person's yearly contribution to the STATE budget from
 * gross salary. Pure functions, no I/O.
 *
 * Level-agnostic: `estimateContribution` returns `{ stat }` today, with
 * `kommun` and `region` keys reserved for later. Kommunalskatt is NOT state
 * budget; its estimate is only a memo (`stat.memo.kommunalskatt`).
 *
 * State components:
 * - statlig inkomstskatt: 20 % of taxable income above the skiktgräns.
 * - jobbskatteavdrag: negative. It is deducted against kommunal tax but
 *   booked against state revenue (the state compensates kommuner/regioner),
 *   so it lowers the state's net receipts.
 * - arbetsgivaravgifter (statens del): total rate minus ålderspensionsavgift,
 *   which goes to the AP funds outside the state budget.
 * - moms from consumption (adjustable assumptions).
 *
 * Simplifications: employees under 66 born 1959 or later, no other deductions
 * or reductions, gross salary treated as both fastställd förvärvsinkomst and
 * arbetsinkomst, no rounding of taxable income. Not tax advice.
 */
import {
  DEFAULT_CONSUMPTION_SHARE,
  DEFAULT_VAT_MIX,
  GRUNDAVDRAG_RULES as G,
  JOBBSKATTEAVDRAG_RULES as J,
  LATEST_TAX_YEAR,
  TAX_YEARS,
  type TaxYearParams,
} from './personal-params';

export type GovLevel = 'stat' | 'kommun' | 'region';
export type VatMix = typeof DEFAULT_VAT_MIX;

export interface PersonalInput {
  /** Gross yearly salary in kr. */
  grossSalary: number;
  /** Share of disposable income spent on consumption (0-1). */
  consumptionShare?: number;
  /** Split of consumption over moms categories; must sum to 1. */
  vatMix?: VatMix;
  /**
   * Total kommun + region tax rate (e.g. 0.3238). Drives jobbskatteavdrag,
   * disposable income and the kommunalskatt memo. Defaults to the national average.
   */
  kommunalskattesats?: number;
}

export interface Component {
  id: 'statlig-inkomstskatt' | 'jobbskatteavdrag' | 'arbetsgivaravgifter' | 'moms';
  /** Swedish label for display. */
  label: string;
  /** One-sentence Swedish explanation for display. */
  explanation: string;
  /** Kr per year; negative for jobbskatteavdrag. */
  amount: number;
}

export interface Breakdown {
  level: GovLevel;
  /** Year the caller asked for. */
  year: number;
  /** Year whose rules were actually used. */
  paramsYear: number;
  /** True when `paramsYear !== year` (nearest year's rules were used). */
  usedFallbackYear: boolean;
  components: Component[];
  /** Sum of the components, kr per year. */
  total: number;
  disposableIncome: number;
  consumption: number;
  /** Not state budget; informational only. */
  memo: { kommunalskatt: number };
  assumptions: {
    consumptionShare: number;
    vatMix: VatMix;
    kommunalskattesats: number;
  };
}

export interface Contribution {
  stat: Breakdown;
  kommun?: Breakdown;
  region?: Breakdown;
}

/** Params for `year`, or the nearest supported year (earlier wins ties). */
export function getTaxYear(year: number = LATEST_TAX_YEAR): TaxYearParams {
  const exact = TAX_YEARS[year];
  if (exact) return exact;
  const years = Object.keys(TAX_YEARS).map(Number);
  if (years.length === 0) throw new Error('No tax parameters defined');
  const nearest = years.reduce((best, y) => {
    const d = Math.abs(y - year);
    const bd = Math.abs(best - year);
    return d < bd || (d === bd && y < best) ? y : best;
  });
  return TAX_YEARS[nearest];
}

/** Grundavdrag (under 66), rounded up to whole hundreds, capped at income. SKV_433 section 6. */
export function grundavdrag(income: number, p: TaxYearParams): number {
  const pbb = p.pbb;
  let ga: number;
  if (income <= G.lowIncomePbb * pbb) ga = G.floorPbb * pbb;
  else if (income <= G.risingUntilPbb * pbb)
    ga = G.floorPbb * pbb + (income - G.lowIncomePbb * pbb) * G.risingRate;
  else if (income <= G.flatUntilPbb * pbb) ga = G.maxPbb * pbb;
  else if (income <= G.fallingUntilPbb * pbb)
    ga = G.maxPbb * pbb - (income - G.flatUntilPbb * pbb) * G.fallingRate;
  else ga = G.highIncomePbb * pbb;
  return Math.min(Math.ceil(ga / 100) * 100, income);
}

/**
 * Jobbskatteavdrag (under 66), whole kr. Earned income is rounded down to
 * whole hundreds; capped at the kommunal tax on taxable income. SKV_433 7.5.2.
 */
export function jobbskatteavdrag(
  income: number,
  kommunalskattesats: number,
  p: TaxYearParams,
): number {
  const ai = Math.floor(income / 100) * 100;
  const ga = grundavdrag(income, p);
  const pbb = p.pbb;
  let base: number;
  if (ai <= J.b1Pbb * pbb) base = ai;
  else if (ai <= J.b2Pbb * pbb) base = J.b1Pbb * pbb + J.rate2 * (ai - J.b1Pbb * pbb);
  else if (ai <= J.b3Pbb * pbb) base = J.base3Pbb * pbb + J.rate3 * (ai - J.b2Pbb * pbb);
  else base = J.topPbb * pbb;
  const ki = kommunalskattesats - p.jsaRateExclusion;
  const jsa = Math.max(0, base - ga) * ki;
  const cap = Math.max(0, income - ga) * kommunalskattesats;
  return Math.floor(Math.min(jsa, cap));
}

/** Statlig inkomstskatt: rate on taxable income above the skiktgräns. */
export function stateIncomeTax(income: number, p: TaxYearParams): number {
  const taxable = Math.max(0, income - grundavdrag(income, p));
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

export function estimateContribution(
  input: PersonalInput,
  year: number = LATEST_TAX_YEAR,
): Contribution {
  const p = getTaxYear(year);
  const gross = input.grossSalary;
  if (!Number.isFinite(gross) || gross < 0) throw new Error('grossSalary must be >= 0');
  const consumptionShare = input.consumptionShare ?? DEFAULT_CONSUMPTION_SHARE;
  if (consumptionShare < 0 || consumptionShare > 1)
    throw new Error('consumptionShare must be between 0 and 1');
  const vatMix = input.vatMix ?? DEFAULT_VAT_MIX;
  const kommunalskattesats = input.kommunalskattesats ?? p.avgKommunalskattesats;
  if (kommunalskattesats < 0 || kommunalskattesats > 1)
    throw new Error('kommunalskattesats must be between 0 and 1');

  const ga = grundavdrag(gross, p);
  const statTax = stateIncomeTax(gross, p);
  const jsa = jobbskatteavdrag(gross, kommunalskattesats, p);
  const employer = gross * (p.employerTotalRate - p.employerPensionRate);
  const kommunalskatt = Math.max(0, gross - ga) * kommunalskattesats - jsa;
  const disposableIncome = gross - statTax - kommunalskatt;
  const consumption = Math.max(0, disposableIncome) * consumptionShare;
  const moms = vatInConsumption(consumption, vatMix, p);

  const components: Component[] = [
    {
      id: 'statlig-inkomstskatt',
      label: 'Statlig inkomstskatt',
      explanation: `Den del av inkomsten som överstiger ${p.skiktgrans.toLocaleString('sv-SE')} kr beskattas med ${p.stateTaxRate * 100} procent till staten.`,
      amount: statTax,
    },
    {
      id: 'jobbskatteavdrag',
      label: 'Jobbskatteavdrag',
      explanation:
        'Jobbskatteavdraget sänker din kommunalskatt, men staten betalar tillbaka beloppet till kommunerna, så det minskar statens inkomster.',
      amount: -jsa,
    },
    {
      id: 'arbetsgivaravgifter',
      label: 'Arbetsgivaravgifter (statens del)',
      explanation:
        'Din arbetsgivare betalar avgifter på lönen; pensionsdelen går till AP-fonderna och räknas inte med här.',
      amount: employer,
    },
    {
      id: 'moms',
      label: 'Moms på det du köper',
      explanation:
        'Moms ingår i priset på det du handlar för och går till staten; beloppet bygger på antaganden om hur mycket du handlar för och vad.',
      amount: moms,
    },
  ];
  return {
    stat: {
      level: 'stat',
      year,
      paramsYear: p.year,
      usedFallbackYear: p.year !== year,
      components,
      total: components.reduce((s, c) => s + c.amount, 0),
      disposableIncome,
      consumption,
      memo: { kommunalskatt },
      assumptions: { consumptionShare, vatMix, kommunalskattesats },
    },
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
