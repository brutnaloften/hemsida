import { describe, expect, it } from 'vitest';
import { joinPages, normalizePageText } from './pdf-text.ts';

describe('normalizePageText', () => {
  it('collapses word-per-line output', () => {
    expect(normalizePageText('Vi\nska\nin­föra\n\n  skatt')).toBe('Vi ska in­föra skatt');
  });
  it('normalises ligatures and non-breaking spaces', () => {
    expect(normalizePageText('ﬂykt ﬁlm')).toBe('flykt film');
  });
  it('puts bullets on their own lines', () => {
    expect(normalizePageText('Vi vill:\n•\nett\n•\ntvå')).toBe('Vi vill:\n• ett\n• två');
  });
  it('does not start with a blank line when a page begins with a bullet', () => {
    expect(normalizePageText('• ett • två')).toBe('• ett\n• två');
  });
});

describe('joinPages', () => {
  it('keeps one form-feed terminated slot per page, blank pages included', () => {
    expect(joinPages(['a\nb', '', 'c'])).toBe('a b\f\fc\f');
  });
});
