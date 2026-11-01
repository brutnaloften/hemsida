import { describe, expect, it } from 'vitest';
import { revenueHuvudgrupper, revenueTyper } from '@/lib/budget/data';
import { AVGAENDE_NOTE, revenueExplanation } from '@/lib/budget/revenue-labels';

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
  it('words the strip-level note for the avgående poster as in the design', () => {
    expect(AVGAENDE_NOTE).toBe('Går vidare till kommuner, regioner, pensionssystemet och EU.');
  });
  it('does not claim an EU part for 1800 (that is 1700)', () => {
    expect(revenueExplanation('rev:1800')).not.toMatch(/EU/);
    expect(revenueExplanation('rev:1700')).toMatch(/EU/);
  });
  it('never gives two different codes the same text (copy-paste guard)', () => {
    const codes = [...revenueTyper, ...revenueHuvudgrupper].map((n) => n.kod);
    codes.push('skatter', 'inkomster');
    const seen = new Map<string, string>();
    for (const kod of codes) {
      const text = revenueExplanation(kod)!;
      expect(seen.get(text), `${kod} repeats the text of ${seen.get(text)}`).toBeUndefined();
      seen.set(text, kod);
    }
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
