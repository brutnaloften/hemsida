import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { freshnessManifestSchema, loadManifest, recordFreshness, withEntry } from './freshness.ts';

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

describe('loadManifest', () => {
  it('treats a missing file as empty and throws on an invalid one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fresh-'));
    try {
      const path = join(dir, 'freshness.json');
      expect(loadManifest(path)).toEqual({ datasets: {} });
      writeFileSync(path, JSON.stringify({ datasets: { a: { source: 'nope' } } }));
      expect(() => loadManifest(path)).toThrow(/Invalid freshness manifest/);
      writeFileSync(path, JSON.stringify({ datasets: {} }));
      recordFreshness(path, 'a', entry);
      expect(loadManifest(path).datasets.a).toEqual(entry);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});
