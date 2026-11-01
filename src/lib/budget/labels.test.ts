import { describe, expect, it } from 'vitest';
import { areas } from '@/lib/budget/data';
import { UO_SHORT_NAMES, shortNameForId, smallerLabel } from '@/lib/budget/labels';

describe('labels', () => {
  it('has short names only for real, shorter UO names', () => {
    for (const [nr, short] of Object.entries(UO_SHORT_NAMES)) {
      const uo = areas.find((a) => a.nr === Number(nr));
      expect(uo, `UO ${nr}`).toBeDefined();
      expect(short.length).toBeLessThan(uo!.namn.length);
    }
  });
  it('looks short names up by node id', () => {
    expect(shortNameForId('uo:18')).toBe('Bostäder och samhällsplanering');
    expect(shortNameForId('uo:8')).toBeUndefined();
    expect(shortNameForId('anslag:0901011')).toBeUndefined();
  });
  it('words the grouped box', () => {
    expect(smallerLabel(18)).toBe('Mindre poster (18 st)');
  });
});
