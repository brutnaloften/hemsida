import { describe, expect, it } from 'vitest';
import { promiseSchema } from './schema.ts';
import {
  buildPart,
  partId,
  replacePromiseId,
  validatePlan,
  type SplitPart,
} from './split-promises.ts';

const parent = promiseSchema.parse({
  id: 'tido-x',
  term: '2022-2026',
  title: 'X',
  description: 'D',
  source: { id: 'tidoavtalet', page: 5, quote: 'q' },
  parties: ['M'],
  roles: { M: 'government' },
  type: 'legislative',
  area: 'Skola och utbildning',
  committee: 'UbU',
  keywords: ['a'],
  verdict: {
    value: 'unassessed',
    reasoning: '',
    date: '2026-11-11',
    history: [{ value: 'unassessed', reasoning: '', date: '2022-10-14' }],
  },
  evidence: [],
});
const part = (slug: string): SplitPart => ({
  slug,
  title: `T ${slug}`,
  description: 'd',
  page: 6,
  quote: 'qq',
});

describe('split-promises', () => {
  it('builds an unassessed part from the parent with its own text and source', () => {
    const p = buildPart(parent, part('a-del'));
    expect(p.id).toBe('tido-a-del');
    expect(p.source).toEqual({ id: 'tidoavtalet', page: 6, quote: 'qq' });
    expect(p.verdict).toMatchObject({ value: 'unassessed', date: '2022-10-14', history: [] });
    expect(p.verdict.assessedBy).toBeUndefined();
    expect(p.evidence).toEqual([]);
    expect(p.type).toBe('legislative');
    expect(p.parties).toEqual(['M']);
  });

  it('uses the type the plan gives a part, else the parent type', () => {
    expect(buildPart(parent, { ...part('utred-x'), type: 'inquiry' }).type).toBe('inquiry');
    expect(buildPart(parent, part('y')).type).toBe('legislative');
  });

  it('points links at every part and keeps order and uniqueness', () => {
    const json = {
      evidence: [{ kind: 'agreement', promises: ['a', 'tido-x', 'b'] }],
      link: { promises: ['tido-x'] },
    };
    expect(replacePromiseId(json, 'tido-x', ['tido-1', 'tido-2'])).toBe(true);
    expect(json.evidence[0].promises).toEqual(['a', 'tido-1', 'tido-2', 'b']);
    expect(json.link.promises).toEqual(['tido-1', 'tido-2']);
    expect(replacePromiseId(json, 'tido-x', ['tido-1'])).toBe(false);
  });

  it('links the owner of a link only to the parts the plan names, for promises and candidates', () => {
    const targets = (owner?: string) => (owner === 'val-1' ? ['tido-1'] : ['tido-1', 'tido-2']);
    const promise = { id: 'val-1', evidence: [{ kind: 'agreement', promises: ['tido-x'] }] };
    const candidate = { promise: { id: 'val-2' }, link: { promises: ['tido-x'] } };
    expect(replacePromiseId(promise, 'tido-x', ['tido-1', 'tido-2'], targets)).toBe(true);
    expect(replacePromiseId(candidate, 'tido-x', ['tido-1', 'tido-2'], targets)).toBe(true);
    expect(promise.evidence[0].promises).toEqual(['tido-1']);
    expect(candidate.link.promises).toEqual(['tido-1', 'tido-2']);
  });

  it('rejects plans with one part, bad slugs or duplicate ids', () => {
    expect(validatePlan([{ id: 'tido-x', reason: '', parts: [part('a')] }])).toHaveLength(1);
    expect(
      validatePlan([{ id: 'tido-x', reason: '', parts: [part('a'), part('Bad Slug')] }]),
    ).toHaveLength(1);
    expect(
      validatePlan([
        { id: 'tido-x', reason: '', parts: [part('a'), part('b')] },
        { id: 'tido-y', reason: '', parts: [part('b'), part('c')] },
      ]),
    ).toHaveLength(1);
    expect(partId(part('a'))).toBe('tido-a');
    const bad = [
      {
        id: 'tido-x',
        reason: '',
        parts: [part('a'), part('b')],
        redirect: 'zzz',
        links: { o: ['q'] },
      },
    ];
    expect(validatePlan(bad)).toHaveLength(2);
  });
});
