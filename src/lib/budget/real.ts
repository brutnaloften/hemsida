/**
 * Fasta priser (docs/design/budget-explorer.md P10): converts nominal amounts to the price level of
 * a later year with SCB's consumer price index (annual average, docs/budget-data.md). Pure.
 */

/** KPI annual averages by four-digit year, as in src/data/budget/macro.json. */
export type Kpi = Record<string, number>;

/** Factor that takes an amount in `from` prices to `to` prices: KPI(to) / KPI(from). */
export function kpiFactor(kpi: Kpi, from: number, to: number): number {
  const a = kpi[String(from)];
  const b = kpi[String(to)];
  if (a === undefined || b === undefined)
    throw new Error(`No KPI for ${a === undefined ? from : to}`);
  return b / a;
}

/** `value` of year `from`, expressed in the prices of year `to`. null stays null. */
export function toFixedPrices(
  value: number | null,
  kpi: Kpi,
  from: number,
  to: number,
): number | null {
  return value === null ? null : value * kpiFactor(kpi, from, to);
}
