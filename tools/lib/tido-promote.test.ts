import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadJson } from './json.ts';
import { promiseSchema, type PromiseRecord } from './schema.ts';
import { MERGES, promote, remapLinkPromises, type Candidate } from './tido-promote.ts';

const dataDir = resolve(import.meta.dirname, '../../src/data/2022-2026');
const candidates = loadJson(resolve(dataDir, 'candidates/tidoavtalet.json')) as Candidate[];
const promisesDir = resolve(dataDir, 'promises');
const tidoFiles = readdirSync(promisesDir).filter((f) => f.startsWith('tido-'));

describe('promote', () => {
  const result = promote(candidates);

  it('accounts for every candidate exactly once', () => {
    expect(result.map).toHaveLength(candidates.length);
    expect(new Set(result.map.map((m) => m.candidate)).size).toBe(candidates.length);
    const absorbed = MERGES.reduce((n, m) => n + m.absorbed.length, 0);
    expect(result.promises).toHaveLength(candidates.length - absorbed);
  });

  it('produces unique tido- ascii ids that validate', () => {
    const ids = result.promises.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of result.promises) {
      expect(p.id).toMatch(/^tido-[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(promiseSchema.safeParse(p).success).toBe(true);
    }
  });

  it('sets no verdict other than unassessed, or not_assessable for vague', () => {
    for (const p of result.promises) {
      expect(p.verdict.value).toBe(p.type === 'vague' ? 'not_assessable' : 'unassessed');
      expect(p.evidence).toEqual([]);
    }
  });

  it('rejects a merge that references an unknown candidate', () => {
    expect(() => promote(candidates.slice(0, 5))).toThrow(/unknown candidate/);
  });
});

describe('committed promise files', () => {
  it('has the files the script generates', () => {
    expect([...tidoFiles].sort()).toEqual(
      promote(candidates)
        .promises.map((p) => `${p.id}.json`)
        .sort(),
    );
  });

  it('validates every file against the schema, with the id matching the file name', () => {
    for (const f of tidoFiles) {
      const parsed = promiseSchema.parse(loadJson(resolve(promisesDir, f)));
      expect(`${parsed.id}.json`).toBe(f);
    }
  });

  it('has ids unique across all promise files', () => {
    const all = readdirSync(promisesDir).map(
      (f) => (loadJson(resolve(promisesDir, f)) as PromiseRecord).id,
    );
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('candidate links', () => {
  it('remaps absorbed and renamed ids and drops duplicates', () => {
    const { map } = promote(candidates);
    expect(
      remapLinkPromises(
        [
          'tido-sfi-yrkesutbildning-alla-kommuner',
          'tido-obligatorisk-samhallsintroduktion-och-samhallsorientering',
          'tido-lobok-per-elev-och-amne',
        ],
        map,
      ),
    ).toEqual([
      'tido-obligatorisk-samhallsintroduktion-och-samhallsorientering',
      'tido-larobok-per-elev-och-amne',
    ]);
  });

  it('resolves every link.promises id in the candidate files to a committed promise', () => {
    const candidatesDir = resolve(dataDir, 'candidates');
    const ids = new Set(readdirSync(promisesDir).map((f) => f.replace(/\.json$/, '')));
    for (const f of readdirSync(candidatesDir)) {
      if (f === 'tidoavtalet.json') continue;
      const entries = loadJson(resolve(candidatesDir, f)) as { link?: { promises?: string[] } }[];
      for (const e of entries) {
        for (const id of e.link?.promises ?? []) {
          expect(ids.has(id), `${f}: ${id}`).toBe(true);
        }
      }
    }
  });
});
