import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AREAS } from '../../src/schema/areas.ts';
import {
  COMMITTEE_AREA,
  invertMapping,
  resolveArea,
  type AreaMappingFile,
} from './area-mapping.ts';

const file = JSON.parse(
  readFileSync(new URL('../area-mapping.json', import.meta.url), 'utf8'),
) as AreaMappingFile;

describe('area mapping', () => {
  it('has a valid, duplicate-free mapping file', () => {
    expect(() => invertMapping(file)).not.toThrow();
  });

  it('rejects unknown targets and duplicate labels', () => {
    expect(() => invertMapping({ Nonsens: ['x'] })).toThrow(/unknown target/);
    expect(() => invertMapping({ Energi: ['x'], Arbetsmarknad: ['x'] })).toThrow(/both/);
  });

  it('maps every vocabulary term and committee default onto the vocabulary', () => {
    const m = invertMapping(file);
    for (const a of AREAS)
      expect(resolveArea(a, undefined, m), a).toEqual({ status: 'mapped', area: a });
    for (const a of Object.values(COMMITTEE_AREA)) expect(AREAS).toContain(a);
  });

  it('resolves mapped labels and proposes from committee otherwise', () => {
    const m = invertMapping(file);
    expect(resolveArea('Skolpolitik', 'UbU', m)).toEqual({
      status: 'mapped',
      area: 'Skola och utbildning',
    });
    expect(resolveArea('Okänt', 'JuU', m)).toEqual({ status: 'proposed', area: 'Kriminalpolitik' });
    expect(resolveArea('Okänt', undefined, m)).toEqual({ status: 'proposed', area: undefined });
  });
});
