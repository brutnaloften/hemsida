// @vitest-environment jsdom
import { act, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  INITIAL_SALARY_STATE,
  SalaryPanel,
  type SalaryState,
} from '@/components/budget/SalaryPanel';
import { estimateFor } from '@/lib/budget/salary-view';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness({ year }: { year: number }) {
  const [state, setState] = useState<SalaryState>({ ...INITIAL_SALARY_STATE, open: true });
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

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('SalaryPanel', () => {
  it('shows the estimate with the honesty copy and keeps the salary out of URL and storage', async () => {
    const root = createRoot(host);
    await act(async () => root.render(<Harness year={2026} />));
    const input = host.querySelector<HTMLInputElement>('input[inputmode="numeric"]')!;
    await act(async () => type(input, '41 237'));
    await act(async () => host.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());

    const status = host.querySelector('[role="status"]')!;
    expect(status.textContent).toMatch(/^Ungefär .* per år av det du och din arbetsgivare/);
    expect(host.textContent).toContain('Det här är en grov uppskattning, inte din faktiska skatt.');
    expect(host.textContent).toContain('Vi sparar ingenting');
    expect(host.textContent).toContain('Arbetsgivaravgifter (statens del)');

    const needles = ['41237', '41 237', '494844', '494 844'];
    const hay = [
      window.location.href,
      JSON.stringify({ ...localStorage }),
      JSON.stringify({ ...sessionStorage }),
    ].join('\n');
    for (const n of needles) expect(hay).not.toContain(n);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);

    await act(async () =>
      [...host.querySelectorAll('button')].find((b) => b.textContent === 'Rensa')!.click(),
    );
    expect(host.querySelector('[role="status"]')!.textContent).toBe('');
    expect(input.value).toBe('');
    await act(async () => root.unmount());
  });

  it('lets the assumptions be edited', async () => {
    const root = createRoot(host);
    await act(async () => root.render(<Harness year={2026} />));
    const [salary, consumption] = [...host.querySelectorAll<HTMLInputElement>('input')];
    await act(async () => type(salary, '40000'));
    await act(async () => host.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
    const before = host.querySelector('[role="status"]')!.textContent;
    await act(async () => type(consumption, '0'));
    expect(host.querySelector('[role="status"]')!.textContent).not.toBe(before);
    await act(async () => root.unmount());
  });
});
