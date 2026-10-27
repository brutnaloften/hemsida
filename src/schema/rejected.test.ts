import { describe, expect, it } from 'vitest';
import { rejectedCandidatesFileSchema, rejectedKey, rejectedKeys } from '@/schema/rejected';

const row = { promise_id: 'tido-skarpta-straff-gangbrott', dok_id: 'HA03123' };

describe('rejectedCandidatesFileSchema', () => {
  it('accepts an empty file and minimal rows', () => {
    expect(rejectedCandidatesFileSchema.safeParse([]).success).toBe(true);
    expect(rejectedCandidatesFileSchema.safeParse([row]).success).toBe(true);
  });

  it('accepts reason and date', () => {
    const r = rejectedCandidatesFileSchema.safeParse([
      { ...row, reason: 'Gäller en annan fråga', rejected_at: '2026-01-02' },
    ]);
    expect(r.success).toBe(true);
  });

  it('rejects bad slug, empty dok_id, bad date, empty reason', () => {
    for (const bad of [
      { ...row, promise_id: 'Not A Slug' },
      { ...row, dok_id: '' },
      { ...row, rejected_at: '2026/01/02' },
      { ...row, reason: '' },
    ]) {
      expect(rejectedCandidatesFileSchema.safeParse([bad]).success).toBe(false);
    }
  });

  it('rejects duplicate pairs but allows the same dok_id for another promise', () => {
    expect(rejectedCandidatesFileSchema.safeParse([row, { ...row }]).success).toBe(false);
    expect(
      rejectedCandidatesFileSchema.safeParse([row, { ...row, promise_id: 'tido-annat' }]).success,
    ).toBe(true);
  });
});

describe('rejectedKeys', () => {
  it('builds lookup keys', () => {
    const keys = rejectedKeys([row]);
    expect(keys.has(rejectedKey(row.promise_id, row.dok_id))).toBe(true);
    expect(keys.has(rejectedKey(row.promise_id, 'other'))).toBe(false);
  });
});
