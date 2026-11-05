import { describe, expect, it } from 'vitest';
import {
  betDecisionText,
  classifyOutcome,
  extractConverted,
  extractTier1,
  pagesOf,
  parseToc,
  stageOf,
  wanted,
} from './riksdag-tier1.ts';

const row = (nums: [string, number] | null, title: string, page: number) =>
  `<TR>${nums ? `<TD><P><A href="#page_${nums[1]}">${nums[0]}</A></P></TD>` : ''}<TD><P><A href="#page_${page}">${title} ........</A></P></TD><TD><P><A href="#page_${page}">${page}</A></P></TD></TR>`;

const converted = `<html>${[
  '<DIV id="page_1"><P class="p1">Titelsida</P></DIV>',
  `<DIV id="page_2"><TABLE>${row(null, 'Sammanfattning', 3)}${row(['1', 4], 'Uppdraget', 4)}${row(['1.1', 4], 'Bakgrund', 4)}${row(null, 'Författningskommentar', 6)}</TABLE></DIV>`,
  '<DIV id="page_3"><P class="p1">Vi föreslår en ny lag om elbilar.</P></DIV>',
  '<DIV id="page_4"><P class="p1">Uppdraget handlar om ett långt resonemang.</P></DIV>',
  '<DIV id="page_5"><P class="p1">Mer resonemang.</P></DIV>',
  '<DIV id="page_6"><P class="p1">Kommentar till paragraf 1.</P></DIV>',
].join('')}</html>`;

describe('bet outcome', () => {
  it('reads the decision text from the XML', () => {
    const xml =
      '<uppgift><kod>beslutssammanfattningusk</kod><namn>Utskottets förslag</namn><text>Bifall till propositionen</text></uppgift>';
    expect(betDecisionText(xml)).toBe('Bifall till propositionen');
    expect(betDecisionText('<x/>')).toBeNull();
  });
  it.each([
    ['Bifall till propositionen', 'bifall'],
    ['Delvis bifall till regeringens förslag', 'bifall'],
    ['Avslag på samtliga motionsyrkanden', 'avslag'],
    ['Skrivelsen läggs till handlingarna', 'noted'],
    ['Utskottet föreslår att riksdagen ...', 'other'],
    [null, 'unknown'],
  ])('classifies %s as %s', (text, outcome) => {
    expect(classifyOutcome(text)).toBe(outcome);
  });
  it('only an adopted bifall is definitive', () => {
    expect(stageOf('bet', 'bifall')).toBe('definitive');
    expect(stageOf('bet', 'avslag')).toBe('background');
    expect(stageOf('bet', 'noted')).toBe('background');
    expect(stageOf('sou')).toBe('preparatory');
    expect(stageOf('dir')).toBe('preparatory');
  });
});

describe('converted documents (sou, ds, prop)', () => {
  it('keeps only top-level ToC entries', () => {
    expect(parseToc(converted).map((e) => [e.title, e.page])).toEqual([
      ['sammanfattning', 3],
      ['uppdraget', 4],
      ['författningskommentar', 6],
    ]);
  });
  it('splits the pages of the converted PDF', () => {
    expect([...pagesOf(converted).keys()]).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it('wants the summary, and the decision proposal only for prop', () => {
    expect(wanted('sou', 'sammanfattning')).toBe(true);
    expect(wanted('sou', 'förslag till riksdagsbeslut')).toBe(false);
    expect(wanted('prop', 'förslag till riksdagsbeslut')).toBe(true);
    expect(wanted('sou', 'författningskommentar')).toBe(false);
  });
  it('extracts the summary page range through the ToC', () => {
    const r = extractConverted(converted, 'sou');
    expect(r.structure).toBe('toc');
    expect(r.sections).toHaveLength(1);
    expect(r.sections[0]!.heading).toBe('sammanfattning');
    expect(r.sections[0]!.text).toContain('ny lag om elbilar');
    expect(r.sections[0]!.text).not.toContain('långt resonemang');
  });
  it('falls back to the start of the document, flagged, without a ToC', () => {
    const r = extractConverted('<html><DIV id="page_1"><P>Bara text.</P></DIV></html>', 'prop');
    expect(r.structure).toBe('none');
    expect(r.sections[0]!.text).toBe('Bara text.');
  });
});

describe('extractTier1', () => {
  it('tags a sou as preparatory with its token estimate', () => {
    const doc = extractTier1('X1', 'sou', converted);
    expect(doc).toMatchObject({ dok_id: 'X1', doktyp: 'sou', stage: 'preparatory' });
    expect(doc.est_tokens).toBe(doc.sections[0]!.est_tokens);
  });
});
