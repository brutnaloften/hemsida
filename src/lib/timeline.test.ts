import { describe, expect, it } from 'vitest';
import type { Evidence } from '@/schema/promise';
import { isAgreement, orderTimeline, promisePath } from '@/lib/timeline';

const doc = (dok_id: string, date: string): Evidence => ({
  kind: 'prop',
  dok_id,
  designation: dok_id,
  title: dok_id,
  date,
  url: 'https://example.com',
  relevance: 'full',
  note: null,
});
const agreement: Evidence = {
  kind: 'agreement',
  source: 'tidoavtalet',
  date: '2022-10-14',
  promises: ['tido-x'],
  outcome: 'included',
  note: null,
};

describe('orderTimeline', () => {
  it('puts agreement first, then documents by date, without mutating input', () => {
    const input = [doc('b', '2024-01-01'), doc('a', '2023-01-01'), agreement];
    const out = orderTimeline(input);
    expect(out.map((e) => (isAgreement(e) ? 'agreement' : e.dok_id))).toEqual([
      'agreement',
      'a',
      'b',
    ]);
    expect(input[0]).toMatchObject({ dok_id: 'b' });
  });
});

describe('promisePath', () => {
  it('builds a relative path', () => {
    expect(promisePath('tido-x')).toBe('lofte/tido-x');
  });
});
