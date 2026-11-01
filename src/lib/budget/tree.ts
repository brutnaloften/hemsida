/**
 * Compact wire format for the budget trees (docs/design/budget-explorer.md P1, P14): a names file
 * that is the same for every year (id, name, parent, path) and one small file per year with the
 * values in the same order. The island rebuilds the same BudgetNode trees from the two, so it never
 * ships the 600 kB of source data. Pure: no data imports at runtime.
 */
import type { YearTotals } from '@/lib/budget/data';
import { baseOf, type BudgetNode, type BuildOptions } from '@/lib/budget/core';

/**
 * [id, name, parent row (-1 for a root), path, short name]. The path of a root is its full path below
 * budget/ ("stat/utgifter"); every other row stores its path below its root ("9/1-11", "1140-1160"),
 * which keeps the file small.
 */
export type NameRow = [id: string, name: string, parent: number, path: string, short?: string];

export type NamesFile = {
  /** Spending tree in depth-first order, then the revenue tree. Rows 0 and `revenueRoot` are the roots. */
  rows: NameRow[];
  revenueRoot: number;
};

export type YearFile = {
  year: number;
  totals: YearTotals;
  /** Values in the order of NamesFile.rows; null where a node has no value that year. */
  values: (number | null)[];
};

function flatten(root: BudgetNode, base: string, rows: NameRow[], values: (number | null)[]): void {
  const prefix = `${base}budget/`;
  if (!root.href.startsWith(prefix)) throw new Error(`href ${root.href} is not below ${prefix}`);
  const rootPath = root.href.slice(prefix.length).replace(/\/$/, '');
  const walk = (n: BudgetNode, parent: number) => {
    const full = n.href.slice(prefix.length).replace(/\/$/, '');
    let path = full;
    if (parent >= 0) {
      if (!full.startsWith(`${rootPath}/`)) throw new Error(`href ${n.href} is not below its root`);
      path = full.slice(rootPath.length + 1);
    }
    const row: NameRow = [n.id, n.name, parent, path];
    if (n.shortName) row.push(n.shortName);
    const index = rows.push(row) - 1;
    values.push(n.value);
    n.children?.forEach((c) => walk(c, index));
  };
  walk(root, -1);
}

/** Names file and values (same order) for the two trees of one year. */
export function flattenTrees(
  spending: BudgetNode,
  revenue: BudgetNode,
  opts?: BuildOptions,
): { names: NamesFile; values: (number | null)[] } {
  const base = baseOf(opts);
  const rows: NameRow[] = [];
  const values: (number | null)[] = [];
  flatten(spending, base, rows, values);
  const revenueRoot = rows.length;
  flatten(revenue, base, rows, values);
  return { names: { rows, revenueRoot }, values };
}

/** Rebuild the spending and revenue trees for the year of `file`. Inverse of flattenTrees. */
export function treesFromFiles(
  names: NamesFile,
  file: YearFile,
  opts?: BuildOptions,
): { spending: BudgetNode; revenue: BudgetNode; byId: Map<string, BudgetNode> } {
  if (file.values.length !== names.rows.length) throw new Error('Year file does not match names');
  const base = baseOf(opts);
  const nodes = names.rows.map(([id, name, parent, path, short], i): BudgetNode => {
    const rootRow = i >= names.revenueRoot ? names.revenueRoot : 0;
    const full = parent < 0 ? path : `${names.rows[rootRow][3]}/${path}`;
    return {
      id,
      name,
      ...(short ? { shortName: short } : {}),
      href: `${base}budget/${full}/`,
      value: file.values[i],
    };
  });
  names.rows.forEach(([, , parent], i) => {
    if (parent < 0) return;
    const p = nodes[parent];
    (p.children ??= []).push(nodes[i]);
    p.kind = 'group';
  });
  for (const n of nodes) n.kind ??= 'leaf';
  return {
    spending: nodes[0],
    revenue: nodes[names.revenueRoot],
    byId: new Map(nodes.map((n) => [n.id, n])),
  };
}
