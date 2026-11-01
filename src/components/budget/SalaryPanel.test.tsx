// @vitest-environment jsdom
import { act, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SalaryPanel, usePersistedSalary } from '@/components/budget/SalaryPanel';
import { SALARY_STORAGE_KEY } from '@/lib/budget/salary-storage';
import { estimateFor } from '@/lib/budget/salary-view';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness({ year, navKey = 'a' }: { year: number; navKey?: string }) {
  const [state, setState] = usePersistedSalary(navKey);
  const estimate = useMemo(
    () =>
      state.applied === null
        ? null
        : estimateFor({ ...state.inputs, monthly: state.applied }, year),
    [state, year],
  );
  return <SalaryPanel state={state} onChange={setState} estimate={estimate} year={year} />;
}

let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  host.remove();
});

async function openPanel() {
  await act(async () =>
    [...host.querySelectorAll('button')].find((b) => b.textContent === 'Vad betalar jag?')!.click(),
  );
}

function expanded() {
  return host.querySelector('button[aria-controls]')!.getAttribute('aria-expanded');
}

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('SalaryPanel', () => {
  it('shows the estimate with the honesty copy and keeps the salary out of the URL and sessionStorage', async () => {
    const root = createRoot(host);
    await act(async () => root.render(<Harness year={2026} />));
    await openPanel();
    const input = host.querySelector<HTMLInputElement>('input[inputmode="numeric"]')!;
    await act(async () => type(input, '41 237'));
    await act(async () => host.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());

    const status = host.querySelector('[role="status"]')!;
    expect(status.textContent).toMatch(/^Ungefär .* per år av det du och din arbetsgivare/);
    expect(host.textContent).toContain('Det här är en grov uppskattning, inte din faktiska skatt.');
    expect(host.textContent).toMatch(
      /Uppgiften\s+sparas bara i din webbläsare på den här enheten och skickas aldrig någonstans\.\s+Knappen\s+Rensa tar bort den\./,
    );
    expect(host.textContent).toContain('Arbetsgivaravgifter (statens del)');

    const needles = ['41237', '41 237', '494844', '494 844'];
    const hay = [window.location.href, JSON.stringify({ ...sessionStorage })].join('\n');
    for (const n of needles) expect(hay).not.toContain(n);
    expect(sessionStorage.length).toBe(0);
    expect(Object.keys(localStorage)).toEqual([SALARY_STORAGE_KEY]);

    await act(async () =>
      [...host.querySelectorAll('button')].find((b) => b.textContent === 'Rensa')!.click(),
    );
    expect(host.querySelector('[role="status"]')!.textContent).toBe('');
    expect(input.value).toBe('');
    expect(localStorage.length).toBe(0);
    await act(async () => root.unmount());
  });

  it('restores the estimate after a remount (leaf navigation) with the panel collapsed', async () => {
    let root = createRoot(host);
    await act(async () => root.render(<Harness year={2026} />));
    await openPanel();
    await act(async () =>
      type(host.querySelector<HTMLInputElement>('input[inputmode="numeric"]')!, '41237'),
    );
    await act(async () => host.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
    const before = host.querySelector('[role="status"]')!.textContent;
    expect(before).toMatch(/^Ungefär/);
    await act(async () => root.unmount());

    host.replaceChildren();
    root = createRoot(host);
    await act(async () => root.render(<Harness year={2026} />));
    expect(expanded()).toBe('false');
    expect(host.querySelector('[role="status"]')!.textContent).toBe(before);
    expect(host.querySelector<HTMLInputElement>('input[inputmode="numeric"]')!.value).toBe('41237');
    await act(async () => root.unmount());
  });

  it('collapses when the view changes but keeps the estimate', async () => {
    const root = createRoot(host);
    await act(async () => root.render(<Harness year={2026} navKey="a" />));
    await openPanel();
    expect(expanded()).toBe('true');
    await act(async () => root.render(<Harness year={2026} navKey="b" />));
    expect(expanded()).toBe('false');
    await act(async () => root.unmount());
  });

  it('ignores corrupt or old stored values', async () => {
    for (const bad of ['{not json', '"x"', '{"monthly":5}', '{"monthly":"1","consumption":"85"}']) {
      localStorage.setItem(SALARY_STORAGE_KEY, bad);
      const root = createRoot(host);
      await act(async () => root.render(<Harness year={2026} />));
      expect(host.querySelector<HTMLInputElement>('input[inputmode="numeric"]')!.value).toBe('');
      expect(host.querySelector('[role="status"]')!.textContent).toBe('');
      await act(async () => root.unmount());
      host.replaceChildren();
    }
  });

  it('lets the assumptions be edited', async () => {
    const root = createRoot(host);
    await act(async () => root.render(<Harness year={2026} />));
    await openPanel();
    const [salary, consumption] = [...host.querySelectorAll<HTMLInputElement>('input')];
    await act(async () => type(salary, '40000'));
    await act(async () => host.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
    const before = host.querySelector('[role="status"]')!.textContent;
    await act(async () => type(consumption, '0'));
    expect(host.querySelector('[role="status"]')!.textContent).not.toBe(before);
    await act(async () => root.unmount());
  });
});
