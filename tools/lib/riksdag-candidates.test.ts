import { describe, expect, it } from 'vitest';
import type { DocumentPage, ListDocumentsParams, RiksdagDocument } from './riksdag.ts';
import {
  candidateFileSchema,
  MAX_CANDIDATES,
  planQueries,
  searchPromise,
  termWindow,
} from './riksdag-candidates.ts';

function doc(id: string, datum = '2024-01-01', doktyp = 'bet'): RiksdagDocument {
  return {
    dok_id: id,
    doktyp,
    subtyp: '',
    rm: '2023/24',
    beteckning: '1',
    nummer: '1',
    datum: `${datum} 00:00:00`,
    publicerad: '',
    titel: `Titel ${id}`,
    organ: 'NU',
    status: '',
    dokument_url_html: `https://data.riksdagen.se/dokument/${id}.html`,
    dokumentstatus_url_xml: '',
  };
}

function page(...documents: RiksdagDocument[]): DocumentPage {
  return { total: documents.length, page: 1, pages: 1, documents };
}

const promise = {
  id: 'tido-x',
  term: '2022-2026',
  keywords: ['reservkraft', 'Svenska kraftnät'],
  committee: 'NU',
};

describe('termWindow', () => {
  it('spans the term', () => {
    expect(termWindow('2022-2026')).toEqual({ from: '2022-09-01', tom: '2026-09-30' });
  });
});

describe('planQueries', () => {
  it('plans one query per keyword, all keywords and the committee', () => {
    const plan = planQueries(promise);
    expect(plan.map((q) => q.label)).toEqual([
      'keyword:reservkraft',
      'keyword:Svenska kraftnät',
      'all-keywords',
      'committee:NU',
    ]);
    expect(plan[1]!.params.sok).toBe('"Svenska kraftnät"');
    expect(plan[2]!.params.sok).toBe('reservkraft "Svenska kraftnät"');
    expect(plan[3]!.params).toMatchObject({ doktyp: 'bet', org: 'NU', from: '2022-09-01' });
  });

  it('plans nothing without keywords', () => {
    expect(planQueries({ ...promise, keywords: [] })).toEqual([]);
  });

  it('skips the all-keywords query for one keyword and the committee query without a committee', () => {
    const plan = planQueries({ id: 'a', term: '2022-2026', keywords: ['x'] });
    expect(plan.map((q) => q.label)).toEqual(['keyword:x']);
  });
});

describe('searchPromise', () => {
  it('merges hits across queries, ranks by score and drops rejected pairs', async () => {
    const calls: ListDocumentsParams[] = [];
    const list = async (p: ListDocumentsParams) => {
      calls.push(p);
      if (p.sok === 'reservkraft') return page(doc('A'), doc('B', '2025-01-01'), doc('R'));
      if (p.sok === '"Svenska kraftnät"') return page(doc('B', '2025-01-01'), doc('C'));
      return page(doc('B', '2025-01-01'));
    };
    const result = await searchPromise(promise, list, new Set(['tido-x:R']), '2026-10-28');
    expect(calls).toHaveLength(4);
    expect(result.candidates.map((c) => [c.dok_id, c.score])).toEqual([
      ['B', 4],
      ['A', 1],
      ['C', 1],
    ]);
    expect(result.candidates[0]!.found_by).toEqual([
      'keyword:reservkraft',
      'keyword:Svenska kraftnät',
      'all-keywords',
      'committee:NU',
    ]);
    expect(result.candidates[0]!.datum).toBe('2025-01-01');
    expect(candidateFileSchema.safeParse(result).success).toBe(true);
  });

  it('does not drop a pair rejected for another promise', async () => {
    const list = async () => page(doc('A'));
    const result = await searchPromise(promise, list, new Set(['other:A']), '2026-10-28');
    expect(result.candidates.map((c) => c.dok_id)).toEqual(['A']);
  });

  it('caps the candidate list', async () => {
    const many = Array.from({ length: 40 }, (_, i) => doc(`D${i}`));
    const list = async () => page(...many);
    const result = await searchPromise(promise, list, new Set(), '2026-10-28');
    expect(result.candidates).toHaveLength(MAX_CANDIDATES);
  });

  it('makes no request and returns an empty file when there are no keywords', async () => {
    let called = false;
    const list = async () => {
      called = true;
      return page();
    };
    const result = await searchPromise({ ...promise, keywords: [] }, list, new Set(), '2026-10-28');
    expect(called).toBe(false);
    expect(result.candidates).toEqual([]);
  });
});
