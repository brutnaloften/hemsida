import { describe, expect, it } from 'vitest';
import { buildDocumentBrief, findPassages, scopeTerms, sentenceExcerpt } from './eval-brief.ts';
import { annotateParagraphs, parseRiksdagText } from './riksdag-text.ts';
import { HC01SOU1_AMOUNT_PARAGRAPH, HD01SOU1_TEXT } from './riksdag-text.fixtures.ts';

const hd = annotateParagraphs(parseRiksdagText(HD01SOU1_TEXT), 'bet');

// HC01SoU1: the anslag 1:6 sentence sits among many paragraphs that mention the terms more often.
const noise = Array.from({ length: 8 }, (_, i) => ({
  text: `Tillkännagivandet gäller förlossningsvård och kvinnors hälsa, punkt ${i}. Regionerna har fått medel för förlossningsvård och förlossning.`,
  heading: false,
}));
const hc = annotateParagraphs(
  [
    {
      text: 'Tillkännagivanden som redovisas som slutbehandlade i proposition 2024/25:1',
      heading: true,
    },
    ...noise,
    { text: 'Anslaget 1:6 Bidrag till folkhälsa och sjukvård', heading: true },
    { text: HC01SOU1_AMOUNT_PARAGRAPH, heading: false },
  ],
  'bet',
);

describe('amount-bearing passages', () => {
  it('shows the 1.6 bn sentence of HC01SoU1 although other paragraphs match more terms', () => {
    const terms = ['förlossningsvård', 'förlossning', 'kvinnors hälsa'];
    const passages = findPassages(hc, terms, 4, ['förlossningsvård']);
    expect(passages.some((p) => p.text.includes('1 600 000 000 kronor för förlossningsvård'))).toBe(
      true,
    );
  });

  it('shows the 1 000 000 000 sentence of HD01SoU1 (term in the sentence before the amount)', () => {
    const passages = findPassages(hd, ['mödravård', 'förlossningsvård'], 2, ['mödravård']);
    expect(passages.some((p) => p.text.includes('För 2026 avsätts 1 000 000 000 kronor.'))).toBe(
      true,
    );
  });

  it('finds last year via scope terms taken from the current document', () => {
    const current = buildDocumentBrief(
      { document_id: 'x', document_type: 'bet', title: '', rm: '', date: '', url: '' },
      hd,
      ['mödravård', 'kvinnors och flickors hälsa'],
      6,
      ['mödravård', 'kvinnors och flickors hälsa'],
    );
    expect(scopeTerms(current)).toContain('mödravård');
    const prior = findPassages(hc, ['förlossningsvård', 'kvinnors hälsa'], 4, ['kvinnors hälsa']);
    expect(
      prior.some((p) => p.amounts.some((a) => a.kronor === 1_600_000_000 && a.year === 2024)),
    ).toBe(true);
  });
});

describe('sentenceExcerpt', () => {
  it('keeps the matching sentence visible in a long paragraph', () => {
    const filler = 'Detta är en mening utan betydelse för saken. '.repeat(40);
    const target =
      'För 2024 avsattes 1 600 000 000 kronor för förlossningsvård och kvinnors hälsa.';
    const text = `${filler}${target} För 2025 avsätts motsvarande belopp. ${filler}`;
    const out = sentenceExcerpt(text, text.indexOf(target));
    expect(out).toContain(target);
    expect(out.length).toBeLessThanOrEqual(710);
    expect(out.startsWith('… ')).toBe(true);
  });

  it('falls back to a plain excerpt for one very long sentence', () => {
    expect(sentenceExcerpt('ord '.repeat(500), 1000).length).toBeLessThan(720);
  });
});
