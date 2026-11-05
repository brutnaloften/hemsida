import { describe, expect, it } from 'vitest';
import {
  betDecisionText,
  classifyOutcome,
  extractBet,
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
    ['a) Riksdagen bifaller utskottets förslag', 'bifall'],
    ['Antar slutligt det vilande förslaget till ändring i regeringsformen', 'bifall'],
    ['Utskottet föreslår att riksdagen antar lagförslaget', 'bifall'],
    ['Riksdagen godkänner avtalet om försvarssamarbete', 'bifall'],
    ['Delvis bifall till motionerna', 'bifall'],
    ['Utskottet tillstyrker propositionen', 'bifall'],
    ['Bifall till framställningarna. Redogörelsen läggs till handlingarna.', 'bifall'],
    ['Riksdagen beslutar att lämna ett motiverat yttrande', 'bifall'],
    ['Avslag samtliga motioner', 'avslag'],
    ['Riksdagen avslår motionerna', 'avslag'],
    ['Riksdagen lägger skrivelsen till handlingarna', 'noted'],
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

const toc2 = `<html>${[
  '<DIV id="page_1"><P>Titelsida</P></DIV>',
  `<DIV id="page_2"><TABLE>
<TR><TD><A href="#page_7">1</A></TD><TD><A href="#page_7">Förslag till riksdagsbeslut ........</A></TD><TD><A href="#page_7">7</A></TD></TR>
<TR><TD><A href="#page_8">2</A></TD><TD><A href="#page_8">Lagtext</A></TD><TD><A href="#page_8">..........</A></TD><TD><A href="#page_8">8</A></TD></TR>
<TR><TD><A href="#page_8">2.1</A></TD><TD><A href="#page_8">Förslag till lag om ändring i</A></TD></TR>
<TR><TD><A href="#page_8">(2010:900) ...........</A></TD><TD><A href="#page_8">8</A></TD></TR>
<TR><TD><A href="#page_57">3 Ärendet och dess beredning ........</A></TD><TD><A href="#page_57">57</A></TD></TR>
<TR><TD><A href="#page_60">Bilaga 1</A></TD><TD><A href="#page_60">Sammanställning ........</A></TD></TR>
</TABLE></DIV>`,
  '<DIV id="page_3"><P>Förord som inte ska med.</P></DIV>',
  '<DIV id="page_7"><P>Riksdagen antar regeringens förslag.</P></DIV>',
  '<DIV id="page_8"><P>Lagtext följer.</P></DIV>',
].join('')}</html>`;

describe('ToC layouts', () => {
  it('handles a split leader cell, an inline number and Bilaga N, and skips wrapped lines', () => {
    expect(parseToc(toc2).map((e) => [e.title, e.page])).toEqual([
      ['förslag till riksdagsbeslut', 7],
      ['lagtext', 8],
      ['ärendet och dess beredning', 57],
      ['sammanställning', 60],
    ]);
  });
  it('keeps a wanted section whose successor starts on the same page', () => {
    const r = extractConverted(toc2, 'prop');
    expect(r.structure).toBe('toc');
    expect(r.sections.map((s) => s.heading)).toEqual(['förslag till riksdagsbeslut']);
    expect(r.sections[0]!.text).toContain('antar regeringens förslag');
  });
  it('the fallback skips the title page and ToC pages', () => {
    const noWanted = toc2
      .replace('Förslag till riksdagsbeslut', 'Annat')
      .replace('Förslag till riksdagsbeslut', 'Annat');
    const r = extractConverted(noWanted, 'sou');
    expect(r.structure).toBe('none');
    expect(r.sections[0]!.text).not.toContain('Titelsida');
    expect(r.sections[0]!.text).toContain('Förord som inte ska med');
  });
});

describe('extractBet', () => {
  const bet = `<html>&lt;h1&gt;Förslag till riksdagsbeslut&lt;/h1&gt;&lt;p&gt;Riksdagen bifaller propositionen.&lt;/p&gt;&lt;h1&gt;Utskottets ställningstagande&lt;/h1&gt;&lt;p&gt;Utskottet delar regeringens bedömning.&lt;/p&gt;&lt;h1&gt;Reservation 1 (S)&lt;/h1&gt;&lt;p&gt;Oppositionens text.&lt;/p&gt;&lt;h1&gt;Bilaga 1&lt;/h1&gt;&lt;p&gt;Bilagetext.&lt;/p&gt;</html>`;
  it('keeps the committee sections and drops opposition and annexes', () => {
    const r = extractBet(bet);
    const text = r.sections.map((s) => s.text).join('\n');
    expect(text).toContain('Riksdagen bifaller propositionen');
    expect(text).toContain('delar regeringens bedömning');
    expect(text).not.toContain('Oppositionens text');
    expect(text).not.toContain('Bilagetext');
    expect(r.structure).toBe('headings');
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
