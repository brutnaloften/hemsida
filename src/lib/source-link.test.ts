import { describe, expect, it } from 'vitest';
import { sourceLinks } from './source-link';

const base = {
  url: 'https://example.com/a',
  archive: 'https://web.archive.org/web/2024/https://example.com/a',
};

describe('sourceLinks', () => {
  it('shows both links while the original is alive', () => {
    expect(sourceLinks(base)).toEqual({ original: base.url, archive: base.archive });
  });
  it('hides the original and keeps the archive when it is dead', () => {
    expect(sourceLinks({ ...base, urlDeadAsOf: '2026-10-28' })).toEqual({
      original: undefined,
      archive: base.archive,
    });
  });
});
