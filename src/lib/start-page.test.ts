import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  agreementSplitText,
  buildStartModel,
  formatDate,
  type SourceInfo,
  type StartPromise,
} from './start-page';

const roles = {
  S: 'opposition',
  V: 'opposition',
  C: 'opposition',
  MP: 'opposition',
  M: 'government',
  KD: 'government',
  L: 'government',
  SD: 'support',
} as const;

function agreementSource(id: string, shortTitle: string): SourceInfo {
  return {
    id,
    title: `${shortTitle}: lång titel`,
    shortTitle,
    kind: 'government_agreement',
    parties: ['M', 'KD', 'L', 'SD'],
    date: '2022-10-14',
  };
}

function promise(
  source: string,
  parties: string[],
  verdict = 'unassessed',
  evidence: unknown[] = [],
): StartPromise {
  return { source: { id: source }, parties, verdict: { value: verdict }, evidence } as StartPromise;
}

const outcome = (source: string, o: string) => ({
  kind: 'agreement',
  source,
  date: '2022-10-14',
  promises: [],
  outcome: o,
  note: null,
});

function promisesFor(agreementId: string): StartPromise[] {
  return [
    promise('valmanifest-2022-m', ['M'], 'fulfilled', [outcome(agreementId, 'included')]),
    promise('valmanifest-2022-m', ['M'], 'unassessed', [outcome(agreementId, 'not_addressed')]),
    promise('valmanifest-2022-s', ['S']),
    promise(agreementId, ['M', 'KD', 'L', 'SD']),
  ];
}

describe('buildStartModel', () => {
  it('scenario 1: an agreement, split only on parties behind it', () => {
    const m = buildStartModel(
      { roles, agreements: ['tidoavtalet'] },
      [agreementSource('tidoavtalet', 'Tidöavtalet')],
      promisesFor('tidoavtalet'),
    );
    expect(m.keyNumbers).toMatchObject({ promises: 3, parties: 8, assessed: 1 });
    expect(m.agreements).toMatchObject([{ name: 'Tidöavtalet', points: 1 }]);
    expect(m.roleGroups.map((g) => g.parties)).toEqual([
      ['M', 'KD', 'L'],
      ['SD'],
      ['S', 'V', 'C', 'MP'],
    ]);
    const cards = m.cardGroups.flatMap((g) => g.cards);
    const mCard = cards.find((c) => c.party === 'M')!;
    expect(mCard.promises).toBe(2);
    expect(agreementSplitText(mCard.agreementSplits[0]!.counts)).toBe('1 med · 1 saknas');
    expect(cards.find((c) => c.party === 'S')!.agreementSplits).toEqual([]);
  });

  it('scenario 2: no agreement, so no agreement data at all', () => {
    const m = buildStartModel({ roles, agreements: [] }, [], promisesFor('x'));
    expect(m.agreements).toEqual([]);
    expect(m.cardGroups.flatMap((g) => g.cards).every((c) => c.agreementSplits.length === 0)).toBe(
      true,
    );
    // Without an agreement nothing is excluded from the party counts.
    expect(m.keyNumbers.promises).toBe(4);
  });

  it('scenario 3: a differently named agreement', () => {
    const m = buildStartModel(
      { roles, agreements: ['exempel'] },
      [agreementSource('exempel', 'Exempelavtalet')],
      promisesFor('exempel'),
    );
    expect(m.agreements[0]!.name).toBe('Exempelavtalet');
  });

  it('fails loudly when the term lists an unknown agreement', () => {
    expect(() => buildStartModel({ roles, agreements: ['saknas'] }, [], [])).toThrow(/saknas/);
  });

  it('formats dates in Swedish', () => {
    expect(formatDate('2022-10-14')).toBe('14 oktober 2022');
  });
});

describe('start page source', () => {
  it('does not hardcode an agreement name', () => {
    for (const f of ['./start-page.ts', '../components/pages/StartPage.astro']) {
      const text = readFileSync(new URL(f, import.meta.url), 'utf8');
      expect(text).not.toMatch(/tidö|avtalet/i);
    }
  });
});
