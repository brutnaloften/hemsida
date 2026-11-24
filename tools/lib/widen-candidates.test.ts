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

  it('skips documents already known and requires more than one weak match', () => {
    expect(widenSearch(promise, docs, idf, new Set(['A']), 5).map((h) => h.doc.dok_id)).toEqual([]);
  });
});
