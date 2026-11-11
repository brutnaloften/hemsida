import { describe, expect, it } from 'vitest';
import { addDecisions, propsHandledBy } from './decided-by.ts';

const ref = (type: string, docType: string, id: string) =>
  `<referens><referenstyp>${type}</referenstyp><ref_dok_id>${id}</ref_dok_id><ref_dok_typ>${docType}</ref_dok_typ></referens>`;
const bet = (refs: string) =>
  `<dokumentstatus><dokument><dok_id>B1</dok_id><doktyp>bet</doktyp></dokument><dokreferens>${refs}</dokreferens></dokumentstatus>`;

describe('decided-by', () => {
  it('returns the propositions a betänkande handles', () => {
    const xml = bet(
      ref('behandlar', 'mot', 'M1') + ref('behandlar', 'prop', 'P1') + ref('rskr', 'prop', 'P9'),
    );
    expect(propsHandledBy(xml)).toEqual(['P1']);
  });

  it('does not let a later reference lend its type to an earlier one', () => {
    const xml = bet(ref('behandlar', 'mot', 'M1') + ref('annat', 'prop', 'P2'));
    expect(propsHandledBy(xml)).toEqual([]);
  });

  it('ignores documents that are not betänkanden', () => {
    expect(
      propsHandledBy(bet(ref('behandlar', 'prop', 'P1')).replace('<doktyp>bet', '<doktyp>mot')),
    ).toEqual([]);
  });

  it('collects deciding bets per proposition', () => {
    const map = new Map<string, string[]>();
    addDecisions(map, 'B1', bet(ref('behandlar', 'prop', 'P1')));
    addDecisions(map, 'B2', bet(ref('behandlar', 'prop', 'P1')));
    expect(map.get('P1')).toEqual(['B1', 'B2']);
  });
});
