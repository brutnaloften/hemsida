import { describe, expect, it } from 'vitest';
import { viewUrl } from '@/lib/budget/url';

const base = { year: 2025, nodeId: null, mindre: 0, advanced: false, fasta: false };
const home = '/budget/stat/';

describe('viewUrl', () => {
  it('keeps the path of a static drill page when the trees are not loaded', () => {
    const url = viewUrl(
      { ...base, nodeId: 'uo:9', advanced: true },
      2025,
      undefined,
      '/budget/stat/utgifter/9/',
      home,
    );
    expect(url).toBe('/budget/stat/utgifter/9/?avancerat=1');
  });

  it('uses the node href once the trees are loaded', () => {
    expect(
      viewUrl(
        { ...base, nodeId: 'uo:9', year: 2020 },
        2025,
        '/budget/stat/utgifter/9/',
        '/x/',
        home,
      ),
    ).toBe('/budget/stat/utgifter/9/?ar=2020');
  });

  it('writes both flags, and priser only in advanced mode', () => {
    expect(viewUrl({ ...base, advanced: true, fasta: true }, 2025, undefined, home, home)).toBe(
      '/budget/stat/?avancerat=1&priser=fasta',
    );
    expect(viewUrl({ ...base, fasta: true }, 2025, undefined, home, home)).toBe(home);
  });

  it('falls back to the balance view from an unrelated path', () => {
    expect(viewUrl(base, 2025, undefined, '/budget/stat/utgifter/', home)).toBe(home);
  });
});
