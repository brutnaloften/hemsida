import { describe, expect, it } from 'vitest';
import {
  buildDocumentBrief,
  countTerms,
  deriveTerms,
  excerpt,
  findPassages,
  findPriorYear,
  parseAmounts,
  previousRm,
  renderBrief,
  type Brief,
  type StoreDoc,
} from './eval-brief.ts';
import { annotateParagraphs, parseRiksdagText } from './riksdag-text.ts';
import { HC01SOU1_AMOUNT_PARAGRAPH, HD01SOU1_TEXT } from './riksdag-text.fixtures.ts';

const promise = {
  id: 'tido-nationell-forlossningsplan',
  title: 'Nationell förlossningsplan',
  keywords: ['förlossningsvård', 'förlossningsplan', 'barnmorsketeam', 'regionala skillnader'],
  quote: 'Så många födande kvinnor som möjligt ska ha tillgång till ett barnmorsketeam',
};

const paras = annotateParagraphs(parseRiksdagText(HD01SOU1_TEXT), 'bet');

describe('deriveTerms', () => {
  it('puts keywords first, adds distinctive words and skips covered ones and stopwords', () => {
    const terms = deriveTerms(promise, ['mödravård']);
    expect(terms.slice(0, 5)).toEqual([
      'förlossningsvård',
      'förlossningsplan',
      'barnmorsketeam',
      'regionala skillnader',
      'mödravård',
    ]);
    expect(terms).toContain('nationell');
    expect(terms).toContain('födande');
    expect(terms).not.toContain('möjligt');
    expect(terms).not.toContain('förlossningsplan'.toUpperCase());
    expect(new Set(terms).size).toBe(terms.length);
  });
});

describe('countTerms', () => {
  it('counts from word start and reports zero counts explicitly', () => {
    const counts = countTerms(paras, ['förlossning', 'förlossningsplan', 'barnmorsketeam']);
    expect(counts).toEqual([
      { term: 'förlossning', count: 2 },
      { term: 'förlossningsplan', count: 0 },
      { term: 'barnmorsketeam', count: 0 },
    ]);
  });

  it('matches multi-word terms across whitespace and not mid-word', () => {
    expect(countTerms(paras, ['kvinnors och flickors hälsa'])[0]!.count).toBe(1);
    expect(countTerms(paras, ['hälsa'])[0]!.count).toBe(2);
    expect(countTerms(paras, ['älsa'])[0]!.count).toBe(0);
  });
});

describe('parseAmounts', () => {
  it('parses the HD01SoU1 anslag 1:6 sentence with its year', () => {
    const [a] = parseAmounts(
      'Satsningen på kvinnors och flickors hälsa och mödravården fortsätter. För 2026 avsätts 1 000 000 000 kronor.',
    );
    expect(a).toEqual({
      raw: '1 000 000 000 kronor',
      kronor: 1_000_000_000,
      year: 2026,
      per_year: false,
    });
  });

  it('parses the HC01SoU1 sentences, one year each', () => {
    expect(parseAmounts(HC01SOU1_AMOUNT_PARAGRAPH)).toEqual([
      { raw: '1 600 000 000 kronor', kronor: 1_600_000_000, year: 2024, per_year: false },
    ]);
  });

  it('handles miljarder, decimals and per år', () => {
    expect(
      parseAmounts('Anslaget är 127 miljarder kronor. Det tillförs 4,5 miljoner kronor per år.'),
    ).toEqual([
      { raw: '127 miljarder kronor', kronor: 127e9, year: null, per_year: false },
      { raw: '4,5 miljoner kronor', kronor: 4_500_000, year: null, per_year: true },
    ]);
  });

  it('finds nothing in text without kronor amounts', () => {
    expect(parseAmounts('Planen ska utvecklas under 2026.')).toEqual([]);
  });
});

describe('excerpt', () => {
  it('keeps short text and cuts long text around the hit on word boundaries', () => {
    expect(excerpt('kort', 0)).toBe('kort');
    const long = `${'ord '.repeat(400)}målet ${'ord '.repeat(400)}`;
    const e = excerpt(long, long.indexOf('målet'), 200);
    expect(e).toContain('målet');
    expect(e.length).toBeLessThan(230);
    expect(e.startsWith('… ')).toBe(true);
    expect(e.endsWith(' …')).toBe(true);
  });
});

describe('findPassages', () => {
  it('returns verbatim passages with section, anslag, speaker and amounts, in document order', () => {
    const terms = ['kvinnors och flickors hälsa', 'förlossningsvård', 'barnmorsketeam'];
    const passages = findPassages(paras, terms, 5);
    expect(passages.map((p) => p.speaker)).toEqual([
      'Regeringen (refererad)',
      'Motion (MP)',
      'Särskilt yttrande (S)',
    ]);
    const first = passages[0]!;
    expect(first.anslag).toBe('Anslaget 1:6 Bidrag till folkhälsa och sjukvård');
    expect(first.text).toContain('För 2026 avsätts 1 000 000 000 kronor.');
    expect(first.matched_terms).toEqual(['kvinnors och flickors hälsa']);
    expect(first.amounts.map((a) => a.kronor)).toEqual([200_000_000, 1_000_000_000]);
    expect(passages[2]!.text).toContain('valt att sänka den särskilda satsningen');
  });

  it('respects the limit and prefers rarer terms', () => {
    const passages = findPassages(paras, ['förlossningsvård', 'kvinnors och flickors hälsa'], 1);
    expect(passages).toHaveLength(1);
  });
});

describe('previousRm and findPriorYear', () => {
  const doc = (over: Partial<StoreDoc>): StoreDoc => ({
    dok_id: 'HD01SoU1',
    doktyp: 'bet',
    rm: '2025/26',
    beteckning: 'SoU1',
    titel: 'Utgiftsområde 9 Hälsovård, sjukvård och social omsorg',
    datum: '2025-12-03',
    organ: 'SoU',
    ...over,
  });
  const prior = doc({ dok_id: 'HC01SoU1', rm: '2024/25', datum: '2024-12-04' });

  it('steps back one riksmöte', () => {
    expect(previousRm('2025/26')).toBe('2024/25');
    expect(previousRm('1999/00')).toBe('1998/99');
    expect(previousRm('2025')).toBe('2024');
    expect(previousRm('x')).toBeNull();
  });

  it('finds the same organ and title in the previous riksmöte', () => {
    const decoys = [
      doc({ dok_id: 'X1', rm: '2024/25', organ: 'FiU' }),
      doc({ dok_id: 'X2', rm: '2024/25', titel: 'Utgiftsområde 10 Ekonomisk trygghet' }),
      doc({ dok_id: 'X3', rm: '2023/24' }),
    ];
    expect(findPriorYear(doc({}), [doc({}), prior, ...decoys])?.dok_id).toBe('HC01SoU1');
  });

  it('falls back to the utgiftsområde number when the area was renamed', () => {
    const renamed = doc({ dok_id: 'R1', rm: '2024/25', titel: 'Utgiftsområde 9 Annat namn' });
    expect(findPriorYear(doc({}), [renamed])?.dok_id).toBe('R1');
  });

  it('ignores years in the title (budget propositions)', () => {
    const p25 = doc({
      dok_id: 'P25',
      doktyp: 'prop',
      titel: 'Budgetpropositionen för 2026 Utgiftsområde 9',
      organ: 'S-dep',
    });
    const p24 = doc({
      dok_id: 'P24',
      doktyp: 'prop',
      rm: '2024/25',
      titel: 'Budgetpropositionen för 2025 Utgiftsområde 9',
      organ: 'S-dep',
    });
    expect(findPriorYear(p25, { P25: p25, P24: p24 })?.dok_id).toBe('P24');
  });

  it('is null outside the store, for non-budget documents and without a previous rm', () => {
    expect(findPriorYear(doc({}), [doc({})])).toBeNull();
    expect(findPriorYear(doc({ titel: 'Något annat' }), [doc({}), prior])).toBeNull();
    expect(findPriorYear(doc({ rm: 'x' }), [prior])).toBeNull();
  });
});

describe('renderBrief', () => {
  const document = buildDocumentBrief(
    {
      document_id: 'HD01SoU1',
      document_type: 'bet',
      title: 'Utgiftsområde 9',
      rm: '2025/26',
      date: '2025-12-03',
      url: 'https://data.riksdagen.se/dokument/HD01SoU1.html',
    },
    paras,
    ['förlossningsplan', 'kvinnors och flickors hälsa'],
    3,
  );

  it('states zero counts explicitly and shows speaker, quote and amounts, never a label', () => {
    const brief: Brief = {
      pair_id: 'p::HD01SoU1',
      promise_id: 'p',
      promise_title: 'P',
      document,
      prior_year: { status: 'none', reason: 'ingen motsvarighet' },
    };
    const out = renderBrief(brief);
    expect(out).toContain('Förekommer inte i texten: förlossningsplan');
    expect(out).toContain('kvinnors och flickors hälsa 1');
    expect(out).toContain('[Regeringen (refererad)]');
    expect(out).toContain('Belopp: 200 000 000 kr 2026; 1 000 000 000 kr 2026');
    expect(out).toContain('Ingen: ingen motsvarighet');
    expect(out).not.toMatch(/match|etikett|förslag till etikett/i);
  });

  it('says so when the full text is missing', () => {
    const none = buildDocumentBrief(
      { ...document, text_available: undefined } as never,
      null,
      ['x'],
      3,
    );
    expect(
      renderBrief({
        pair_id: 'a',
        promise_id: 'a',
        promise_title: 'a',
        document: none,
        prior_year: null,
      }),
    ).toContain('Fulltext saknas');
  });
});
