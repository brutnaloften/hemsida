import type { BudgetEvidence } from '@/schema/promise';

const mn = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 });

/** Swedish display strings for a budget evidence entry; amounts are mn kr, nominal. */
export function formatBudgetChange(e: BudgetEvidence): {
  years: string;
  before: string;
  after: string;
  delta: string;
} {
  const { before, after } = e.amounts;
  const diff = Math.round((after - before) * 10) / 10;
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : '';
  const fmt = (v: number) => `${mn.format(v)} mn kr`;
  return {
    years: `${e.years.from} till ${e.years.to}`,
    before: fmt(before),
    after: fmt(after),
    delta: `${sign}${mn.format(Math.abs(diff))} mn kr, nominellt`,
  };
}
