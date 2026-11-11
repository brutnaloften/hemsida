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

  it('labels a betänkande as a decision only when its stage is definitive', () => {
    const bet = { ...item, kind: 'bet' };
    const decided = buildReasoningPrompt({ title: 'T', description: 'D' }, [
      { ...bet, stage: 'definitive' },
    ]);
    const other = buildReasoningPrompt({ title: 'T', description: 'D' }, [
      { ...bet, stage: 'preparatory' },
    ]);
    expect(decided).toContain('betänkande (beslut)');
    expect(other).not.toContain('(beslut)');
  });

  it('rejects claims that something was not decided or proposed', () => {
    const base = 'Regeringen lade i mars 2026 fram ett förslag om aktivitetskrav.';
    for (const bad of [
      'Riksdagen har inte beslutat om förslaget.',
      'Förslaget har ännu inte antagits.',
      'Inga beslut har fattats.',
      'Något förslag har inte lagts fram.',
      'Förslaget är en proposition som riksdagen ska ta ställning till.',
      'Riksdagen ska behandla förslaget.',
      'Man väntar på beslut.',
      'Riksdagen har ännu inte röstat.',
    ]) {
      expect(reasoningProblems(`${base} ${bad}`, [])).toContain(
        'claims something was not decided or proposed',
      );
    }
    expect(
      reasoningProblems(`${base} Utbildning av personal nämns inte i dokumenten.`, []),
    ).toEqual([]);
    // A sentence about the listed documents may say they show no decision; a flat claim may not.
    expect(
      reasoningProblems(`${base} Båda dokumenten visar förslag och inte något beslut.`, []),
    ).toEqual([]);
    expect(reasoningProblems(`${base} Riksdagen har inte fattat något beslut.`, [])).not.toEqual(
      [],
    );
    expect(reasoningProblems(`${base} Det finns inget beslut.`, [])).not.toEqual([]);
    // What an investigation was told to look into is not a pending decision.
    expect(
      reasoningProblems(
        `${base} Utredningen skulle ta ställning till flera frågor. Utredaren ska ta ställning till regler om tillstånd.`,
        [],
      ),
    ).toEqual([]);
    expect(reasoningProblems(`${base} Riksdagen ska ta ställning till förslaget.`, [])).not.toEqual(
      [],
    );
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
