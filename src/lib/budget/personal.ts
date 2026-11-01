/**
 * Estimate of one person's yearly contribution to the STATE budget from
 * gross salary. Pure functions, no I/O.
 *
 * Level-agnostic: `estimateContribution` returns `{ stat }` today, with
 * `kommun` and `region` keys reserved for later. Kommunalskatt is NOT state
 * budget; its estimate is only a memo (`stat.memo.kommunalskatt`).
 *
 * State components:
 * - statlig inkomstskatt: 20 % of taxable income (after grundavdrag) above
 *   the skiktgräns.
 * - three negative skattereduktioner, booked against state revenue (the
 *   state compensates kommuner/regioner and the AP funds): jobbskatteavdrag
 *   (titel 1153), skattereduktion för allmän pensionsavgift (1141, which
 *   offsets the 7 % fee that goes to the AP funds) and skattereduktion för
 *   förvärvsinkomst (1162). With the 2026 rules the total stays
 *   non-negative in the default case (the minimum is 0 at 0 kr salary), but
 *   a user-supplied kommunalskattesats can make it slightly negative, so callers should still handle a negative total (see allocateProportionally).
 * - arbetsgivaravgifter (statens del): total rate minus ålderspensionsavgift,
 *   which goes to the AP funds outside the state budget.
 * - moms from consumption (adjustable assumptions).
 *
 * Simplifications: employees under 66 born 1959 or later; gross salary is
 * treated as fastställd förvärvsinkomst and arbetsinkomst; taxable income is
 * not rounded; public service-avgift (max 1 184 kr) is ignored; the temporary
 * reduced arbetsgivaravgift for young people (2026-04 to 2027-09) is ignored;
 * reductions are applied in the order pensionsavgift, jobbskatteavdrag,
 * förvärvsinkomst, each capped by the tax left to reduce. `memo.kommunalskatt`
 * is kommun+region tax before any skattereduktion (roughly what they receive),
 * `memo.kommunalskattEfterAvdrag` what the person pays after the reductions.
 * Not tax advice.
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
   * Kommun + region tax rate EXCLUDING begravningsavgift and trossamfund
   * (e.g. SCB's 0.3238 average for 2026). It is used directly as "KI" in the
   * jobbskatteavdrag formula. Defaults to the national average.
   */
  kommunalskattesats?: number;
}

export interface Component {
  id:
    | 'statlig-inkomstskatt'
    | 'jobbskatteavdrag'
    | 'skattereduktion-pensionsavgift'
    | 'skattereduktion-forvarvsinkomst'
    | 'arbetsgivaravgifter'
    | 'moms';
  /** Swedish label for display. */
  label: string;
  /** One-sentence Swedish explanation for display. */
  explanation: string;
  /** Kr per year; negative for the skattereduktioner. */
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
  /** Sum of the components, kr per year. May in principle be negative. */
  total: number;
  disposableIncome: number;
  consumption: number;
  /** Not state budget; informational only. */
  memo: { kommunalskatt: number; kommunalskattEfterAvdrag: number };
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
  const jsa = Math.max(0, base - ga) * kommunalskattesats;
  const cap = Math.max(0, income - ga) * kommunalskattesats;
  return Math.floor(Math.min(jsa, cap));
}

/** Allmän pensionsavgift (7 % of income up to the ceiling), rounded to nearest 100 kr. SKV_433 7.4. */
export function pensionFee(income: number, p: TaxYearParams): number {
  const f = p.pensionFee;
  if (income < f.minIncome) return 0;
  const fee = Math.min(income, f.baseCeiling) * f.rate;
  // "Avgift som slutar på 50 kr avrundas till närmaste lägre hundratal."
  return Math.abs((fee % 100) - 50) < 1e-6 ? fee - 50 : Math.round(fee / 100) * 100;
}

/** Skattereduktion för förvärvsinkomst on taxable income `bfi`, whole kr. SKV_433 7.5.4. */
export function forvarvsinkomstReduction(bfi: number, p: TaxYearParams): number {
  const r = p.forvarvsinkomstReduction;
  if (bfi > r.maxIncome) return r.max;
  return Math.floor(Math.max(0, bfi - r.from) * r.rate);
}

/** Statlig inkomstskatt: rate on taxable income above the skiktgräns. */
export function stateIncomeTax(income: number, p: TaxYearParams): number {
  const taxable = Math.max(0, income - grundavdrag(income, p));
  return Math.max(0, taxable - p.skiktgrans) * p.stateTaxRate;
}

/** Moms contained in `consumption` (spending incl. moms) for a category mix. */
export function vatInConsumption(consumption: number, mix: VatMix, p: TaxYearParams): number {
  for (const v of Object.values(mix))
    if (!(v >= 0 && v <= 1)) throw new Error('vatMix shares must be between 0 and 1');
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
  const taxable = Math.max(0, gross - ga);
  const statTax = stateIncomeTax(gross, p);
  const kommunalGross = taxable * kommunalskattesats;
  const fee = pensionFee(gross, p);
  const pensionRed = Math.min(fee, statTax + kommunalGross);
  const left = statTax + kommunalGross - pensionRed;
  const jsa = Math.min(jobbskatteavdrag(gross, kommunalskattesats, p), left);
  const forv = Math.min(forvarvsinkomstReduction(taxable, p), left - jsa);
  const employer = gross * (p.employerTotalRate - p.employerPensionRate);
  const kommunalNet = Math.max(0, kommunalGross - jsa - forv - pensionRed);
  const disposableIncome = gross - statTax - kommunalGross + pensionRed + jsa + forv - fee;
  const consumption = Math.max(0, disposableIncome) * consumptionShare;
  const moms = vatInConsumption(consumption, vatMix, p);

  const components: Component[] = [
    {
      id: 'statlig-inkomstskatt',
      label: 'Statlig inkomstskatt',
      explanation: `Den beskattningsbara inkomsten (lönen efter grundavdrag) över ${p.skiktgrans.toLocaleString('sv-SE')} kr beskattas med ${p.stateTaxRate * 100} procent till staten.`,
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
      id: 'skattereduktion-pensionsavgift',
      label: 'Skattereduktion för allmän pensionsavgift',
      explanation:
        'Den allmänna pensionsavgiften på 7 procent går till pensionssystemet, men du får tillbaka lika mycket i skattereduktion som staten bekostar.',
      amount: -pensionRed,
    },
    {
      id: 'skattereduktion-forvarvsinkomst',
      label: 'Skattereduktion för förvärvsinkomst',
      explanation:
        'Staten ger en liten skattereduktion på förvärvsinkomster, högst 1 500 kronor om året, som minskar statens inkomster.',
      amount: -forv,
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
      memo: { kommunalskatt: kommunalGross, kommunalskattEfterAvdrag: kommunalNet },
      assumptions: { consumptionShare, vatMix, kommunalskattesats },
    },
  };
}

/**
 * Effective moms as a share of consumption incl. moms (e.g. 0.114) expressed
 * as a vatMix, for a UI that edits one average percentage: the rest of
 * consumption is split between the standard rate and momsfri. Valid up to the
 * standard rate's share of the price (20 % at 25 % moms).
 */
export function vatMixFromEffectiveRate(rate: number, p: TaxYearParams = getTaxYear()): VatMix {
  const maxRate = p.vat.standard / (1 + p.vat.standard);
  if (!(rate >= 0 && rate <= maxRate)) throw new Error(`effective moms must be 0-${maxRate}`);
  const standard = rate / maxRate;
  return { standard, reduced12: 0, reduced6: 0, exempt: 1 - standard };
}

/**
 * Distribute `total` over `weights` proportionally (e.g. treemap box sizes).
 * Result sums exactly to the rounded total (largest remainder on whole kr)
 * and has the sign of `total` (a negative total gives negative parts).
 * Zero or negative weights get 0; all-zero weights or a zero total give zeros.
 */
export function allocateProportionally(total: number, weights: number[]): number[] {
  const w = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const sum = w.reduce((a, b) => a + b, 0);
  const abs = Math.abs(total);
  if (sum === 0 || !(abs > 0)) return w.map(() => 0);
  const sign = total < 0 ? -1 : 1;
  const exact = w.map((x) => (x / sum) * abs);
  const floors = exact.map(Math.floor);
  let rest = Math.round(abs) - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, i) => ({ i, frac: e - floors[i] }))
    .filter(({ i }) => w[i] > 0)
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; rest > 0 && order.length; k = (k + 1) % order.length, rest--)
    floors[order[k].i]++;
  return floors.map((x) => (x === 0 ? 0 : sign * x));
}
