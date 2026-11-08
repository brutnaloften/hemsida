import { describe, expect, it } from 'vitest';
import { candidateFileSchema, type CandidateFile } from './riksdag-candidates.ts';
import type { StoredDocument } from './riksdag-ingest.ts';
import {
  formatSummary,
  linkPromise,
  scoresByPromise,
  summarise,
  type LinkOptions,
} from './score-link.ts';

const opts: LinkOptions = { runName: 'r1', threshold: 0.5, topK: 2, today: '2026-11-08' };
const promise = { id: 'tido-x', term: '2022-2026', keywords: [] };

function sdoc(id: string, extra: Partial<StoredDocument> = {}): StoredDocument {
  return {
    seq: 1,
    dok_id: id,
    doktyp: 'bet',
    rm: '2023/24',
    beteckning: 'NU1',
    titel: id,
    datum: '2024-01-01',
    organ: 'NU',
    url: `https://data.riksdagen.se/dokument/${id}.html`,
    text: '',
    ...extra,
  };
}
const docs = Object.fromEntries(['A', 'B', 'C', 'D', 'E'].map((i) => [i, sdoc(i)]));

function existingFile(ids: string[]): CandidateFile {
  return {
    promise_id: 'tido-x',
    searched_at: '2026-10-28',
    window: { from: '2022-09-01', tom: '2026-09-30' },
    queries: ['keyword:x'],
    candidates: ids.map((id) => ({ ...sdoc(id), found_by: ['keyword:x'], score: 1 })),
  };
}

const scores = (o: Record<string, number>) => new Map(Object.entries(o));

describe('scoresByPromise', () => {
  it('inverts document -> promise into promise -> document', () => {
    const m = scoresByPromise({
      A: { p1: { score: 0.9, best_chunk: 0 }, p2: { score: 0.1, best_chunk: 1 } },
      B: { p1: { score: 0.2, best_chunk: 0 } },
    });
    expect(m.get('p1')?.get('A')).toBe(0.9);
    expect(m.get('p2')?.size).toBe(1);
  });
});

describe('linkPromise', () => {
  it('creates a file from scores with relevance and the score label, best first, capped at top-k', () => {
    const r = linkPromise(
      promise,
      undefined,
      scores({ A: 0.7, B: 0.9, C: 0.6, D: 0.3 }),
      docs,
      new Set(),
      opts,
    );
    expect(r.changed).toBe(true);
    expect(r.file.candidates.map((c) => c.dok_id)).toEqual(['B', 'A']);
    expect(r.file.candidates[0]).toMatchObject({
      found_by: ['score:r1'],
      relevance: 0.9,
      score: 1,
    });
    expect(r.file.queries).toContain('score:r1');
    expect(() => candidateFileSchema.parse(r.file)).not.toThrow();
    expect(r.report.high).toBe(3);
    expect(r.report.added).toBe(2);
  });

  it('keeps existing entries, annotates scored ones and reports the recall gain', () => {
    const existing = existingFile(['A', 'D', 'E']);
    const r = linkPromise(
      promise,
      existing,
      scores({ A: 0.8, D: 0.2, B: 0.95 }),
      docs,
      new Set(),
      opts,
    );
    const ids = r.file.candidates.map((c) => c.dok_id);
    expect(ids).toEqual(['A', 'D', 'E', 'B']);
    expect(r.file.candidates[0]).toMatchObject({
      found_by: ['keyword:x', 'score:r1'],
      relevance: 0.8,
      score: 1,
    });
    expect(r.file.candidates[2]).toEqual(existing.candidates[2]); // E not scored: untouched
    expect(r.report).toMatchObject({
      high: 2,
      high_in_keywords: 1,
      high_missed: [{ dok_id: 'B', score: 0.95 }],
      keyword_low: [{ dok_id: 'D', score: 0.2 }],
      keyword_unscored: 1,
      keyword_total: 3,
      added: 1,
    });
  });

  it('skips rejected pairs and documents outside the store or the term window', () => {
    const odd = { ...docs, C: sdoc('C', { datum: '2020-01-01' }) };
    const r = linkPromise(
      promise,
      undefined,
      scores({ A: 0.9, B: 0.9, C: 0.9, Z: 0.9 }),
      odd,
      new Set(['tido-x:A']),
      { ...opts, topK: 10 },
    );
    expect(r.file.candidates.map((c) => c.dok_id)).toEqual(['B']);
    expect(r.report.skipped_rejected).toBe(1);
    expect(r.report.skipped_unknown).toBe(2);
  });

  it('is idempotent: a second run over its own output changes nothing', () => {
    const s = scores({ A: 0.7, B: 0.9, D: 0.1 });
    const first = linkPromise(promise, existingFile(['D']), s, docs, new Set(), opts);
    const second = linkPromise(promise, first.file, s, docs, new Set(), opts);
    expect(second.changed).toBe(false);
    expect(second.file).toBe(first.file);
    expect(second.report).toEqual(first.report);
  });

  it('does not count score-only entries from earlier runs as keyword candidates', () => {
    const prior = linkPromise(promise, undefined, scores({ A: 0.9 }), docs, new Set(), {
      ...opts,
      runName: 'old',
    });
    const r = linkPromise(promise, prior.file, scores({ A: 0.9, B: 0.1 }), docs, new Set(), opts);
    expect(r.report).toMatchObject({ keyword_total: 0, high_in_keywords: 0 });
    expect(r.report.high_missed).toEqual([{ dok_id: 'A', score: 0.9 }]);
  });

  it('adds the run label only to entries at or above the threshold', () => {
    const r = linkPromise(
      promise,
      existingFile(['A', 'D']),
      scores({ A: 0.8, D: 0.2 }),
      docs,
      new Set(),
      opts,
    );
    expect(r.file.candidates[0]!.found_by).toContain('score:r1');
    expect(r.file.candidates[1]!.found_by).toEqual(['keyword:x']);
    expect(r.file.candidates[1]!.relevance).toBe(0.2);
  });

  it('reports no change and no file content when nothing scores high', () => {
    const r = linkPromise(promise, undefined, scores({ A: 0.1 }), docs, new Set(), opts);
    expect(r.changed).toBe(false);
    expect(r.report.high).toBe(0);
  });
});

describe('summarise', () => {
  it('totals the per-promise reports', () => {
    const a = linkPromise(
      promise,
      existingFile(['A', 'D']),
      scores({ A: 0.8, D: 0.2, B: 0.9 }),
      docs,
      new Set(),
      opts,
    );
    const s = summarise([a.report], opts, 5);
    expect(s).toMatchObject({
      high_pairs: 2,
      high_in_keywords: 1,
      high_missed: 1,
      keyword_low: 1,
      keyword_recall_of_high: 0.5,
      promises_with_gain: 1,
    });
    expect(formatSummary(s)).toContain('missed by keywords: 1 across 1 promises');
  });
});
