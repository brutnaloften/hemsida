/**
 * Tax-year parameters for the personal state-budget contribution estimate.
 * Every value below is cited; values marked ASSUMPTION are illustrative
 * defaults, not official figures, and are overridable inputs of the model.
 * To update for a new year, add a new entry to TAX_YEARS and cite the page.
 */

export interface TaxYearParams {
  year: number;
  /** Skiktgräns: taxable income above this is taxed at `stateTaxRate`. */
  skiktgrans: number;
  /** Statlig inkomstskatt rate on taxable income above the skiktgräns. */
  stateTaxRate: number;
  /**
   * Grundavdrag (under 66) that applies at incomes high enough to reach the
   * skiktgräns: the minimum amount, 17 400 kr in 2026. Taxable income =
   * gross - grundavdrag.
   */
  grundavdragHighIncome: number;
  /** Total arbetsgivaravgifter (employees born 1959-2002), on gross salary. */
  employerContributionRate: number;
  /** Moms rates (share of price excl. moms). */
  vat: { standard: number; reduced12: number; reduced6: number };
  /** Average total kommun + region tax rate (NOT state budget; memo only). */
  avgMunicipalTaxRate: number;
  sources: { label: string; url: string }[];
}

export const TAX_YEARS: Record<number, TaxYearParams> = {
  2026: {
    year: 2026,
    skiktgrans: 643_000,
    stateTaxRate: 0.2,
    grundavdragHighIncome: 17_400,
    employerContributionRate: 0.3142,
    vat: { standard: 0.25, reduced12: 0.12, reduced6: 0.06 },
    avgMunicipalTaxRate: 0.3238,
    sources: [
      {
        label:
          'Skatteverket, Belopp och procent inkomstår 2026 (skiktgräns 643 000 kr, 20 % statlig skatt, grundavdrag, arbetsgivaravgift 31,42 %, moms 25/12/6 %)',
        url: 'https://www.skatteverket.se/privat/skatter/beloppochprocent/2026',
      },
      {
        label: 'SCB, Kommunalskatterna 2026 (genomsnittlig kommunal skattesats 32,38 %)',
        url: 'https://www.scb.se/hitta-statistik/statistik-efter-amne/offentlig-ekonomi/finanser-for-den-kommunala-sektorn/kommunalskatterna/pong/statistiknyhet/kommunalskatterna-2026/',
      },
    ],
  },
};

export const LATEST_TAX_YEAR = 2026;

/**
 * ASSUMPTION (not an official figure): share of disposable income spent on
 * consumption; the rest is saved. Overridable.
 */
export const DEFAULT_CONSUMPTION_SHARE = 0.85;

/**
 * ASSUMPTION (not an official figure): how consumption splits over moms
 * categories. `exempt` covers momsfri spending such as housing rent,
 * healthcare and education. Shares must sum to 1. Overridable.
 */
export const DEFAULT_VAT_MIX = { standard: 0.5, reduced12: 0.05, reduced6: 0.15, exempt: 0.3 };
