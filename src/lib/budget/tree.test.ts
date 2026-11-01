import { describe, expect, it } from 'vitest';
import { totalsForYear, years } from '@/lib/budget/data';
import { balanceFrom, withoutChildren } from '@/lib/budget/core';
import { buildBalance, buildRevenueTree, buildSpendingTree } from '@/lib/budget/view';
import { flattenTrees, treesFromFiles, type YearFile } from '@/lib/budget/tree';

const opts = { base: '/hemsida/' };

function roundTrip(year: number) {
  const { names } = flattenTrees(buildSpendingTree(2025, opts), buildRevenueTree(2025, opts), opts);
  const { values } = flattenTrees(
    buildSpendingTree(year, opts),
    buildRevenueTree(year, opts),
    opts,
  );
  const file: YearFile = { year, totals: totalsForYear(year), values };
  // Through JSON, as the browser receives it.
  return treesFromFiles(JSON.parse(JSON.stringify(names)), JSON.parse(JSON.stringify(file)), opts);
}

describe('names and year files', () => {
  it.each([2008, 2020, 2022, 2025])('rebuild the trees of %i exactly', (year) => {
    const { spending, revenue } = roundTrip(year);
    expect(spending).toEqual(buildSpendingTree(year, opts));
    expect(revenue).toEqual(buildRevenueTree(year, opts));
  });

  it('give the same balance view as the data-backed one for every year', () => {
    for (const year of years) {
      const { spending, revenue } = roundTrip(year);
      expect(balanceFrom(year, totalsForYear(year), spending, revenue, opts)).toEqual(
        buildBalance(year, opts),
      );
    }
  });

  it('report a surplus in 2022 and a deficit in 2020', () => {
    expect(buildBalance(2022, opts).saldo.name).toBe('Överskott');
    expect(buildBalance(2020, opts).saldo.name).toBe('Underskott');
  });

  it('slims the balance for island props without changing what is drawn', () => {
    const full = buildBalance(2025, opts);
    const slim = withoutChildren(full);
    expect(JSON.stringify(slim)).not.toContain('"children"');
    expect(JSON.stringify(slim).length).toBeLessThan(JSON.stringify(full).length / 10);
    expect(slim.out.items.map((n) => [n.id, n.value])).toEqual(
      full.out.items.map((n) => [n.id, n.value]),
    );
  });
});
