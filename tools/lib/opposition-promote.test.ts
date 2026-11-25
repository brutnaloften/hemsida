import { describe, expect, it } from 'vitest';
import type { ManifestoEntry } from './manifesto-extract.ts';
import { VAGUE_REASONING } from './manifesto-promote.ts';
import {
  assertEntriesMatch,
  promotionMapFileName,
  protectedPromises,
  promoteManifesto,
  promoteOpposition,
  renderPromotionMap,
} from './opposition-promote.ts';
import { promiseSchema, type PromiseRecord } from './schema.ts';

function promise(id: string, over: Partial<PromiseRecord> = {}): PromiseRecord {
  return promiseSchema.parse({
    id: `val2022-s-${id}`,
    term: '2022-2026',
    title: 'Titel',
    description: 'Beskrivning.',
    source: { id: 'valmanifest-2022-s', page: 4, quote: 'Citat' },
    parties: ['S'],
    roles: { S: 'opposition' },
    type: 'legislative',
    area: 'Energi',
    committee: 'JuU',
    keywords: ['a', 'b', 'c'],
    verdict: { value: 'unassessed', reasoning: '', date: '2026-11-01', history: [] },
    evidence: [],
    ...over,
  });
}

const entry = (p: PromiseRecord, link?: ManifestoEntry['link']): ManifestoEntry => ({
  section: 'Avsnitt',
  promise: p,
  ...(link ? { link } : {}),
});

describe('promoteOpposition', () => {
  it('sets vague promises to not_assessable and keeps the rest unassessed', () => {
    const out = promoteOpposition(
      [entry(promise('a')), entry(promise('b', { type: 'vague' }))],
      'S',
    );
    expect(out[0]!.verdict.value).toBe('unassessed');
    expect(out[1]!.verdict).toEqual({
      value: 'not_assessable',
      reasoning: VAGUE_REASONING,
      date: '2026-11-01',
      history: [],
    });
  });

  it('keeps evidence empty', () => {
    const out = promoteOpposition([entry(promise('a'))], 'S');
    expect(out[0]!.evidence).toEqual([]);
  });

  it('throws on a candidate with a Tidö link', () => {
    const link = {
      promises: [],
      outcome: 'not_addressed' as const,
      note: null,
      rationale: 'x',
    };
    expect(() => promoteOpposition([entry(promise('a'), link)], 'S')).toThrow(/agreement link/);
  });

  it('throws when the party is not in opposition', () => {
    const p = promise('a', { roles: { S: 'government' } });
    expect(() => promoteOpposition([entry(p)], 'S')).toThrow(/not opposition/);
  });

  const p2026 = (id: string, over: Partial<PromiseRecord> = {}) =>
    promise(id, {
      id: `val2026-s-${id}`,
      term: '2026-2030',
      source: { id: 'valmanifest-2026-s', page: 2 },
      roles: { S: 'government' },
      ...over,
    });

  it('promoteManifesto accepts any role and term when no role is required', () => {
    const out = promoteManifesto([entry(p2026('a')), entry(p2026('b', { type: 'vague' }))], 'S');
    expect(out.map((p) => p.verdict.value)).toEqual(['unassessed', 'not_assessable']);
  });

  it('promoteManifesto enforces a role only when asked, and checks party and unique ids', () => {
    expect(() => promoteManifesto([entry(p2026('a'))], 'S', { requireRole: 'opposition' })).toThrow(
      /not opposition/,
    );
    expect(() => promoteManifesto([entry(p2026('a'))], 'V')).toThrow(/not a promise party/);
    expect(() => promoteManifesto([entry(p2026('a')), entry(p2026('a'))], 'S')).toThrow(/unique/);
  });

  it('renderPromotionMap has no party- or term-specific wording', () => {
    const entries = [entry(p2026('a')), entry(p2026('b', { type: 'vague' }))];
    const doc = renderPromotionMap({
      title: 'S 2026',
      sourceId: 'valmanifest-2026-s',
      term: '2026-2030',
      party: 'S',
      prefix: 'val2026-s-',
      entries,
      promises: promoteManifesto(entries, 'S'),
    });
    expect(doc).toContain('src/data/2026-2030/promises/');
    expect(doc).toContain('`val2026-s-b`');
    expect(doc).not.toMatch(/Tidö|2022/);
  });

  it('keys the audit doc file name by id prefix so terms do not collide', () => {
    expect(promotionMapFileName('val2026-s-')).toBe('manifesto-promotion-map-val2026-s.md');
    expect(promotionMapFileName('val2022-s-')).not.toBe(promotionMapFileName('val2026-s-'));
  });

  it('assertEntriesMatch rejects entries from another term or source', () => {
    const ok = [entry(p2026('a'))];
    expect(() => assertEntriesMatch(ok, '2026-2030', 'valmanifest-2026-s')).not.toThrow();
    expect(() => assertEntriesMatch(ok, '2022-2026', 'valmanifest-2026-s')).toThrow(/--term/);
    expect(() => assertEntriesMatch(ok, '2026-2030', 'valmanifest-2022-s')).toThrow(/--source/);
  });

  it('protectedPromises flags evidence and verdicts beyond unassessed/not_assessable', () => {
    const verdict = (value: PromiseRecord['verdict']['value']) => ({
      ...promise('x').verdict,
      value,
    });
    const base = promise('x');
    const fulfilled = { ...base, id: 'f', verdict: verdict('fulfilled') };
    const evid = {
      ...base,
      id: 'e',
      evidence: [
        {
          kind: 'agreement' as const,
          source: 'tidoavtalet',
          date: '2022-10-14',
          promises: [],
          outcome: 'not_addressed' as const,
          note: null,
        },
      ],
    };
    const clean = [
      { ...base, id: 'u' },
      { ...base, id: 'n', verdict: verdict('not_assessable') },
    ];
    expect(protectedPromises([...clean, fulfilled, evid])).toEqual(['f', 'e']);
    expect(protectedPromises(clean)).toEqual([]);
  });

  it('throws when a candidate already carries evidence', () => {
    const p = promise('a');
    p.evidence = [
      {
        kind: 'agreement',
        source: 'tidoavtalet',
        date: '2022-10-14',
        promises: [],
        outcome: 'not_addressed',
        note: null,
      },
    ];
    expect(() => promoteOpposition([entry(p)], 'S')).toThrow(/evidence/);
  });
});
