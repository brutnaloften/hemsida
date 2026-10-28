import { describe, expect, it } from 'vitest';
import type { Evidence } from '@/schema/promise';
import { buildReverseIndex, linkedRiksdagTimelines } from '@/lib/agreement-links';

const doc = (dok_id: string, date: string): Evidence => ({
  kind: 'prop',
  dok_id,
  designation: dok_id,
  title: dok_id,
  date,
  url: 'https://example.com',
  relevance: 'full',
  note: null,
});
const agreement = (promises: string[]): Evidence => ({
  kind: 'agreement',
  source: 'tidoavtalet',
  date: '2022-10-14',
  promises,
  outcome: promises.length ? 'included' : 'not_addressed',
  note: null,
});
const p = (id: string, title: string, evidence: Evidence[] = []) => ({ id, title, evidence });

describe('buildReverseIndex', () => {
  it('maps agreement promise ids to linking promises, sorted by title', () => {
    const b = p('b', 'Beta', [agreement(['t1', 't2'])]);
    const a = p('a', 'Alfa', [agreement(['t1'])]);
    const none = p('n', 'Ingen', [agreement([])]);
    const idx = buildReverseIndex([b, a, none, p('t1', 'T1')]);
    expect(idx.get('t1')).toEqual([a, b]);
    expect(idx.get('t2')).toEqual([b]);
    expect(idx.has('n')).toBe(false);
  });
});

describe('linkedRiksdagTimelines', () => {
  const t1 = p('t1', 'Tidö 1', [doc('b', '2024-01-01'), doc('a', '2023-01-01')]);
  const t2 = p('t2', 'Tidö 2');
  const byId = new Map([t1, t2].map((x) => [x.id, x]));

  it('returns ordered Riksdag evidence per linked promise, omitting empty ones', () => {
    const m = p('m', 'Manifest', [agreement(['t1', 't2', 'missing'])]);
    const out = linkedRiksdagTimelines(m, byId);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('t1');
    expect(out[0].evidence.map((e) => e.dok_id)).toEqual(['a', 'b']);
  });

  it('is empty when nothing is linked or linked promises have no evidence', () => {
    expect(linkedRiksdagTimelines(p('m', 'M', [agreement([])]), byId)).toEqual([]);
    expect(linkedRiksdagTimelines(p('m', 'M', [agreement(['t2'])]), byId)).toEqual([]);
  });
});
