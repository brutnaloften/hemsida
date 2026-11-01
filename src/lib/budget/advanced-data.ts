/**
 * Builds advanced.json for the budget explorer (docs/design/budget-explorer.md P10): per node and
 * year the outcome, statens budget and ändringsbudgetar, the codes to show, KPI and GDP. Rows follow
 * names.json (flattenTrees of the latest year). Data-backed, so only the static endpoint imports it.
 */
import macroJson from '@/data/budget/macro.json';
import { macroSchema } from '@/schema/macro';
import type { Series } from '@/schema/budget';
import {
  anslagForUo,
  areas,
  latestYear,
  meta,
  revenueHuvudgrupper,
  revenueTitelgrupper,
  revenueTitlar,
  revenueTyper,
  totalsForYear,
  years,
} from '@/lib/budget/data';
import { round1 } from '@/lib/budget/core';
import { buildRevenueTree, buildSpendingTree, SKATTER_TYPER } from '@/lib/budget/view';
import { flattenTrees } from '@/lib/budget/tree';
import type { AdvancedFile, YearSeries } from '@/lib/budget/series';

const macro = macroSchema.parse(macroJson);

/** Sum of series per year; null where every series is null (no value is not zero). */
export function sumSeries(list: Series[]): YearSeries {
  return years.map((_, i) => {
    const present = list.map((s) => s[i]).filter((v): v is number => v !== null && v !== undefined);
    return present.length ? round1(present.reduce((a, b) => a + b, 0)) : null;
  });
}

type Pair = { budget: YearSeries | null; andrad: YearSeries | null };

/** Budget and ändringsbudget series by node id, for every node that can have one. */
function budgetSeries(): Map<string, Pair> {
  const out = new Map<string, Pair>();
  const uoPairs: Pair[] = [];
  for (const u of areas) {
    const anslag = anslagForUo(u.nr);
    for (const a of anslag) out.set(`anslag:${a.kod}`, { budget: a.budget, andrad: a.andrad });
    const pair = {
      budget: sumSeries(anslag.map((a) => a.budget)),
      andrad: sumSeries(anslag.map((a) => a.andrad)),
    };
    out.set(`uo:${u.nr}`, pair);
    uoPairs.push(pair);
  }
  out.set('root:utgifter', {
    budget: sumSeries(uoPairs.map((p) => p.budget as Series)),
    andrad: sumSeries(uoPairs.map((p) => p.andrad as Series)),
  });

  const rev = (list: typeof revenueTitlar): Pair => ({
    budget: sumSeries(list.map((t) => t.budget)),
    andrad: null,
  });
  for (const t of revenueTitlar) out.set(`rev:${t.kod}`, rev([t]));
  for (const g of revenueTitelgrupper)
    out.set(`rev:${g.kod}`, rev(revenueTitlar.filter((t) => t.titelgrupp === g.kod)));
  for (const h of revenueHuvudgrupper)
    out.set(`rev:${h.kod}`, rev(revenueTitlar.filter((t) => t.huvudgrupp === h.kod)));
  const inTyp = (typ: string) =>
    revenueTitlar.filter(
      (t) => revenueHuvudgrupper.find((h) => h.kod === t.huvudgrupp)?.typ === typ,
    );
  for (const typ of revenueTyper) out.set(`rev:${typ.kod}`, rev(inTyp(typ.kod)));
  // Nets the same typ as the outcome (1000 + 7000 + 8000, so the avgående poster of typ 7000 are
  // deducted from the budget too); checked for 2025: budget 1 247,8 mdkr vs utfall 1 193,9 mdkr is a
  // real difference, not a netting mismatch.
  out.set('rev:skatter', rev(SKATTER_TYPER.flatMap(inTyp)));
  out.set('root:inkomster', rev(revenueTitlar));
  return out;
}

function codeOf(id: string): string | null {
  let m = /^uo:(\d+)$/.exec(id);
  if (m) return `Utgiftsområde ${m[1]}`;
  m = /^anslag:(.+)$/.exec(id);
  if (m) {
    const kod = m[1];
    const a = anslagForUo(Number(kod.slice(0, 2))).find((x) => x.kod === kod);
    return a?.beteckning ? `Anslag ${a.beteckning}, ESV-kod ${kod}` : `ESV-kod ${kod}`;
  }
  m = /^rev:(\d{4}(?:-\d{4})?)$/.exec(id);
  if (m) return `Inkomsttitel ${m[1]}`;
  return null;
}

export function buildAdvancedFile(): AdvancedFile {
  const { names } = flattenTrees(buildSpendingTree(latestYear), buildRevenueTree(latestYear));
  const perYear = years.map((y) => flattenTrees(buildSpendingTree(y), buildRevenueTree(y)).values);
  const budgets = budgetSeries();
  const ids = names.rows.map((r) => r[0]);
  const totals = years.map(totalsForYear);
  return {
    years: [...years],
    preliminary: {
      utgifter: years.map((y) => meta.yearStatus.expenditure[String(y)] !== 'final'),
      inkomster: years.map((y) => meta.yearStatus.revenue[String(y)] !== 'final'),
    },
    totals: { utgifter: totals.map((t) => t.utgifter), inkomster: totals.map((t) => t.inkomster) },
    kpi: macro.kpi.values,
    bnp: years.map((y) => macro.bnp.values[String(y)] ?? null),
    utfall: ids.map((_, row) => perYear.map((values) => values[row])),
    budget: ids.map((id) => budgets.get(id)?.budget ?? null),
    andrad: ids.map((id) => budgets.get(id)?.andrad ?? null),
    codes: ids.map(codeOf),
  };
}
