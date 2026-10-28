import { describe, expect, it } from 'vitest';
import { EVIDENCE_KINDS, PARTIES, PROMISE_TYPES, VERDICTS } from '@/schema/promise';
import {
  EVIDENCE_KIND_LABELS,
  PARTY_NAMES,
  TYPE_LABELS,
  VERDICT_STYLES,
} from '@/lib/promise-labels';

describe('promise labels', () => {
  it.each([
    ['party names', PARTIES, PARTY_NAMES],
    ['type labels', PROMISE_TYPES, TYPE_LABELS],
    ['evidence kind labels', EVIDENCE_KINDS, EVIDENCE_KIND_LABELS],
    ['verdict styles', VERDICTS, VERDICT_STYLES],
  ] as const)('%s cover every schema value', (_name, keys, map) => {
    for (const key of keys) {
      expect((map as Record<string, string>)[key]).toBeTruthy();
    }
  });
});
