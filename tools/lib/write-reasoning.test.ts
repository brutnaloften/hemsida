import { describe, expect, it } from 'vitest';
import {
  buildReasoningPrompt,
  reasoningKey,
  reasoningProblems,
  type ReasoningItem,
} from './write-reasoning.ts';

const item: ReasoningItem = {
  kind: 'prop',
  date: '2026-03-17',
  title: 'Aktivitetskrav',
  relevance: 'full',
  note: 'Proposes an activity requirement.',
};

describe('write-reasoning', () => {
  it('describes documents in words and never includes designations in the prompt', () => {
    const prompt = buildReasoningPrompt({ title: 'T', description: 'D' }, [item]);
    expect(prompt).toContain('proposition, 2026-03-17');
    expect(prompt).toContain('hela löftet');
    expect(prompt).not.toMatch(/Prop\. \d/);
  });

  it('keys on model and prompt', () => {
    expect(reasoningKey('a', 'p')).not.toBe(reasoningKey('b', 'p'));
    expect(reasoningKey('a', 'p')).not.toBe(reasoningKey('a', 'q'));
    expect(reasoningKey('a', 'p')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects designations, AI mentions and completeness caveats', () => {
    const ok =
      'Regeringen lade i mars 2026 fram ett förslag om aktivitetskrav för försörjningsstöd.';
    expect(reasoningProblems(ok, ['Prop. 2025/26:207'])).toEqual([]);
    expect(reasoningProblems(`${ok} Se Prop. 2025/26:207.`, ['Prop. 2025/26:207']).length).toBe(2);
    expect(reasoningProblems(`${ok} Gjord av en AI-modell.`, [])).toContain('mentions AI');
    expect(reasoningProblems(`${ok} Fler dokument kan finnas.`, [])).toContain(
      'adds a completeness caveat',
    );
  });
});
