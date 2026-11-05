import { describe, expect, it } from 'vitest';
import { evalFileSchema, evalPairSchema, modelLabelsFileSchema } from './eval.ts';

const pair = {
  id: 'p::d',
  promise_id: 'p',
  promise_title: 't',
  promise_text: 'x',
  promise_quote: 'q',
  document_id: 'd',
  document_title: 'T',
  document_type: 'bet',
  snippet: 's',
  url: 'https://example.org',
  search_score: 2,
  label: null,
};

describe('evalPairSchema', () => {
  it('accepts unlabelled and labelled pairs', () => {
    expect(evalPairSchema.safeParse(pair).success).toBe(true);
    expect(evalPairSchema.safeParse({ ...pair, label: 'partial', note: 'n' }).success).toBe(true);
  });
  it('rejects unknown labels', () => {
    expect(evalPairSchema.safeParse({ ...pair, label: 'yes' }).success).toBe(false);
  });
  it('rejects unknown keys such as a typo', () => {
    expect(evalPairSchema.safeParse({ ...pair, lable: 'match' }).success).toBe(false);
    expect(evalFileSchema.safeParse({ term: 't', seed: 1, pairs: [], extra: 1 }).success).toBe(
      false,
    );
  });
  it('parses a file', () => {
    expect(evalFileSchema.safeParse({ term: '2022-2026', seed: 1, pairs: [pair] }).success).toBe(
      true,
    );
  });
});

describe('modelLabelsFileSchema', () => {
  const ok = { label: 'partial', confidence: 'low', reason: 'Only a directive.' };
  it('accepts judgements keyed by pair id and model, with optional stage', () => {
    const file = {
      term: '2022-2026',
      meta: { generated: '2026-11-04', method: 'blind', models: { sonnet: 'alias sonnet' } },
      labels: { 'a::b': { sonnet: ok, opus: { ...ok, stage: 'preparatory' } } },
    };
    expect(modelLabelsFileSchema.safeParse(file).success).toBe(true);
  });
  it('rejects an empty reason and unknown labels', () => {
    expect(
      modelLabelsFileSchema.safeParse({
        term: 't',
        meta: { generated: 'd', method: 'm', models: {} },
        labels: { x: { m: { ...ok, reason: '' } } },
      }).success,
    ).toBe(false);
    expect(
      modelLabelsFileSchema.safeParse({
        term: 't',
        meta: { generated: 'd', method: 'm', models: {} },
        labels: { x: { m: { ...ok, label: 'yes' } } },
      }).success,
    ).toBe(false);
  });
});
