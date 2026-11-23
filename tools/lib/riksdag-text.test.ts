import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  annotateParagraphs,
  createTextFetcher,
  decodeEntities,
  extractToc,
  parseRiksdagText,
  trailingParties,
} from './riksdag-text.ts';
import { HD01SOU1_TEXT, SOU_PDF_NO_TOC, SOU_PDF_TOC } from './riksdag-text.fixtures.ts';

describe('decodeEntities', () => {
  it('decodes numeric, hex and named entities', () => {
    expect(decodeEntities('a&#xa0;b&#160;c&amp;d&lt;')).toBe('a b c&d<');
    expect(decodeEntities('&unknown;')).toBe('&unknown;');
  });
});

describe('parseRiksdagText', () => {
  const paras = parseRiksdagText(HD01SOU1_TEXT);

  it('drops the table of contents, spacer paragraphs and bare list numbers', () => {
    const texts = paras.map((p) => p.text);
    expect(texts.filter((t) => t === 'Särskilda yttranden')).toHaveLength(1);
    expect(texts).not.toContain('1.');
  });

  it('removes soft hyphens and joins span runs and non-breaking spaces', () => {
    const p = paras.find((x) => x.text.startsWith('Anslaget tillförs'))!;
    expect(p.text).toContain('200 000 000 kronor 2026');
    expect(p.text).toContain('personcentrerad');
    expect(p.text).not.toMatch(/[­ ]/);
    expect(p.text).toContain('För 2026 avsätts 1 000 000 000 kronor.');
  });

  it('marks headings from tags and heading classes', () => {
    const heading = (t: string) => paras.find((p) => p.text === t)?.heading;
    expect(heading('Utskottets överväganden')).toBe(true);
    expect(heading('Anslaget 1:6 Bidrag till folkhälsa och sjukvård')).toBe(true);
    expect(heading('Statens budget inom utgiftsområde 9, punkt 2 (S)')).toBe(true);
    expect(paras.find((p) => p.text.startsWith('Anslaget tillförs'))?.heading).toBe(false);
  });

  it('accepts plain HTML without the XML wrapper', () => {
    expect(parseRiksdagText('<p>Ett&#xa0;stycke</p><p>Två</p>').map((p) => p.text)).toEqual([
      'Ett stycke',
      'Två',
    ]);
  });
});

describe('trailingParties', () => {
  it('reads party codes from a trailing parenthesis', () => {
    expect(trailingParties('Statens budget inom utgiftsområde 9, punkt 2 (S)')).toEqual(['S']);
    expect(trailingParties('Reservation 3 (S, V, MP)')).toEqual(['S', 'V', 'MP']);
    expect(trailingParties('Reservation 4 (C och KD)')).toEqual(['C', 'KD']);
    expect(trailingParties('Utskottets förslag')).toEqual([]);
  });
});

describe('annotateParagraphs', () => {
  const paras = annotateParagraphs(parseRiksdagText(HD01SOU1_TEXT), 'bet');
  const find = (start: string) => paras.find((p) => p.text.startsWith(start))!;

  it('attributes budget anslag text to the government and records the anslag', () => {
    const p = find('Anslaget tillförs');
    expect(p.speaker.kind).toBe('government');
    expect(p.anslag).toBe('Anslaget 1:6 Bidrag till folkhälsa och sjukvård');
  });

  it('attributes motion text to the party and clears the anslag', () => {
    const p = find('Motionärerna anser');
    expect(p.speaker).toMatchObject({ kind: 'motion', parties: ['MP'] });
    expect(p.anslag).toBeNull();
  });

  it('attributes a special statement to its party', () => {
    const p = find('Vidare har regeringen valt att sänka');
    expect(p.speaker).toMatchObject({
      kind: 'special_statement',
      parties: ['S'],
      label: 'Särskilt yttrande (S)',
    });
    expect(p.section).toBe('Statens budget inom utgiftsområde 9, punkt 2 (S)');
  });

  it('ends the dissent at an annex heading', () => {
    expect(find('Förteckning över behandlade förslag').speaker.kind).toBe('other');
  });

  it('defaults by document type', () => {
    const raw = [{ text: 'Regeringen beslutar.', heading: false }];
    expect(annotateParagraphs(raw, 'prop')[0]!.speaker.kind).toBe('government');
    expect(annotateParagraphs(raw, 'sou')[0]!.speaker.kind).toBe('inquiry');
  });
});

describe('createTextFetcher', () => {
  const ok = (body: string) => new Response(body, { status: 200 });

  it('fetches once, caches, and spaces requests', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rt-'));
    const calls: string[] = [];
    const sleeps: number[] = [];
    const fetcher = createTextFetcher({
      cacheDir: dir,
      minIntervalMs: 1000,
      sleep: async (ms) => void sleeps.push(ms),
      fetch: (async (url: string) => {
        calls.push(url);
        return ok('<x/>');
      }) as unknown as typeof fetch,
    });
    expect(await fetcher('HD01SoU1')).toBe('<x/>');
    expect(await fetcher('HD01SoU1')).toBe('<x/>');
    await fetcher('HC01SoU1');
    expect(calls).toEqual([
      'https://data.riksdagen.se/dokument/HD01SoU1.text',
      'https://data.riksdagen.se/dokument/HC01SoU1.text',
    ]);
    expect(sleeps.length).toBeGreaterThan(0);
    expect(readFileSync(join(dir, 'HD01SoU1.xml'), 'utf8')).toBe('<x/>');
  });

  it('accepts ids with Swedish letters (FöU) and URL-encodes them', async () => {
    const calls: string[] = [];
    const fetcher = createTextFetcher({
      cacheDir: mkdtempSync(join(tmpdir(), 'rt-')),
      sleep: async () => undefined,
      fetch: (async (url: string) => {
        calls.push(url);
        return ok('<x/>');
      }) as unknown as typeof fetch,
    });
    expect(await fetcher('HD01FöU1')).toBe('<x/>');
    expect(calls).toEqual(['https://data.riksdagen.se/dokument/HD01F%C3%B6U1.text']);
  });

  it('returns null on 404 and rejects unsafe ids', async () => {
    const fetcher = createTextFetcher({
      cacheDir: mkdtempSync(join(tmpdir(), 'rt-')),
      sleep: async () => undefined,
      fetch: (async () => new Response('', { status: 404 })) as unknown as typeof fetch,
    });
    expect(await fetcher('NOPE')).toBeNull();
    await expect(fetcher('../x')).rejects.toThrow('Bad dok_id');
  });
});

describe('PDF-to-HTML sections (SOU, Ds, prop)', () => {
  it('extracts top-level ToC entries and skips sub-entries and wrapped lines', () => {
    expect(extractToc(SOU_PDF_TOC)).toEqual([
      { number: null, title: 'Sammanfattning', page: 3 },
      { number: '1', title: 'Författningsförslag', page: 4 },
      { number: '2', title: 'Utredningens uppdrag och arbete', page: 5 },
      { number: '3', title: 'Konsekvenser', page: 6 },
      { number: null, title: 'Bilaga 1 Direktiv', page: 7 },
    ]);
  });

  it('drops the ToC page and sets section from the ToC, synthesising missing headings', () => {
    const paras = annotateParagraphs(parseRiksdagText(SOU_PDF_TOC), 'sou');
    const sec = (start: string) => paras.find((p) => p.text.startsWith(start))?.section;
    expect(paras.map((p) => p.text)).not.toContain('Innehåll');
    expect(sec('Utredningen föreslår')).toBe('Sammanfattning');
    expect(sec('Härigenom')).toBe('1 Författningsförslag');
    // The real paragraph is the heading: no synthetic duplicate.
    const hs = paras.filter((p) => p.heading && p.text.includes('Författningsförslag'));
    expect(hs).toHaveLength(1);
    expect(hs[0]!.text).toBe('1 Författningsförslag');
    expect(sec('Uppdraget beskrivs')).toBe('2 Utredningens uppdrag och arbete');
    expect(sec('Förslaget kostar')).toBe('3 Konsekvenser');
    expect(sec('Direktivets')).toBe('Bilaga 1 Direktiv');
  });

  it('falls back to numbered and known headings without a ToC', () => {
    expect(extractToc(SOU_PDF_NO_TOC)).toEqual([]);
    const paras = annotateParagraphs(parseRiksdagText(SOU_PDF_NO_TOC), 'sou');
    const sec = (start: string) => paras.find((p) => p.text.startsWith(start))?.section;
    expect(sec('Vi föreslår en ändring')).toBe('Sammanfattning');
    expect(sec('Uppdraget gavs')).toBe('1 Inledning');
    expect(sec('Tidigare')).toBe('2 Bakgrund');
    // "3 miljoner kronor ..." is a sentence, not a heading.
    expect(sec('3 miljoner')).toBe('2 Bakgrund');
    expect(sec('Vi föreslår en höjning')).toBe('3 Förslag');
  });

  it('keeps a body page right after the ToC whose footnote markers link to itself', () => {
    const fn = [1, 2, 3, 4, 5].map((n) => `<A href="#page_3">${n}</A>`).join(' ');
    const html = SOU_PDF_TOC.replace('<DIV id="page_3">', `<DIV id="page_3"><P>Fotnoter ${fn}</P>`);
    const texts = parseRiksdagText(html).map((p) => p.text);
    expect(texts).toContain('Utredningen föreslår en ny lag.');
    expect(texts.some((t) => t.startsWith('Fotnoter'))).toBe(true);
    expect(texts).not.toContain('Innehåll');
  });

  it('matches glued numbers and running headers to the ToC title without duplicates', () => {
    const html = `<DIV id="page_1"><P>x</P></DIV>
<DIV id="page_2"><TABLE>
<TR><TD><A href="#page_3">1</A></TD><TD><A href="#page_3">Inledning ....</A></TD><TD><A href="#page_3">3</A></TD></TR>
<TR><TD><A href="#page_4">2</A></TD><TD><A href="#page_4">Bakgrund ....</A></TD><TD><A href="#page_4">4</A></TD></TR>
<TR><TD><A href="#page_5">3</A></TD><TD><A href="#page_5">Slut ....</A></TD><TD><A href="#page_5">5</A></TD></TR>
</TABLE></DIV>
<DIV id="page_3"><P>1Inledning</P><P>Text ett.</P></DIV>
<DIV id="page_4"><P>Prop. 2023/24:64 2 Bakgrund</P><P>Text två.</P></DIV>
<DIV id="page_5"><P>3 Slut</P><P>Text tre.</P></DIV>`;
    const paras = parseRiksdagText(html);
    expect(paras.filter((p) => p.heading).map((p) => p.text)).toEqual([
      '1Inledning',
      'Prop. 2023/24:64 2 Bakgrund',
      '3 Slut',
    ]);
  });

  it('fallback matches glued numbers and gives up when one heading swallows the text', () => {
    const glued = parseRiksdagText(
      '<DIV id="page_1"><P>Sammanfattning</P><P>a</P><P>1Inledning</P><P>b</P><P>2Bakgrund</P><P>c</P></DIV>',
    );
    expect(glued.filter((p) => p.heading).map((p) => p.text)).toEqual([
      'Sammanfattning',
      '1Inledning',
      '2Bakgrund',
    ]);
    const long = 'Mycket lång brödtext. '.repeat(200);
    const swallowed = parseRiksdagText(
      `<DIV id="page_1"><P>Sammanfattning</P><P>${long}</P><P>Bilaga 1</P><P>kort</P></DIV>`,
    );
    expect(swallowed.some((p) => p.heading)).toBe(false);
  });

  it('drops only the leading run of ToC pages, not later pages with cross-references', () => {
    const links = [3, 4, 5, 6, 7].map((n) => `<A href="#page_${n}">se ${n}</A>`).join(' ');
    const html = `${SOU_PDF_TOC}<DIV id="page_9"><P>Sent kapitel</P><P>${links}</P></DIV>`;
    expect(parseRiksdagText(html).map((p) => p.text)).toContain('Sent kapitel');
  });

  it('does not treat ToC leftovers, footnotes or repeated page headers as headings', () => {
    const paras = parseRiksdagText(`<DIV id="page_1">
<P>Innehåll</P><P>1 Inledning 9</P><P>2 Bakgrund 12</P>
<P>1 Inledning</P><P>Text.</P><P>1 Jfr prop. 2020/21:1.</P><P>1 Jfr prop. 2020/21:1</P>
<P>2 Bakgrund</P><P>Mer text.</P>
<P>Bilaga 1</P><P>Texten.</P><P>Bilaga 1</P><P>Mer.</P>
</DIV>`);
    const heads = paras.filter((p) => p.heading).map((p) => p.text);
    expect(heads).toEqual(['1 Inledning', '2 Bakgrund', 'Bilaga 1']);
  });

  it('leaves non-PDF documents without page divs alone', () => {
    const paras = parseRiksdagText('<p>Sammanfattning</p><p>1 Inledning</p><p>2 Bakgrund</p>');
    expect(paras.some((p) => p.heading)).toBe(false);
  });
});
