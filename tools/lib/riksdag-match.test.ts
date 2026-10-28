import { describe, expect, it } from 'vitest';
import { MAX_CANDIDATES, candidateFileSchema } from './riksdag-candidates.ts';
import type { StoredDocument } from './riksdag-ingest.ts';
import { keywordMatches, matchLabels, mergeCandidates, promiseMatchHash } from './riksdag-match.ts';

function sdoc(id: string, extra: Partial<StoredDocument> = {}): StoredDocument {
  return {
    seq: 1,
    dok_id: id,
    doktyp: 'bet',
    rm: '2023/24',
    beteckning: 'NU1',
    titel: 'Reservkraft och Svenska kraftnät',
    datum: '2024-01-01',
    organ: 'NU',
    url: `https://data.riksdagen.se/dokument/${id}.html`,
    text: '',
    ...extra,
  };
}

const promise = {
  id: 'tido-x',
  term: '2022-2026',
  keywords: ['reservkraft', 'Svenska kraftnät'],
  committee: 'NU',
};

describe('keywordMatches', () => {
  it('matches long keywords anywhere, case-insensitively', () => {
    expect(keywordMatches('Nödreservkraft', 'reservkraft')).toBe(true);
    expect(keywordMatches('Svenska Kraftnät AB', 'svenska kraftnät')).toBe(true);
  });

  it('matches short keywords only at a word start', () => {
    expect(keywordMatches('Nytt väg- och järnvägsprogram', 'väg')).toBe(true);
    expect(keywordMatches('Slutavgift', 'avg')).toBe(false);
    expect(keywordMatches('Slutavgift', 'slut')).toBe(true);
  });
});

describe('matchLabels', () => {
  it('uses the same labels as the API search', () => {
    expect(matchLabels(promise, sdoc('A'))).toEqual([
      'keyword:reservkraft',
      'keyword:Svenska kraftnät',
      'all-keywords',
      'committee:NU',
    ]);
  });

  it('searches the snippet text and skips the committee label for other types or committees', () => {
    const d = sdoc('A', { titel: 'Annat', text: 'handlar om reservkraft', doktyp: 'prop' });
    expect(matchLabels(promise, d)).toEqual(['keyword:reservkraft']);
    expect(matchLabels(promise, sdoc('B', { organ: 'FiU' }))).not.toContain('committee:NU');
  });

  it('ignores documents outside the term, outside the candidate types, and promises without keywords', () => {
    expect(matchLabels(promise, sdoc('A', { datum: '2027-01-01' }))).toEqual([]);
    expect(matchLabels(promise, sdoc('A', { datum: '2022-08-31' }))).toEqual([]);
    expect(matchLabels(promise, sdoc('A', { doktyp: 'mot' }))).toEqual([]);
    expect(matchLabels({ ...promise, keywords: [] }, sdoc('A'))).toEqual([]);
  });
});

describe('promiseMatchHash', () => {
  it('changes with keywords or committee, not with other fields', () => {
    const h = promiseMatchHash(promise);
    expect(promiseMatchHash({ ...promise, id: 'other' })).toBe(h);
    expect(promiseMatchHash({ ...promise, keywords: ['x'] })).not.toBe(h);
    expect(promiseMatchHash({ ...promise, committee: 'FiU' })).not.toBe(h);
  });
});

describe('mergeCandidates', () => {
  it('creates a valid file, ranked by score then newest', () => {
    const { file, changed } = mergeCandidates(
      promise,
      undefined,
      [
        sdoc('A', { titel: 'Reservkraft', organ: 'FiU' }),
        sdoc('B'),
        sdoc('C', { titel: 'Reservkraft', organ: 'FiU', datum: '2025-01-01' }),
      ],
      new Set(),
      '2026-10-28',
    );
    expect(changed).toBe(true);
    expect(file.candidates.map((c) => [c.dok_id, c.score])).toEqual([
      ['B', 4],
      ['C', 1],
      ['A', 1],
    ]);
    expect(file.queries).toEqual([
      'keyword:reservkraft',
      'keyword:Svenska kraftnät',
      'all-keywords',
      'committee:NU',
    ]);
    expect(candidateFileSchema.safeParse(file).success).toBe(true);
  });

  it('keeps existing entries untouched and reports no change when nothing is new', () => {
    const first = mergeCandidates(promise, undefined, [sdoc('A')], new Set(), '2026-01-01').file;
    const again = mergeCandidates(
      promise,
      first,
      [sdoc('A'), sdoc('Z', { titel: 'x' })],
      new Set(),
      '2026-10-28',
    );
    expect(again.changed).toBe(false);
    expect(again.file).toBe(first);
  });

  it('adds new documents, preserving old entries and searched_at provenance of the file window', () => {
    const first = mergeCandidates(promise, undefined, [sdoc('A')], new Set(), '2026-01-01').file;
    const res = mergeCandidates(
      promise,
      first,
      [sdoc('N', { titel: 'Reservkraft' })],
      new Set(),
      '2026-10-28',
    );
    expect(res.changed).toBe(true);
    expect(res.file.candidates.map((c) => c.dok_id)).toEqual(['A', 'N']);
    expect(res.file.candidates[0]).toEqual(first.candidates[0]);
    expect(res.file.queries).toEqual(first.queries);
  });

  it('skips rejected pairs but not pairs rejected for other promises', () => {
    const rejected = new Set(['tido-x:A', 'other:B']);
    const { file } = mergeCandidates(
      promise,
      undefined,
      [sdoc('A'), sdoc('B')],
      rejected,
      '2026-10-28',
    );
    expect(file.candidates.map((c) => c.dok_id)).toEqual(['B']);
  });

  it('writes an empty file for a first match without hits, and caps the list', () => {
    const empty = mergeCandidates(promise, undefined, [], new Set(), '2026-10-28');
    expect(empty).toMatchObject({ changed: true, file: { candidates: [] } });
    const many = Array.from({ length: 40 }, (_, i) => sdoc(`D${i}`));
    const capped = mergeCandidates(promise, undefined, many, new Set(), '2026-10-28');
    expect(capped.file.candidates).toHaveLength(MAX_CANDIDATES);
  });
});
