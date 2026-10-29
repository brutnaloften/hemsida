import { describe, expect, it } from 'vitest';
import type { BudgetEvidence } from '@/schema/promise';
import { formatBudgetChange } from '@/lib/budget-evidence';

const base: BudgetEvidence = {
  kind: 'budget',
  anslag: { kod: '0901011', namn: 'Test', release: 2025 },
  years: { from: 2022, to: 2025 },
  amounts: { before: 100, after: 150.5 },
  date: '2025-09-22',
  relevance: 'full',
  note: null,
};

describe('formatBudgetChange', () => {
  it('formats an increase', () => {
    const c = formatBudgetChange(base);
    expect(c.years).toBe('2022 till 2025');
    expect(c.delta).toBe('+50,5 mn kr, nominellt');
  });
  it('formats a decrease with a minus sign', () => {
    const c = formatBudgetChange({ ...base, amounts: { before: 200, after: 150 } });
    expect(c.delta).toBe('−50 mn kr, nominellt');
  });
});
