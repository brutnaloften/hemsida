import { describe, expect, it } from 'vitest';
import {
  buildPool,
  mergeLabels,
  samplePairs,
  stratumOf,
  toEvalPair,
  type EvalPromise,
} from './eval-set.ts';
import type { CandidateDocument, CandidateFile } from './riksdag-candidates.ts';

const types = ['dir', 'sou', 'ds', 'prop', 'bet'];

function doc(i: number, doktyp: string, score: number): CandidateDocument {
  return {
    dok_id: `D${i}`,
    doktyp,
    rm: '2023/24',
    beteckning: `${i}`,
    datum: '2024-01-01',
    titel: `Titel ${i}`,
    organ: 'JuU',
    url: `https://data.riksdagen.se/dokument/D${i}.html`,
    found_by: ['all-keywords'],
    score,
  };
}

const promises = new Map<string, EvalPromise>();
const files: CandidateFile[] = [];
let n = 0;
for (let p = 0; p < 20; p++) {
  promises.set(`p${p}`, {
    id: `p${p}`,
    title: `Löfte ${p}`,
    description: 'Beskrivning',
    area: `area${p % 5}`,
    source: { quote: 'citat' },
  });
  const candidates: CandidateDocument[] = [];
  for (const t of ['dir', 'sou', 'prop', 'bet']) {
    for (const s of [1, 2, 5]) candidates.push(doc(n++, t, s));
  }
  files.push({
    promise_id: `p${p}`,
    searched_at: '2026-01-01',
    window: { from: 'a', tom: 'b' },
    queries: [],
    candidates,
  });
}

describe('samplePairs', () => {
  const pool = buildPool(promises, files, types);
  it('is deterministic for a seed and differs across seeds', () => {
    const a = samplePairs(pool, 24, 1).map((p) => p.doc.dok_id);
    expect(samplePairs([...pool].reverse(), 24, 1).map((p) => p.doc.dok_id)).toEqual(a);
    expect(samplePairs(pool, 24, 2).map((p) => p.doc.dok_id)).not.toEqual(a);
  });
  it('covers every stratum, including low-score negatives, without repeating a document', () => {
    const picked = samplePairs(pool, 24, 1);
    expect(new Set(picked.map((p) => stratumOf(p.doc))).size).toBe(12);
    expect(new Set(picked.map((p) => p.doc.dok_id)).size).toBe(24);
    expect(picked.filter((p) => p.doc.score === 1).length).toBeGreaterThanOrEqual(6);
  });
  it('prefers distinct promises', () => {
    const picked = samplePairs(pool, 20, 3);
    expect(new Set(picked.map((p) => p.promise.id)).size).toBe(20);
  });
  it('returns fewer pairs when the pool is small', () => {
    expect(samplePairs(pool.slice(0, 3), 10, 1)).toHaveLength(3);
  });
});

describe('toEvalPair / mergeLabels', () => {
  const pair = toEvalPair(samplePairs(buildPool(promises, files, types), 1, 1)[0]!);
  it('builds an unlabelled pair', () => {
    expect(pair.label).toBeNull();
    expect(pair.id).toBe(`${pair.promise_id}::${pair.document_id}`);
    expect(pair.snippet).toContain('JuU');
  });
  it('keeps existing labels on regeneration', () => {
    const merged = mergeLabels([pair], [{ ...pair, label: 'match', note: 'ok' }]);
    expect(merged[0]).toMatchObject({ label: 'match', note: 'ok' });
  });
});
