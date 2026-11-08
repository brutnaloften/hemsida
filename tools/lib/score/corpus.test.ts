import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseScoreConfig } from './config.ts';
import { loadInputs, selectCacheDocuments } from './inputs.ts';
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

describe('loadInputs sharding', () => {
  it('never reads text of out-of-shard documents and fails without a store', () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'shard-'));
    const ids = Array.from({ length: 40 }, (_, i) => `d${i}`);
    const textDir = resolve(dir, 'text');
    mkdirSync(textDir);
    for (const id of ids) writeFileSync(resolve(textDir, `${id}.xml`), '');
    const storeFile = resolve(dir, 'store.json');
    const cfg = parseScoreConfig({
      name: 't',
      scorer: { kind: 'fake', model: 'fake' },
      question: { template_version: 'v1', template: '{title} {text}' },
      inputs: {
        promises: { term: '2022-2026', id_prefix: 'tido-' },
        documents: { kind: 'cache' },
      },
      chunk: { max_chars: 2000 },
      limits: {
        max_request_tokens: 62000,
        max_state_plus_question_tokens: 32000,
        chars_per_token: 2.8,
      },
      budget: { max_cost_usd: 1, usd_per_million_tokens: 0.042 },
    });
    const root = resolve(import.meta.dirname, '../../..');
    expect(() => loadInputs(cfg, root, textDir, { storePath: storeFile })).toThrow(/not found/);
    writeFileSync(
      storeFile,
      JSON.stringify({ version: 1, term: '2022-2026', cursors: {}, next_seq: 1, documents: {} }),
    );
    const shard = { index: 1, count: 3 };
    const read: string[] = [];
    const out = loadInputs(cfg, root, textDir, {
      storePath: storeFile,
      shard,
      readText: (p) => {
        read.push(p);
        return '<dokument></dokument>';
      },
    });
    const expected = ids.filter((id) => inShard(id, shard));
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.length).toBeLessThan(ids.length);
    expect(out.documents.map((d) => d.id).sort()).toEqual([...expected].sort());
    expect(read.length).toBe(expected.length);
    rmSync(dir, { recursive: true, force: true });
  });
});
