import { describe, expect, it } from 'vitest';
import type { FreshnessManifest } from './freshness.ts';
import { checkFreshness, expectedYear, type Rule } from './freshness-check.ts';
import { riksdagLatestPeriod } from './riksdag-ingest.ts';

const annual = { kind: 'annual', month: 7, day: 1 } as const;
const rules: Record<string, Rule> = {
  a: annual,
  r: { kind: 'max-age', days: 30, closeAfter: '2026-10-31' },
};
const e = (fetchedAt: string, latestPeriod: string) => ({
  source: 'https://example.com',
  fetchedAt,
  latestPeriod,
});
const m = (datasets: FreshnessManifest['datasets']): FreshnessManifest => ({ datasets });
const stale = (manifest: FreshnessManifest, today: string) =>
  Object.fromEntries(checkFreshness(manifest, today, rules).map((v) => [v.id, v.stale]));

describe('expectedYear', () => {
  it('switches on the rule date', () => {
    expect(expectedYear(annual, '2026-06-30')).toBe(2024);
    expect(expectedYear(annual, '2026-07-01')).toBe(2025);
    expect(expectedYear(annual, '2026-12-31')).toBe(2025);
  });
});

describe('checkFreshness', () => {
  const r = e('2026-10-31', '2026-10');
  it('flags annual data older than expected', () => {
    expect(stale(m({ a: e('2026-01-01', '2024'), r }), '2026-11-01').a).toBe(true);
    expect(stale(m({ a: e('2026-01-01', '2025'), r }), '2026-11-01').a).toBe(false);
    expect(stale(m({ a: e('2026-01-01', '2024'), r }), '2026-06-30').a).toBe(false);
  });
  it('flags missing entries', () => {
    expect(stale(m({}), '2026-11-01')).toEqual({ a: true, r: true });
  });
  it('flags old fetches until the final snapshot is taken', () => {
    const a = e('2026-01-01', '2025');
    expect(stale(m({ a, r: e('2026-09-01', '2026-08') }), '2026-10-15').r).toBe(true);
    expect(stale(m({ a, r: e('2026-09-20', '2026-08') }), '2026-10-15').r).toBe(false);
    expect(stale(m({ a, r }), '2030-01-01').r).toBe(false);
  });
  it('notes datasets without a rule as not stale', () => {
    const v = checkFreshness(m({ x: e('2026-01-01', '2025') }), '2026-11-01', {});
    expect(v).toEqual([{ id: 'x', stale: false, reason: 'no rule configured' }]);
  });
});

describe('riksdagLatestPeriod', () => {
  it('is the oldest cursor once every doktyp has one', () => {
    expect(riksdagLatestPeriod({ bet: '2026-05-01', prop: '2026-03-01' }, ['bet', 'prop'])).toBe(
      '2026-03-01',
    );
  });
  it('is undefined while a doktyp has no cursor', () => {
    expect(riksdagLatestPeriod({ bet: '2026-05-01' }, ['bet', 'prop'])).toBeUndefined();
  });
});
