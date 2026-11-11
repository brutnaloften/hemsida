import { describe, expect, it } from 'vitest';
import {
  buildReasoningPrompt,
  reasoningInstructions,
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
        `${base} Utredningen ska ta ställning till flera frågor. Utredaren ska behandla regler om tillstånd.`,
        [],
      ),
    ).toEqual([]);
    expect(reasoningProblems(`${base} Riksdagen ska ta ställning till förslaget.`, [])).not.toEqual(
      [],
    );
    // A sentence that mixes an investigation with a pending decision, or only mentions the
    // investigation in passing, is still rejected.
    for (const mixed of [
      'Utredningen ska ta ställning till frågan och riksdagen ska ta ställning till förslaget.',
      'Utredaren ska lämna förslag, men riksdagen ska ännu besluta om saken.',
      'Uppdraget ska redovisas i juni; frågan ska prövas av riksdagen.',
      'Förslagen från utredningen ska behandlas av riksdagen i vår.',
      'Lagförslaget efter utredningen ska prövas av riksdagen.',
      'Betänkandet om uppdraget ska behandlas i kammaren.',
      'Frågan i direktivet ska avgöras av riksdagen.',
      'Riksdagen och kommittén ska besluta om saken.',
      'Utredningen ska ta ställning till om riksdagen ska besluta.',
    ]) {
      expect(reasoningProblems(`${base} ${mixed}`, []), mixed).not.toEqual([]);
    }
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

  it('describes a contradicting document and only changes the instructions for such promises', () => {
    const item = {
      kind: 'sou',
      date: '2025-01-10',
      title: 'T',
      note: '',
      relevance: 'full',
    } as const;
    const against = { ...item, relevance: 'contradicts' } as const;
    const prompt = buildReasoningPrompt({ title: 'T', description: 'D' }, [against]);
    expect(prompt).toContain('Motverkar löftet');
    expect(reasoningInstructions([item])).not.toContain('Motverkar löftet');
    expect(reasoningInstructions([item, against])).toContain('Motverkar löftet');
    expect(reasoningKey('a', 'p', reasoningInstructions([item]))).toBe(reasoningKey('a', 'p'));
    expect(reasoningKey('a', 'p', reasoningInstructions([against]))).not.toBe(
      reasoningKey('a', 'p'),
    );
  });
});
