/**
 * Tax-year parameters for the personal state-budget contribution estimate.
 * Every value below is cited; values marked ASSUMPTION are illustrative
 * defaults, not official figures, and are overridable inputs of the model.
 * To update for a new year, add a new entry to TAX_YEARS and cite the pages.
 *
 * Primary sources (all checked 2026-11-01):
 * - SKV_BELOPP: Skatteverket, Belopp och procent inkomstår 2026
 *   https://www.skatteverket.se/privat/skatter/beloppochprocent/2026
 * - SKV_433: Skatteverket, Teknisk beskrivning SKV 433 utgåva 36 (skattetabeller 2026),
 *   section 6 "Grundavdrag" and 7.5.2 "Skattereduktion för arbetsinkomst" (jobbskatteavdrag)
 *   https://www.skatteverket.se/download/18.1522bf3f19aea8075ba55c/1766385913260/teknisk-beskrivning-skv-433-2026-utgava-36.pdf
 * - SKV_AVGIFTER: Skatteverket, Arbetsgivaravgifter (2026 table)
 *   https://skatteverket.se/arbetsgivaravgifter
 * - SCB_KOMMUNALSKATT: SCB, Kommunalskatterna 2026
 */

export interface TaxYearParams {
  year: number;
  /** Prisbasbelopp (kr). SKV_BELOPP. */
  pbb: number;
  /** Skiktgräns: taxable income above this is taxed at `stateTaxRate`. SKV_BELOPP. */
  skiktgrans: number;
  /** Statlig inkomstskatt rate on taxable income above the skiktgräns. SKV_BELOPP. */
  stateTaxRate: number;
  /** Total arbetsgivaravgifter (born 1959 or later), on gross salary. SKV_AVGIFTER. */
  employerTotalRate: number;
  /**
   * Ålderspensionsavgift part of the above. It is paid to the AP funds, which
   * are outside the state budget, so it is excluded from the state's part.
   * SKV_AVGIFTER.
   */
  employerPensionRate: number;
  /**
   * Allmän pensionsavgift: rate, ceiling of the fee base (8,07 inkomstbasbelopp
   * x 83 400 = 673 038 kr) and the income below which no fee is charged
   * (0,423 PBB). The fee goes to the AP funds but is fully offset by
   * skattereduktion för allmän pensionsavgift, which the state bears (titel
   * 1141). SKV_433 7.4 and 7.5.1.
   */
  pensionFee: { rate: number; baseCeiling: number; minIncome: number };
  /**
   * Skattereduktion för förvärvsinkomst (titel 1162): 0,75 % of taxable income
   * above `from`, up to `maxIncome` where the maximum `max` is reached.
   * SKV_433 7.5.4.
   */
  forvarvsinkomstReduction: { rate: number; from: number; maxIncome: number; max: number };
  /** Moms rates (share of price excl. moms). SKV_BELOPP. */
  vat: { standard: number; reduced12: number; reduced6: number };
  /**
   * Average kommun + region tax rate, EXCLUDING begravningsavgift and avgift
   * till trossamfund (SCB reports those separately). Same unit as SKV_433's
   * "KI" in the jobbskatteavdrag formula, i.e. SKV's combined rate minus its
   * 1,16 pp for those fees. SCB_KOMMUNALSKATT.
   */
  avgKommunalskattesats: number;
  sources: { label: string; url: string }[];
}

export const TAX_YEARS: Record<number, TaxYearParams> = {
  2026: {
    year: 2026,
    pbb: 59_200,
    skiktgrans: 643_000,
    stateTaxRate: 0.2,
    employerTotalRate: 0.3142,
    employerPensionRate: 0.1021,
    pensionFee: { rate: 0.07, baseCeiling: 673_038, minIncome: 25_042 },
    forvarvsinkomstReduction: { rate: 0.0075, from: 40_000, maxIncome: 240_000, max: 1_500 },
    vat: { standard: 0.25, reduced12: 0.12, reduced6: 0.06 },
    avgKommunalskattesats: 0.3238,
    sources: [
      {
        label: 'Skatteverket, Belopp och procent inkomstår 2026',
        url: 'https://www.skatteverket.se/privat/skatter/beloppochprocent/2026',
      },
      {
        label:
          'Skatteverket, Teknisk beskrivning SKV 433 utgåva 36 (grundavdrag, jobbskatteavdrag 2026)',
        url: 'https://www.skatteverket.se/download/18.1522bf3f19aea8075ba55c/1766385913260/teknisk-beskrivning-skv-433-2026-utgava-36.pdf',
      },
      {
        label: 'Skatteverket, Arbetsgivaravgifter',
        url: 'https://skatteverket.se/arbetsgivaravgifter',
      },
      {
        label: 'SCB, Kommunalskatterna 2026 (genomsnitt 32,38 %)',
        url: 'https://www.scb.se/hitta-statistik/statistik-efter-amne/offentlig-ekonomi/finanser-for-den-kommunala-sektorn/kommunalskatterna/pong/statistiknyhet/kommunalskatterna-2026/',
      },
    ],
  },
};

/**
 * Grundavdrag (under 66) and jobbskatteavdrag (under 66) shapes, in
 * prisbasbelopp (PBB) multiples. SKV_433 for 2026; assumed unchanged in
 * shape for other years until their entry says otherwise (add a per-year
 * override to TaxYearParams if the rules change).
 */
export const GRUNDAVDRAG_RULES = {
  /** Up to this income: `floorPbb` (0,423 PBB). */
  lowIncomePbb: 0.99,
  floorPbb: 0.423,
  /** 0,99-2,72 PBB: floor + 20 % of income above 0,99 PBB. */
  risingUntilPbb: 2.72,
  risingRate: 0.2,
  /** 2,72-3,11 PBB: flat 0,77 PBB. */
  maxPbb: 0.77,
  flatUntilPbb: 3.11,
  /** 3,11-7,88 PBB: 0,77 PBB minus 10 % of income above 3,11 PBB. */
  fallingUntilPbb: 7.88,
  fallingRate: 0.1,
  /** Above 7,88 PBB: 0,293 PBB. */
  highIncomePbb: 0.293,
} as const;

export const JOBBSKATTEAVDRAG_RULES = {
  /** Brackets of earned income in PBB with the base amount (PBB) at the start and the marginal rate. */
  b1Pbb: 0.91,
  b2Pbb: 3.24,
  b3Pbb: 8.08,
  rate2: 0.3874,
  rate3: 0.251,
  /** 1,813 PBB at 3,24 PBB, 3,027 PBB above 8,08 PBB. */
  base3Pbb: 1.813,
  topPbb: 3.027,
} as const;

/** Preferred year when none is asked for. */
export const LATEST_TAX_YEAR = 2026;

/**
 * ASSUMPTION (not an official figure): share of disposable income spent on
 * consumption; the rest is saved. 85 % is a rounded illustrative value that
 * implies 15 % saving; it is not derived from SCB or other statistics.
 * Overridable.
 */
export const DEFAULT_CONSUMPTION_SHARE = 0.85;

/**
 * ASSUMPTION (not an official figure): how consumption splits over moms
 * categories. `exempt` covers momsfri spending such as housing rent,
 * healthcare and education. Shares must each be in [0, 1] and sum to 1. The
 * default implies an average moms of about 11,4 % of consumption (incl. moms).
 * Overridable.
 */
export const DEFAULT_VAT_MIX = { standard: 0.5, reduced12: 0.05, reduced6: 0.15, exempt: 0.3 };
