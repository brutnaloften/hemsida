import { describe, expect, it } from 'vitest';
import {
  buildReasoningPrompt,
  hasLawInForce,
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

  it('rejects internal terms and full-coverage claims where the verdict is not fulfilled', () => {
    const ok = 'Lagen trädde i kraft 1 april 2025 och förlänger tiden.';
    expect(reasoningProblems(`${ok} Den visade lagtexten visar inte allt.`, [], true)).toContain(
      'describes the tool input (shown text, truncation) instead of the law',
    );
    expect(reasoningProblems(`${ok} Löftets citat är avkortat.`, [], true)).toContain(
      'describes the tool input (shown text, truncation) instead of the law',
    );
    expect(reasoningProblems(`${ok} Enligt anteckningen saknas något.`, [], true)).toContain(
      'uses an internal term',
    );
    expect(reasoningProblems(`${ok} Lagen täcker hela löftet.`, [], true, 'partial')).toContain(
      'claims full coverage',
    );
    expect(reasoningProblems(`${ok} Lagen täcker hela löftet.`, [], true)).toEqual([]);
    expect(reasoningProblems(`${ok} Lagen täcker löftet.`, [], true, 'unconfirmed_full')).toContain(
      'must say the coverage is unconfirmed',
    );
    expect(
      reasoningProblems(
        `${ok} Lagen verkar täcka löftet, men det är obekräftat.`,
        [],
        true,
        'unconfirmed_full',
      ),
    ).toEqual([]);
  });

  it('rejects claims that something is still being prepared', () => {
    const ok = 'Lagen trädde i kraft 1 april 2025 och förlänger tiden.';
    for (const bad of [
      'Resten av löftet bereds fortfarande.',
      'Frågan pågår fortfarande.',
      'Resten är fortfarande under beredning.',
      'Det pågår en utredning.'.replace('Det pågår en', 'Det finns en pågående'),
    ])
      expect(reasoningProblems(`${ok} ${bad}`, [], true), bad).toContain(
        'claims something is still being prepared',
      );
    expect(reasoningProblems(`${ok} Utredningen lämnade sitt betänkande i maj.`, [], true)).toEqual(
      [],
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

  describe('laws (SFS)', () => {
    const today = '2026-11-11';
    const law: ReasoningItem = {
      kind: 'sfs',
      date: '2026-07-01',
      title: 'Lag om aktivitetskrav',
      relevance: 'full',
      note: '',
    };
    const future = { ...law, date: '2027-01-01' };

    it('labels laws with their in-force date and leaves the in_progress instructions unchanged', () => {
      expect(buildReasoningPrompt({ title: 'T', description: 'D' }, [law], today)).toContain(
        'lag (SFS), trädde i kraft 2026-07-01',
      );
      expect(buildReasoningPrompt({ title: 'T', description: 'D' }, [future], today)).toContain(
        'träder i kraft 2027-01-01',
      );
      expect(reasoningInstructions([item], 'in_progress', today)).toBe(
        reasoningInstructions([item]),
      );
      expect(reasoningKey('a', 'p', reasoningInstructions([item], 'in_progress', today))).toBe(
        reasoningKey('a', 'p'),
      );
    });

    it('describes the verdict meaning per value', () => {
      expect(reasoningInstructions([item, law], 'fulfilled', today)).toContain('uppfyllt');
      expect(reasoningInstructions([item, law], 'partially_fulfilled', today)).toContain(
        'delvis uppfyllt',
      );
      expect(reasoningInstructions([item, future], 'in_progress', today)).toContain(
        'träder i kraft ett senare datum',
      );
    });

    it('uses future-tense instructions when every law is still ahead', () => {
      for (const v of ['fulfilled', 'partially_fulfilled']) {
        const ins = reasoningInstructions([item, future], v, today);
        expect(ins).toContain('ännu inte trätt i kraft');
        expect(ins).toContain('aldrig "trädde i kraft"');
        expect(reasoningInstructions([item, law], v, today)).not.toContain('ännu inte trätt');
      }
      const medium = reasoningInstructions([item, future], 'in_progress', today);
      expect(medium).toContain('obekräftat');
    });

    it('only accepts in-force phrasing when a law is in force', () => {
      const text = 'Lagen som genomför löftet trädde i kraft den 1 juli 2026.';
      expect(hasLawInForce([law], today)).toBe(true);
      expect(hasLawInForce([future, item], today)).toBe(false);
      expect(reasoningProblems(text, [], false)).toContain('claims a law is in force');
      expect(reasoningProblems(text, [], true)).toEqual([]);
      expect(reasoningProblems('Lagen träder i kraft den 1 januari 2027.', [], false)).toEqual([]);
    });

    it('gives in_progress with a law already in force its own instructions', () => {
      const ins = reasoningInstructions([item, law], 'in_progress', today);
      expect(ins).not.toContain('ingen författning är kopplad');
      expect(ins).toContain('har trätt i kraft på det angivna datumet');
      expect(ins).not.toContain('Skriv inte att den gäller');
      expect(reasoningInstructions([item, future], 'in_progress', today)).not.toContain(
        'ingen författning är kopplad',
      );
      expect(reasoningInstructions([item, law, future], 'fulfilled', today)).toContain(
        'gäller bara den lagen',
      );
      const both = reasoningInstructions([item, law, future], 'in_progress', today);
      expect(both).toContain('gäller bara den lagen');
      expect(reasoningInstructions([item], 'in_progress', today)).toContain(
        'ingen författning är kopplad',
      );
    });

    it('widens the in-force pattern but not negated phrasing', () => {
      for (const t of [
        'Lagen har nu trätt i kraft.',
        'Lagen började gälla i juli.',
        'Den gäller från 1 juli.',
      ])
        expect(reasoningProblems(t, [], false)).toContain('claims a law is in force');
      expect(
        reasoningProblems('Det framgår inte att lagen har trätt i kraft.', [], false),
      ).not.toContain('claims a law is in force');
    });

    it('only exempts negation attached to the in-force claim', () => {
      for (const t of [
        'Lagen, som inte omfattar äldre fall, trädde i kraft den 1 juli 2026.',
        'Regeringen har inte ändrat förslaget och lagen gäller sedan juli.',
        'Det framgår inte att regeringen ändrat förslaget, men lagen trädde i kraft den 1 juli.',
        'Det framgår inte att något ändrats och lagen har trätt i kraft.',
      ])
        expect(reasoningProblems(t, [], false)).toContain('claims a law is in force');
      for (const t of [
        'Det framgår inte att lagen har trätt i kraft.',
        'Lagen trädde inte i kraft.',
      ])
        expect(reasoningProblems(t, [], false)).not.toContain('claims a law is in force');
      expect(reasoningProblems('Lagen har ännu inte trätt i kraft.', [], false)).not.toContain(
        'claims a law is in force',
      );
    });

    it('rejects SFS designations', () => {
      expect(reasoningProblems('Lagen SFS 2025:625 trädde i kraft i juli.', [], true)).toContain(
        'names an SFS designation',
      );
    });
  });

  describe('inquiry promises', () => {
    const today = '2026-11-12';
    const dir: ReasoningItem = {
      kind: 'dir',
      date: '2023-05-01',
      title: 'Utredning om X',
      relevance: 'full',
      note: 'Appoints an inquiry into X.',
    };

    it('uses directive wording and never law wording', () => {
      const ins = reasoningInstructions([dir], 'fulfilled', today, 'inquiry');
      expect(ins).toContain('kommittédirektiv');
      expect(ins).toContain('Skriv ingenting om lagar');
      expect(ins).not.toContain('trädde i kraft den <datum>');
      expect(reasoningInstructions([dir], 'partially_fulfilled', today, 'inquiry')).toContain(
        'delvis uppfyllt',
      );
    });

    it('uses supplementary-directive wording when every qualifying directive is a tilläggsdirektiv', () => {
      const tillagg = { ...dir, title: 'Tilläggsdirektiv till Utredningen om X' };
      const ins = reasoningInstructions([tillagg], 'fulfilled', today, 'inquiry');
      expect(ins).toContain('Skriv aldrig att regeringen tillsatte utredningen');
      // A plain directive next to it keeps the appointing wording.
      expect(reasoningInstructions([dir, tillagg], 'fulfilled', today, 'inquiry')).toContain(
        'tillsatte utredningen genom ett direktiv',
      );
    });

    it('hides a placeholder 1 January SOU date in inquiry prompts only', () => {
      const sou = { ...item, kind: 'sou', date: '2025-01-01' };
      expect(buildReasoningPrompt({ title: 'T', description: 'D' }, [sou], today, true)).toContain(
        'okänt',
      );
      expect(buildReasoningPrompt({ title: 'T', description: 'D' }, [sou], today)).toContain(
        '2025-01-01',
      );
    });

    it('accepts wording about people without citizenship and a mandate to propose a new law', () => {
      const t =
        'Regeringen tillsatte utredningen i maj 2024. Den ska föreslå att utlänningar som saknar svenskt medborgarskap kan utvisas och att en ny lag införs.';
      expect(reasoningProblems(t, [], false, undefined, true)).toEqual([]);
    });

    it('leaves in_progress and other types unchanged', () => {
      expect(reasoningInstructions([dir], 'in_progress', today, 'inquiry')).toBe(
        reasoningInstructions([dir], 'in_progress', today),
      );
      expect(reasoningInstructions([dir], 'fulfilled', today, 'legislative')).toBe(
        reasoningInstructions([dir], 'fulfilled', today),
      );
    });

    it('rejects law claims and absence claims in an inquiry text', () => {
      const ok =
        'Regeringen tillsatte i maj 2023 en utredning om X. Utredningen lämnade sitt betänkande i juni 2025.';
      expect(reasoningProblems(ok, [], false, undefined, true)).toEqual([]);
      // Saying what the inquiry was asked to propose is fine.
      expect(
        reasoningProblems(
          `${ok} Den ska föreslå författningsändringar i lagen (2022:700).`,
          [],
          false,
          undefined,
          true,
        ),
      ).toEqual([]);
      for (const bad of [
        'Utredningen ledde till en ny lag.',
        'Lagen har beslutats av riksdagen.',
        'Riksdagen har beslutat om förslaget.',
        'Frågan om Y nämns inte i direktivet.',
        'Uppdraget saknar delen om Y.',
        'Utredningen trädde i kraft i juni 2023.',
      ]) {
        expect(reasoningProblems(`${ok} ${bad}`, [], false, undefined, true), bad).not.toEqual([]);
      }
    });
  });
});
