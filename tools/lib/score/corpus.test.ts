import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseScoreConfig } from './config.ts';
import { selectCacheDocuments } from './inputs.ts';
import { inShard, parseShard, shardOf } from './shard.ts';

const store = {
  A: { titel: 'Prop A', doktyp: 'prop', datum: '2023-01-10' },
  B: { titel: 'Bet B', doktyp: 'bet', datum: '2024-05-01' },
  C: { titel: '', doktyp: 'prop', datum: '2025-02-02' },
};
const files = ['C.xml', 'A.xml', 'B.xml', 'X.xml', 'notes.txt'];

describe('selectCacheDocuments', () => {
  it('takes every cached document without filters, titling unknown ones by id', () => {
    expect(selectCacheDocuments(files, store, {}).map((d) => [d.id, d.title])).toEqual([
      ['A', 'Prop A'],
      ['B', 'Bet B'],
      ['C', 'C'],
      ['X', 'X'],
    ]);
  });
  it('filters by doktyp and since, dropping documents without store metadata', () => {
    expect(selectCacheDocuments(files, store, { doktyper: ['prop'] }).map((d) => d.id)).toEqual([
      'A',
      'C',
    ]);
    expect(selectCacheDocuments(files, store, { since: '2024-05-01' }).map((d) => d.id)).toEqual([
      'B',
      'C',
    ]);
    expect(
      selectCacheDocuments(files, store, { doktyper: ['prop'], since: '2024-01-01' }).map(
        (d) => d.id,
      ),
    ).toEqual(['C']);
  });
});

describe('shards', () => {
  it('parses i/n and rejects bad specs', () => {
    expect(parseShard('2/5')).toEqual({ index: 2, count: 5 });
    for (const bad of ['0/3', '4/3', '1/0', 'a/b', '3', '1/2/3']) {
      expect(() => parseShard(bad)).toThrow();
    }
  });
  it('is deterministic and splits ids into disjoint, complete slices', () => {
    expect(shardOf('H901SoU1', 7)).toBe(shardOf('H901SoU1', 7));
    expect(shardOf('anything', 1)).toBe(0);
    const ids = Array.from({ length: 500 }, (_, i) => `doc-${i}`);
    const n = 4;
    const slices = Array.from({ length: n }, (_, i) =>
      ids.filter((id) => inShard(id, { index: i + 1, count: n })),
    );
    expect(slices.flat().sort()).toEqual([...ids].sort());
    for (const s of slices) expect(s.length).toBeGreaterThan(70);
  });
});

describe('tido-corpus-v1 config', () => {
  it('parses and shares the eval question template so eval requests stay cached', () => {
    const dir = resolve(import.meta.dirname, '../../score-configs');
    const read = (f: string) => parseScoreConfig(JSON.parse(readFileSync(resolve(dir, f), 'utf8')));
    const corpus = read('tido-corpus-v1.json');
    const evalCfg = read('tido-eval-v1.json');
    expect(corpus.inputs.documents.kind).toBe('cache');
    expect(corpus.question).toEqual(evalCfg.question);
    expect(corpus.scorer).toEqual(evalCfg.scorer);
    expect(corpus.chunk).toEqual(evalCfg.chunk);
  });
});
