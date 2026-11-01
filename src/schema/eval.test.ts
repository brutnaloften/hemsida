import { describe, expect, it } from 'vitest';
import { evalFileSchema, evalPairSchema } from './eval.ts';

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
  it('parses a file', () => {
    expect(evalFileSchema.safeParse({ term: '2022-2026', seed: 1, pairs: [pair] }).success).toBe(
      true,
    );
  });
});
