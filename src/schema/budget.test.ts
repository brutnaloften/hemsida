import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { budgetMetaSchema, expenditureSchema, revenueSchema } from '@/schema/budget';

const read = (name: string): unknown =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`../data/budget/${name}`, import.meta.url)), 'utf-8'),
  );

describe('committed budget data', () => {
  it('meta.json validates', () => {
    expect(budgetMetaSchema.safeParse(read('meta.json')).success).toBe(true);
  });

  it('expenditure.json validates', () => {
    const result = expenditureSchema.safeParse(read('expenditure.json'));
    expect(result.success).toBe(true);
  });

  it('revenue.json validates', () => {
    const result = revenueSchema.safeParse(read('revenue.json'));
    expect(result.success).toBe(true);
  });
});

describe('expenditureSchema', () => {
  const valid = {
    years: [2024, 2025],
    uo: [{ nr: 9, namn: 'Hälsa' }],
    anslag: [
      {
        kod: '0901011',
        uo: 9,
        beteckning: '1:11',
        namn: 'X',
        upphort: null,
        budget: [1, null],
        andrad: [null, null],
        utfall: [1.5, 2],
      },
    ],
    ovrigt: {
      nettoutlaning: [1, 2],
      kassamassigKorrigering: [1, 2],
      alderspension: [1, 2],
      utgiftstak: [1, 2],
      marginal: [1, 2],
    },
  };

  it('accepts a minimal valid file', () => {
    expect(expenditureSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a series that is not aligned with years', () => {
    const bad = structuredClone(valid);
    bad.anslag[0].utfall = [1];
    expect(expenditureSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects duplicate codes and unknown UOs', () => {
    const dup = structuredClone(valid);
    dup.anslag.push(structuredClone(dup.anslag[0]));
    expect(expenditureSchema.safeParse(dup).success).toBe(false);
    const unknown = structuredClone(valid);
    unknown.anslag[0].uo = 10;
    expect(expenditureSchema.safeParse(unknown).success).toBe(false);
  });

  it('accepts suffixed and old six-character codes but not other shapes', () => {
    for (const kod of ['0501003 2024', '020104 2008', '14D003 1998']) {
      const a = structuredClone(valid);
      a.anslag[0].kod = kod;
      expect(expenditureSchema.safeParse(a).success, kod).toBe(true);
    }
    const bad = structuredClone(valid);
    bad.anslag[0].kod = '12345';
    expect(expenditureSchema.safeParse(bad).success).toBe(false);
  });
});

describe('revenueSchema', () => {
  const valid = {
    years: [2024],
    typ: [{ kod: '1000', namn: 'T' }],
    huvudgrupp: [{ kod: '1100', typ: '1000', namn: 'H' }],
    titelgrupp: [{ kod: '1140-1160', huvudgrupp: '1100', namn: 'G' }],
    titlar: [
      {
        kod: '1141',
        huvudgrupp: '1100',
        titelgrupp: '1140-1160',
        namn: 'T',
        budget: [1],
        utfall: [null],
      },
      { kod: '1142', huvudgrupp: '1100', titelgrupp: null, namn: 'T2', budget: [1], utfall: [2] },
    ],
  };

  it('accepts a minimal valid file including ranges and missing titelgrupp', () => {
    expect(revenueSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects dangling parents', () => {
    const bad = structuredClone(valid);
    bad.titlar[0].titelgrupp = '9999';
    expect(revenueSchema.safeParse(bad).success).toBe(false);
  });
});
