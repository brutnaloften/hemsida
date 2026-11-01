import { describe, expect, it } from 'vitest';
import { revenueHuvudgrupper, revenueTyper } from '@/lib/budget/data';
import { revenueExplanation } from '@/lib/budget/revenue-labels';

describe('revenue explanations', () => {
  it('exist for every typ and huvudgrupp', () => {
    const missing = [...revenueTyper, ...revenueHuvudgrupper]
      .map((n) => n.kod)
      .filter((kod) => !revenueExplanation(kod));
    expect(missing, `missing explanations: ${missing.join(', ')}`).toEqual([]);
  });
  it('exist for the synthetic nodes', () => {
    expect(revenueExplanation('rev:skatter')).toBeDefined();
    expect(revenueExplanation('root:inkomster')).toBeDefined();
  });
  it('words the avgående poster as in the design', () => {
    expect(revenueExplanation('rev:1800')).toContain(
      'Går vidare till kommuner, regioner, pensionssystemet och EU',
    );
  });
  it('have no explanation for a code that does not exist', () => {
    expect(revenueExplanation('rev:9999')).toBeUndefined();
  });
  it('are single lines without double spaces', () => {
    for (const kod of ['1100', '7200', '2400']) {
      const text = revenueExplanation(kod)!;
      expect(text).not.toMatch(/\s{2,}/);
    }
  });
});
