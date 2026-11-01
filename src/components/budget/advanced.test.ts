import { describe, expect, it } from 'vitest';
import { advancedColumns } from '@/components/budget/advanced';
import { buildAdvancedFile } from '@/lib/budget/advanced-data';
import { flattenTrees } from '@/lib/budget/tree';
import { buildRevenueTree, buildSpendingTree } from '@/lib/budget/view';
import { formatNumber } from '@/lib/budget/format';
import type { BudgetNode } from '@/lib/budget/core';

const file = buildAdvancedFile();
const { names } = flattenTrees(buildSpendingTree(2025), buildRevenueTree(2025));
const index = new Map(names.rows.map((r, i) => [r[0], i]));
const rowOf = (id: string) => index.get(id);
const node = (id: string) => ({ id }) as BudgetNode;
const mdkr = (mnKr: number) => formatNumber(mnKr / 1000, 1);

describe('advancedColumns', () => {
  it('gives spending four columns and revenue two', () => {
    const spending = advancedColumns(file, rowOf, 2025, false, 'utgifter', 'uo:9');
    expect(spending.map((c) => c.label)).toEqual([
      'Statens budget',
      'Ändringsbudgetar',
      'Utfall',
      'Skillnad mot budget',
    ]);
    const revenue = advancedColumns(file, rowOf, 2025, false, 'inkomster', null);
    expect(revenue.map((c) => c.label)).toEqual(['Statens budget', 'Utfall']);
  });

  it('computes skillnad as utfall minus budget and ändringsbudgetar', () => {
    const cols = advancedColumns(file, rowOf, 2025, false, 'utgifter', 'uo:9');
    const i = file.years.indexOf(2025);
    const row = rowOf('uo:9')!;
    const diff = file.utfall[row][i]! - file.budget[row]![i]! - (file.andrad[row]![i] ?? 0);
    expect(cols[3].cell(node('uo:9'))).toBe(mdkr(diff));
    expect(cols[3].total).toBe(mdkr(diff));
  });

  it('shows a dash for rows without data and labels fixed prices', () => {
    const cols = advancedColumns(file, rowOf, 2020, true, 'both', null);
    expect(cols[0].label).toBe('Statens budget, fasta priser');
    expect(cols[0].cell(node('saldo'))).toBe('–');
    // Revenue has no ändringsbudget, so no skillnad either.
    expect(cols[3].cell(node('rev:skatter'))).toBe('–');
  });

  it('scales earlier years to the latest price level when fixed', () => {
    const row = rowOf('root:utgifter')!;
    const i = file.years.indexOf(2020);
    const fixed = advancedColumns(file, rowOf, 2020, true, 'utgifter', null)[2];
    expect(fixed.cell(node('root:utgifter'))).toBe(mdkr(file.utfall[row][i]! * (417.98 / 335.92)));
  });
});
