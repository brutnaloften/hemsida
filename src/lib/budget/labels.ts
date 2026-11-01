/**
 * Swedish labels for the budget explorer: short box names and the fixed names of synthetic nodes
 * (docs/design/budget-explorer.md P0, P4). Short names are for box labels only; the full official
 * name is used in tooltips, headers and tables. Revenue explanations are a separate bead (rn4.5).
 */

/** Hand-written short names for the longest utgiftsområde names, keyed by UO number. */
export const UO_SHORT_NAMES: Readonly<Record<number, string>> = {
  2: 'Samhällsekonomi och finans',
  6: 'Försvar och krisberedskap',
  9: 'Hälsovård och social omsorg',
  10: 'Sjukdom och funktionsnedsättning',
  12: 'Familjer och barn',
  16: 'Utbildning och forskning',
  17: 'Kultur, medier och fritid',
  18: 'Bostäder och samhällsplanering',
  23: 'Areella näringar och landsbygd',
  25: 'Bidrag till kommuner',
  27: 'Avgift till EU',
};

/** Short name for a node id ("uo:18"), or undefined when the full name should be used. */
export function shortNameForId(id: string): string | undefined {
  const m = /^uo:(\d+)$/.exec(id);
  return m ? UO_SHORT_NAMES[Number(m[1])] : undefined;
}

export const LABELS = {
  skatterNetto: 'Skatter, netto',
  saldoUnderskott: 'Underskott',
  saldoOverskott: 'Överskott',
  /** Övriga poster that are positive: shown on the utgifter side. */
  ovrigaUtgift: 'Övriga poster (lån och kassamässiga justeringar)',
  /** Negative övriga poster: shown on the inkomster side (resolved decision Q2). */
  ovrigaMinskar: 'Övriga poster (minskar utgifterna)',
  stripHeading: 'Dras av',
} as const;

/** "Mindre poster (18 st)". */
export function smallerLabel(count: number): string {
  return `Mindre poster (${count} st)`;
}
