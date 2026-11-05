import { describe, expect, it } from 'vitest';
import {
  betDecisionText,
  classifyOutcome,
  bodyStartPage,
  extractBet,
  frontSummary,
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
    ['Riksdagen lämnar ett motiverat yttrande', 'bifall'],
    ['Anmälan av ärendet', 'noted'],
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
    const same = `<html>${[
      `<DIV id="page_1"><TABLE><TR><TD><A href="#page_3">Sammanfattning ........</A></TD></TR><TR><TD><A href="#page_3">Författningsförslag ........</A></TD></TR></TABLE></DIV>`,
      '<DIV id="page_3"><P>Kort sammanfattning och därefter författningsförslag.</P></DIV>',
    ].join('')}</html>`;
    const r = extractConverted(same, 'sou');
    expect(r.structure).toBe('toc');
    expect(r.sections.map((s) => s.heading)).toEqual(['sammanfattning']);
    expect(r.sections[0]!.text).toContain('Kort sammanfattning');
  });
  it('keeps the proposition decision proposal and its unlisted front summary', () => {
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

const links = (n: number) =>
  Array.from({ length: n }, (_, i) => `<A href="#page_${i + 5}">Kapitel ${i}</A>`).join(' ');

describe('front matter', () => {
  it('finds the first body page after the leading ToC pages, ignoring cross-references in the body', () => {
    const pages = new Map([
      [1, '<P>Titel</P>'],
      [2, `<P>${links(8)}</P>`],
      [3, `<P>${links(8)}</P>`],
      [4, '<P>Brödtext</P>'],
      [9, `<P>Se <A href="#page_4">avsnitt 1</A> och ${links(5)}</P>`],
    ]);
    expect(bodyStartPage(pages)).toBe(4);
    expect(bodyStartPage(new Map([[1, '<P>Ingen ToC</P>']]))).toBe(0);
  });
  it('reads a proposition summary that sits before the ToC', () => {
    const pages = new Map([
      [1, '<P>Propositionens huvudsakliga innehåll</P><P>Regeringen föreslår en ny lag.</P>'],
      [2, '<P>Fortsättning på sammanfattningen.</P>'],
      [3, `<P>${links(8)}</P>`],
    ]);
    expect(frontSummary(pages)).toBe(
      'Regeringen föreslår en ny lag.\nFortsättning på sammanfattningen.',
    );
    expect(frontSummary(new Map([[1, '<P>Annat</P>']]))).toBeNull();
  });
  it('also reads a skrivelse summary', () => {
    const pages = new Map([
      [1, '<P>Skrivelsens huvudsakliga innehåll</P><P>Regeringen redovisar.</P>'],
    ]);
    expect(frontSummary(pages)).toBe('Regeringen redovisar.');
  });
  it('keeps the front summary in the fallback of a document without a wanted ToC entry', () => {
    const html = `<html>${[
      '<DIV id="page_1"><P>Skrivelsens huvudsakliga innehåll</P><P>Kort om skrivelsen.</P></DIV>',
      `<DIV id="page_2">${links(8)}</DIV>`,
      '<DIV id="page_5"><P>Brödtext efter innehållsförteckningen.</P></DIV>',
    ].join('')}</html>`;
    const r = extractConverted(html, 'prop');
    expect(r.structure).toBe('none');
    expect(r.sections.map((x) => x.text)).toEqual([
      'Kort om skrivelsen.',
      'Brödtext efter innehållsförteckningen.',
    ]);
  });
});

describe('extractBet', () => {
  const wrap = (html: string) => `<html>${html.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</html>`;
  it('cuts at a singular "Reservation" heading too', () => {
    const r = extractBet(
      wrap(
        '<h1>Utskottets förslag till riksdagsbeslut</h1><p>Riksdagen bifaller.</p><h1>Reservation</h1><p>Vi anser något annat.</p>',
      ),
    );
    const text = r.sections.map((x) => x.text).join('\n');
    expect(text).toContain('bifaller');
    expect(text).not.toContain('Vi anser');
  });
  it('caps a betänkande without recognisable headings', () => {
    const long = Array.from(
      { length: 3000 },
      (_, i) => `<p>Stycke ${i} med ganska mycket text i sig.</p>`,
    ).join('');
    const r = extractBet(wrap(long));
    expect(r.structure).toBe('none');
    expect(r.sections.reduce((n, x) => n + x.est_tokens, 0)).toBeLessThanOrEqual(6000);
  });
  it('drops reservation text even after the "Förslag till riksdagsbeslut" sub-heading inside it', () => {
    const html =
      '<h1>Utskottets förslag till riksdagsbeslut</h1><p>Riksdagen bifaller propositionen.</p>' +
      '<h1>Reservationer</h1><h2>1. Rubrik, reservation 1 (S)</h2><h2>Förslag till riksdagsbeslut</h2><p>Oppositionens förslag.</p>';
    const text = extractBet(`<html>${html.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</html>`)
      .sections.map((x) => x.text)
      .join('\n');
    expect(text).toContain('Riksdagen bifaller propositionen');
    expect(text).not.toContain('Oppositionens förslag');
  });
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
