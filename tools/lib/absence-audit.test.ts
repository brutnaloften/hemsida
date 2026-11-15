import { describe, expect, it } from 'vitest';
import { cleanStems, pickPassages } from './absence-audit.ts';

describe('absence audit passages', () => {
  it('cleans stems', () => {
    expect(cleanStems([' Ungdomsfängel ', 'ab', 'Maxtid'])).toEqual(['ungdomsfängel', 'maxtid']);
  });

  it('ranks by distinct stems and caps per document and in total', () => {
    const docs = [
      {
        designation: 'Prop. A',
        paragraphs: [
          'Särskilda ungdomsfängelser inrättas och maxtiden förlängs.',
          'Bara ungdomsfängelser nämns här.',
          'Inget relevant.',
        ],
      },
      { designation: 'Bet. B', paragraphs: ['Maxtid för sluten ungdomsvård.', 'Annat.'] },
    ];
    const stems = ['ungdomsfängel', 'maxtid'];
    const out = pickPassages(docs, stems);
    expect(out.map((p) => p.score)).toEqual([2, 1, 1]);
    expect(out[0]!.designation).toBe('Prop. A');
    expect(pickPassages(docs, stems, 1)).toHaveLength(2);
    expect(pickPassages(docs, stems, 5, 2)).toHaveLength(2);
    expect(pickPassages(docs, ['saknas helt'])).toEqual([]);
  });
});
