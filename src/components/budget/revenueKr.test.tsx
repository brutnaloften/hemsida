// @vitest-environment jsdom
import { act, createRef, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BalanceView } from '@/components/budget/BalanceView';
import { DrillView } from '@/components/budget/DrillView';
import { LeafView } from '@/components/budget/LeafView';
import type { Personal } from '@/components/budget/types';
import { balanceFrom, type BudgetNode } from '@/lib/budget/core';
import { DEFAULT_INPUTS, estimateFor, revenuePartOf } from '@/lib/budget/salary-view';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const node = (id: string, name: string, value: number, kind: 'group' | 'leaf'): BudgetNode => ({
  id,
  name,
  href: `/budget/stat/inkomster/${id.replace(':', '-')}/`,
  value,
  kind,
});
// Gross huvudgrupper (sum 2 000) are larger than the net side total (1 000), like the real data.
const skatter: BudgetNode = {
  ...node('rev:skatter', 'Skatter, netto', 1000, 'group'),
  children: [
    node('rev:1100', 'Skatt på inkomst', 900, 'group'),
    node('rev:1200', 'Socialavgifter', 500, 'group'),
    node('rev:1300', 'Skatt på kapital', 300, 'group'),
    node('rev:1400', 'Skatt på konsumtion', 300, 'group'),
  ],
};
const SIDE_TOTAL = 1000;

const breakdown = estimateFor({ ...DEFAULT_INPUTS, monthly: '40000' }, 2026)!.breakdown;
const personal = (on: boolean, period: Personal['period'] = 'year'): Personal => ({
  panel: null,
  period,
  total: on ? breakdown.total : null,
  revenue: on ? (id) => revenuePartOf(breakdown, id) : null,
});

let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(() => host.remove());

async function render(el: ReactElement) {
  const r = createRoot(host);
  await act(async () => r.render(el));
  return r;
}
const label = (name: string) =>
  host.querySelector(`a[aria-label^="${name}:"]`)?.getAttribute('aria-label') ?? '';
const noop = () => {};
const common = {
  crumbs: [],
  years: [],
  onYear: noop,
  onOpen: noop,
  onCrumb: noop,
  h1Ref: createRef<HTMLHeadingElement>(),
};

describe('revenue boxes in kr mode', () => {
  it('DrillView: only covered boxes get a kr figure, from the breakdown', async () => {
    const r = await render(
      <DrillView
        {...common}
        node={skatter}
        side="inkomster"
        year={2026}
        sideTotal={SIDE_TOTAL}
        preliminary={false}
        personal={personal(true)}
      />,
    );
    expect(label('Skatt på inkomst')).toContain('Din del:');
    expect(label('Socialavgifter')).toContain('Din del:');
    expect(label('Skatt på konsumtion')).toContain('Din del:');
    // 1300 is not covered by the estimate: percent only, no pro rata share.
    expect(label('Skatt på kapital')).not.toContain('Din del');
    expect(label('Skatt på kapital')).toContain('procent');
    // The three boxes add up to the breakdown total, not to twice it.
    const sum = ['rev:1100', 'rev:1200', 'rev:1400'].reduce(
      (s, id) => s + revenuePartOf(breakdown, id)!,
      0,
    );
    expect(sum).toBeCloseTo(breakdown.total);
    await act(async () => r.unmount());
  });

  it('DrillView: stays in percent without an estimate', async () => {
    const r = await render(
      <DrillView
        {...common}
        node={skatter}
        side="inkomster"
        year={2026}
        sideTotal={SIDE_TOTAL}
        preliminary={false}
        personal={personal(false)}
      />,
    );
    expect(host.innerHTML).not.toContain('Din del');
    await act(async () => r.unmount());
  });

  it('BalanceView: Skatter netto shows kr, uncovered boxes and saldo do not', async () => {
    const spending: BudgetNode = {
      id: 'root:utgifter',
      name: 'Utgifter',
      href: '/u/',
      value: 1100,
      kind: 'group',
      children: [node('uo:1', 'Rikets styrelse', 1100, 'group')],
    };
    const revenue: BudgetNode = {
      id: 'root:inkomster',
      name: 'Inkomster',
      href: '/i/',
      value: 1100,
      kind: 'group',
      children: [skatter, node('rev:2000', 'Statens verksamhet', 100, 'group')],
    };
    const balance = balanceFrom(
      2026,
      { utgifter: 1200, inkomster: 1100, saldo: -100 } as never,
      spending,
      revenue,
    );
    const r = await render(
      <BalanceView
        {...common}
        balance={balance}
        years={[]}
        preliminary={false}
        personal={personal(true)}
      />,
    );
    expect(label('Skatter, netto')).toContain('Din del:');
    expect(label('Statens verksamhet')).not.toContain('Din del');
    expect(label('Rikets styrelse')).toContain('Din del:');
    const saldo = [...host.querySelectorAll('[aria-label]')].find((e) =>
      e.getAttribute('aria-label')?.startsWith(balance.saldo.name),
    );
    expect(saldo?.getAttribute('aria-label') ?? '').not.toContain('Din del');
    await act(async () => r.unmount());
  });

  it('LeafView: a covered revenue leaf shows Din del, an uncovered one does not', async () => {
    for (const [n, expected] of [
      [node('rev:1400', 'Skatt på konsumtion', 300, 'leaf'), true],
      [node('rev:1300', 'Skatt på kapital', 300, 'leaf'), false],
    ] as const) {
      const r = await render(
        <LeafView
          {...common}
          node={n}
          parent={skatter}
          side="inkomster"
          year={2026}
          sideTotal={SIDE_TOTAL}
          personal={personal(true)}
        />,
      );
      expect(host.textContent?.includes('Din del:')).toBe(expected);
      await act(async () => r.unmount());
    }
  });

  it('per månad: aria text, table header, and the leaf use the monthly amount', async () => {
    const monthly = (id: string) => (revenuePartOf(breakdown, id) ?? 0) / 12;
    const p: Personal = {
      panel: null,
      period: 'month',
      total: breakdown.total / 12,
      revenue: (id) => (revenuePartOf(breakdown, id) === null ? null : monthly(id)),
    };
    let r = await render(
      <DrillView
        {...common}
        node={skatter}
        side="inkomster"
        year={2026}
        sideTotal={SIDE_TOTAL}
        preliminary={false}
        personal={p}
      />,
    );
    expect(label('Skatt på konsumtion')).toContain('per månad');
    expect(label('Skatt på konsumtion')).not.toContain('per år');
    expect(host.textContent).toContain('Din del (kr per månad)');
    await act(async () => r.unmount());

    r = await render(
      <LeafView
        {...common}
        node={node('rev:1400', 'Skatt på konsumtion', 300, 'leaf')}
        parent={skatter}
        side="inkomster"
        year={2026}
        sideTotal={SIDE_TOTAL}
        personal={p}
      />,
    );
    expect(host.textContent).toMatch(/Din del: ≈\s[\d\s]+\skr per månad/);
    await act(async () => r.unmount());
  });
});
