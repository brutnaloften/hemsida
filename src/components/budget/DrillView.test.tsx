// @vitest-environment jsdom
import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DrillView } from '@/components/budget/DrillView';
import type { BudgetNode } from '@/lib/budget/core';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const leaf = (id: string, name: string, value: number): BudgetNode => ({
  id,
  name,
  href: `/budget/stat/inkomster/${id}/`,
  value,
  kind: 'leaf',
});
const root: BudgetNode = {
  id: 'rev:skatter',
  name: 'Skatter',
  href: '/budget/stat/inkomster/skatter/',
  value: 1000,
  kind: 'group',
  children: [leaf('rev:1100', 'Skatt på inkomst', 600), leaf('rev:1200', 'Skatt på kapital', 400)],
};

let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(() => host.remove());

async function render(total: number | null) {
  const r = createRoot(host);
  await act(async () =>
    r.render(
      <DrillView
        node={root}
        side="inkomster"
        year={2026}
        sideTotal={1000}
        crumbs={[]}
        years={[]}
        preliminary={false}
        onYear={() => {}}
        onOpen={() => {}}
        onCrumb={() => {}}
        h1Ref={createRef()}
        personal={{ panel: null, total }}
      />,
    ),
  );
  return r;
}

describe('DrillView revenue side in kr mode', () => {
  it('shows Din del per box when a salary estimate is applied', async () => {
    const r = await render(100_000);
    expect(
      host.querySelector('a[aria-label^="Skatt på inkomst"]')?.getAttribute('aria-label'),
    ).toMatch(/Din del: ungefär 60\s000 kronor per år$/);
    expect(host.textContent).toContain('≈ 60');
    expect(host.textContent).toContain('Din del (kr)');
    await act(async () => r.unmount());
  });

  it('stays in percent without an estimate', async () => {
    const r = await render(null);
    expect(host.textContent).not.toContain('Din del');
    await act(async () => r.unmount());
  });
});
