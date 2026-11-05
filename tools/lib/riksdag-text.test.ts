import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  annotateParagraphs,
  createTextFetcher,
  decodeEntities,
  parseRiksdagText,
  trailingParties,
} from './riksdag-text.ts';
import { HD01SOU1_TEXT } from './riksdag-text.fixtures.ts';

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
