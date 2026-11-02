import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { manifestoOnly, outcomeCountsText } from './manifesto';
import { buildPartierRows } from './partier-table';
import { buildStartModel, agreementSplitText } from './start-page';

const readJson = (dir: URL, f: string) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
const dataDir = new URL('../data/', import.meta.url);
const sourcesDir = new URL('sources/', dataDir);
const promisesDir = new URL('2022-2026/promises/', dataDir);
const sources = readdirSync(sourcesDir).map((f) => readJson(sourcesDir, f));
const promises = readdirSync(promisesDir).map((f) => readJson(promisesDir, f));
const term = readJson(new URL('2022-2026/', dataDir), 'term.json');

describe('manifestoOnly', () => {
  it('drops promises from non-manifesto sources', () => {
    const src = [
      { id: 'm', kind: 'manifesto' },
      { id: 'a', kind: 'government_agreement' },
    ];
    const ps = [{ source: { id: 'm' } }, { source: { id: 'a' } }, { source: { id: 'x' } }];
    expect(manifestoOnly(ps, src)).toEqual([{ source: { id: 'm' } }]);
  });
});

describe('outcomeCountsText', () => {
  it('uses the shared wording and omits zero counts', () => {
    const counts = {
      included: 5,
      strengthened: 1,
      weakened: 2,
      contradicted: 3,
      not_addressed: 0,
    };
    expect(outcomeCountsText(counts)).toBe('5 med · 1 skärpta · 2 urvattnade · 3 motsägs');
    expect(agreementSplitText(counts)).toBe(outcomeCountsText(counts));
  });
});

describe('Start page and Partier table on real data', () => {
  const start = buildStartModel(term, sources, promises);
  const rows = buildPartierRows(term, promises, sources);

  it('agree on promise and assessed counts per party', () => {
    const cards = start.cardGroups.flatMap((g) => g.cards);
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      const row = rows.find((r) => r.party === card.party);
      expect(row, card.party).toBeDefined();
      expect(card.promises, card.party).toBe(row!.promiseCount);
      expect(card.assessed, card.party).toBe(row!.assessed);
    }
  });

  it('agree on the outcome split per agreement', () => {
    for (const card of start.cardGroups.flatMap((g) => g.cards)) {
      const row = rows.find((r) => r.party === card.party)!;
      for (const split of card.agreementSplits) {
        const cell = row.agreements.find((c) => c.agreementId === split.agreement.id)!;
        expect(split.counts, card.party).toEqual(cell.counts);
        expect(split.total, card.party).toBe(cell.total);
      }
    }
  });
});
