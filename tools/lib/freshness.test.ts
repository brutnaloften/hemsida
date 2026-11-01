import { describe, expect, it } from 'vitest';
import { freshnessManifestSchema, withEntry } from './freshness.ts';

const entry = { source: 'https://example.com/x', fetchedAt: '2026-11-01', latestPeriod: '2025' };

describe('freshness manifest', () => {
  it('adds and replaces entries, sorted by id', () => {
    let m = withEntry({ datasets: {} }, 'macro', entry);
    m = withEntry(m, 'budget', entry);
    m = withEntry(m, 'macro', { ...entry, latestPeriod: '2026' });
    expect(Object.keys(m.datasets)).toEqual(['budget', 'macro']);
    expect(m.datasets.macro!.latestPeriod).toBe('2026');
  });

  it('rejects malformed entries', () => {
    expect(() => withEntry({ datasets: {} }, 'a', { ...entry, fetchedAt: 'yesterday' })).toThrow();
    expect(() => withEntry({ datasets: {} }, 'a', { ...entry, latestPeriod: 'latest' })).toThrow();
    expect(
      freshnessManifestSchema.safeParse({ datasets: { a: { ...entry, extra: 1 } } }).success,
    ).toBe(false);
  });
});
