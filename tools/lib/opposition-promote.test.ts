import { describe, expect, it } from 'vitest';
import type { ManifestoEntry } from './manifesto-extract.ts';
import { VAGUE_REASONING } from './manifesto-promote.ts';
import { promoteOpposition } from './opposition-promote.ts';
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
    area: 'Område',
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
    expect(() => promoteOpposition([entry(promise('a'), link)], 'S')).toThrow(/Tidö link/);
  });

  it('throws when the party is not in opposition', () => {
    const p = promise('a', { roles: { S: 'government' } });
    expect(() => promoteOpposition([entry(p)], 'S')).toThrow(/not opposition/);
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
