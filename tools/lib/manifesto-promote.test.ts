import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadJson } from './json.ts';
import {
  AGREEMENT_SOURCE,
  ID_PREFIX,
  promote,
  type ManifestoCandidate,
} from './manifesto-promote.ts';
import { promiseSchema, sourceSchema, type PromiseRecord } from './schema.ts';

const dataDir = resolve(import.meta.dirname, '../../src/data/2022-2026');
const candidates = loadJson(
  resolve(dataDir, 'candidates/valmanifest-2022-l.json'),
) as ManifestoCandidate[];
const promisesDir = resolve(dataDir, 'promises');
const files = readdirSync(promisesDir).filter((f) => f.startsWith(ID_PREFIX));
const committed = files.map((f) => loadJson(resolve(promisesDir, f)) as PromiseRecord);
const allIds = new Set(readdirSync(promisesDir).map((f) => f.replace(/\.json$/, '')));

describe('promote', () => {
  const result = promote(candidates);

  it('turns every candidate into one promise', () => {
    expect(result.promises).toHaveLength(candidates.length);
    expect(new Set(result.map.map((m) => m.promise)).size).toBe(candidates.length);
  });

  it('rejects an editorial table entry for an unknown candidate', () => {
    expect(() => promote(candidates.slice(0, 5))).toThrow(/unknown candidate/);
  });

  it('keeps ids permanent apart from the listed renames', () => {
    const renamed = result.map.filter((m) => m.candidate !== m.promise);
    expect(renamed).toHaveLength(7);
  });
});

describe('committed promise files', () => {
  it('match what the script generates', () => {
    expect([...files].sort()).toEqual(
      promote(candidates)
        .promises.map((p) => `${p.id}.json`)
        .sort(),
    );
    for (const p of committed) {
      expect(p).toEqual(promote(candidates).promises.find((q) => q.id === p.id));
    }
  });

  it('validate, with unique ids matching their file names', () => {
    expect(new Set(committed.map((p) => p.id)).size).toBe(committed.length);
    files.forEach((f, i) => {
      expect(promiseSchema.safeParse(committed[i]).success).toBe(true);
      expect(committed[i]!.id + '.json').toBe(f);
    });
  });

  it('have exactly one agreement entry for tidoavtalet, first in evidence', () => {
    const source = sourceSchema.parse(loadJson(resolve(dataDir, '../sources/tidoavtalet.json')));
    expect(source.kind).toBe('government_agreement');
    for (const p of committed) {
      const agreements = p.evidence.filter((e) => e.kind === 'agreement');
      expect(agreements).toHaveLength(1);
      const a = agreements[0]!;
      expect(p.evidence[0]).toBe(a);
      if (a.kind !== 'agreement') throw new Error('unreachable');
      expect(a.source).toBe(AGREEMENT_SOURCE);
      expect(a.date).toBe(source.date);
      expect(a.promises.length === 0).toBe(a.outcome === 'not_addressed');
    }
  });

  it('link only to committed tido- promises', () => {
    for (const p of committed) {
      for (const e of p.evidence) {
        if (e.kind !== 'agreement') continue;
        for (const id of e.promises) {
          expect(id).toMatch(/^tido-/);
          expect(allIds.has(id), `${p.id} links to missing ${id}`).toBe(true);
        }
      }
    }
  });

  it('set no verdict other than unassessed, or not_assessable for vague', () => {
    for (const p of committed) {
      expect(p.verdict.value).toBe(p.type === 'vague' ? 'not_assessable' : 'unassessed');
    }
  });

  it('carry no review-only fields', () => {
    for (const p of committed) {
      expect(p).not.toHaveProperty('section');
      expect(p).not.toHaveProperty('rationale');
    }
  });
});
