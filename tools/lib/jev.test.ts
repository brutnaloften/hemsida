import { describe, expect, it } from 'vitest';
import { auc, chunkParagraphs, JevError } from './jev.ts';

describe('chunkParagraphs', () => {
  it('packs paragraphs without splitting them', () => {
    expect(chunkParagraphs(['aaaa', 'bbbb', 'cccc'], 9)).toEqual(['aaaa\nbbbb', 'cccc']);
  });
  it('truncates a paragraph longer than the limit', () => {
    expect(chunkParagraphs(['x'.repeat(20)], 10)).toEqual(['x'.repeat(10)]);
  });
});

describe('auc', () => {
  it('is 1 for perfect separation, 0.5 for ties and NaN without both classes', () => {
    expect(auc([0.9, 0.8], [0.1, 0.2])).toBe(1);
    expect(auc([0.5], [0.5])).toBe(0.5);
    expect(auc([], [0.5])).toBeNaN();
  });
});

describe('JevError', () => {
  it('recognises the too-long response', () => {
    expect(new JevError(400, '{"detail":{"error_type":"max_tokens_exceeded"}}').tooLong).toBe(true);
    expect(new JevError(500, 'max_tokens_exceeded').tooLong).toBe(false);
  });
});
