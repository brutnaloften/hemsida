import { describe, expect, it } from 'vitest';
import { buildIdf, stemsOf, widenSearch } from './widen-candidates.ts';
import type { StoredDocument } from './riksdag-ingest.ts';

function doc(dok_id: string, titel: string, text = '', datum = '2024-01-01'): StoredDocument {
  return {
    seq: 1,
    dok_id,
    doktyp: 'prop',
    rm: '2023/24',
    beteckning: '1',
    titel,
    datum,
    organ: '',
    url: '',
    text,
  };
}

describe('widenSearch', () => {
  const docs = [
    doc('A', 'Säkerhetszoner', 'polisen får visitera i särskilda zoner för att förebygga brott'),
    doc('B', 'Skolval', 'obligatoriskt skolval'),
    doc('C', 'Polisfrågor', 'allmänt om polisen'),
  ];
  const idf = buildIdf(docs);
  const promise = {
    id: 'p',
    title: 'Visitationszoner',
    description: 'Polisen får visitera.',
    keywords: [],
    extra: ['säkerhetszoner'],
  };

  it('stems words by prefix and drops stopwords', () => {
    expect(stemsOf('Skolvalet och skolvalsreformen')).toEqual(['skolva']);
  });

  it('finds a document through a synonym in its title', () => {
    const hits = widenSearch(promise, docs, idf, new Set(), 5);
    expect(hits[0]?.doc.dok_id).toBe('A');
  });

  it('skips documents already known', () => {
    expect(widenSearch(promise, docs, idf, new Set(['A']), 5).map((h) => h.doc.dok_id)).toEqual([]);
  });

  it('needs more than one weak body match unless a hand-written term is in the title', () => {
    const only = [doc('C', 'Polisfrågor', 'allmänt om polisen')];
    expect(widenSearch(promise, only, buildIdf(only), new Set(), 5)).toEqual([]);
  });

  it('ranks a title that contains a hand-written term above body hits on common words', () => {
    const short = doc('PROP', 'Säkerhetszoner', 'Regeringens proposition');
    const noisy = doc(
      'NOISE',
      'Polisfrågor',
      'polisen får visitera polisen visitera visitera polisen särskilda zoner',
    );
    const all = [noisy, short];
    const hits = widenSearch(promise, all, buildIdf(all), new Set(), 5);
    expect(hits[0]?.doc.dok_id).toBe('PROP');
  });
});
