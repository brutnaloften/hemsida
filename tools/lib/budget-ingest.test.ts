import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildMeta,
  describeTarget,
  statusFromRelease,
  readSingleZipEntry,
  EXPENDITURE_HEADER,
  parseAmount,
  parseAnslagKod,
  parseCsv,
  parseExpenditure,
  parseListing,
  parseRevenue,
  pickNewest,
  releaseName,
  REVENUE_HEADER,
  statusRank,
  stringifyCompact,
  yearStatuses,
} from './budget-ingest.ts';

function expRow(f: Partial<Record<string, string>>): string {
  const cells = EXPENDITURE_HEADER.map((h) => f[h] ?? '');
  return cells.join(';');
}
function revRow(f: Partial<Record<string, string>>): string {
  return REVENUE_HEADER.map((h) => f[h] ?? '').join(';');
}
const csv = (header: string[], rows: string[]) => [header.join(';'), ...rows].join('\r\n') + '\r\n';

const base = (over: Record<string, string>) => ({
  Utgiftsområde: '09',
  Utgiftsområdesnamn: 'Hälso- och sjukvård',
  Anslag: '0901011',
  Anslagsnamn: 'Namn',
  År: '2024',
  'Statens budget': '10,25',
  Ändringsbudgetar: '',
  Utfall: '9,94',
  ...over,
});

describe('parseCsv / parseAmount', () => {
  it('splits on semicolons and handles CRLF and a trailing newline', () => {
    expect(parseCsv('a;b;\r\nc;;d\r\n')).toEqual([
      ['a', 'b', ''],
      ['c', '', 'd'],
    ]);
  });

  it('rejects quoted fields', () => {
    expect(() => parseCsv('a;"b;c"\n')).toThrow(/quote/);
  });

  it('parses decimal comma, rounds to one decimal and keeps empty as null', () => {
    expect(parseAmount('1234,567')).toBe(1234.6);
    expect(parseAmount('-1972,86')).toBe(-1972.9);
    expect(parseAmount('0')).toBe(0);
    expect(Object.is(parseAmount('-0,01'), 0)).toBe(true);
    expect(parseAmount('')).toBeNull();
    expect(() => parseAmount('abc')).toThrow();
  });
});

describe('parseAnslagKod', () => {
  it('derives UO and designation without leading zeros', () => {
    expect(parseAnslagKod('0901011')).toEqual({ uo: 9, beteckning: '1:11', upphort: null });
    expect(parseAnslagKod('0101001')).toEqual({ uo: 1, beteckning: '1:1', upphort: null });
  });

  it('reads the discontinued year from the suffix', () => {
    expect(parseAnslagKod('0501003 2024')).toEqual({ uo: 5, beteckning: '1:3', upphort: 2024 });
  });

  it('gives no UO or designation for old six-character codes', () => {
    expect(parseAnslagKod('020104 2008')).toEqual({ uo: null, beteckning: null, upphort: 2008 });
    expect(parseAnslagKod('14D003 1998')).toEqual({ uo: null, beteckning: null, upphort: 1998 });
  });

  it('throws on unknown shapes', () => {
    expect(() => parseAnslagKod('12345')).toThrow();
  });
});

describe('parseExpenditure', () => {
  const rows = [
    expRow(base({ År: '2005' })), // before 2006: dropped
    expRow(base({ År: '2023', 'Statens budget': '', Utfall: '1' })),
    expRow(base({})),
    expRow(
      base({
        Anslag: '0501003 2024',
        Utgiftsområde: '05',
        Anslagsnamn: 'Gammalt',
        Utfall: '',
        'Statens budget': '0',
      }),
    ),
    expRow(
      base({
        Utgiftsområde: '02',
        Anslag: '020104 2008',
        Anslagsnamn: 'Legacy',
        År: '2024',
        Utfall: '5',
      }),
    ),
    expRow({ Utgiftsområdesnamn: 'Kassamässig korrigering', År: '2024', Utfall: '14343,21' }),
    expRow({
      Utgiftsområdesnamn: 'Riksgäldskontorets nettoutlåning',
      År: '2024',
      Utfall: '-1972,86',
    }),
    expRow({ Utgiftsområdesnamn: 'Utgiftstak', År: '2023', Utfall: '1700000' }),
    expRow({
      Utgiftsområdesnamn: 'Förändring av anslagsbehållningar',
      År: '2024',
      'Statens budget': '3',
    }),
  ];
  const parsed = parseExpenditure(csv(EXPENDITURE_HEADER, rows));

  it('covers 2006 to the latest year and aligns series on years', () => {
    expect(parsed.years).toEqual([
      2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020,
      2021, 2022, 2023, 2024,
    ]);
    const a = parsed.anslag.find((x) => x.kod === '0901011')!;
    expect(a.utfall[parsed.years.indexOf(2023)]).toBe(1);
    expect(a.utfall[parsed.years.indexOf(2024)]).toBe(9.9);
    expect(a.budget[parsed.years.indexOf(2023)]).toBeNull();
    expect(a.budget[parsed.years.indexOf(2024)]).toBe(10.3);
    expect(a.utfall[0]).toBeNull();
  });

  it('keeps anslag with and without suffix as different keys, sorted by code', () => {
    expect(parsed.anslag.map((a) => a.kod)).toEqual(['020104 2008', '0501003 2024', '0901011']);
    const old = parsed.anslag.find((a) => a.kod === '0501003 2024')!;
    expect(old.upphort).toBe(2024);
    expect(old.utfall.at(-1)).toBeNull();
    expect(old.budget.at(-1)).toBe(0);
  });

  it('puts non-UO rows in a separate section and ignores the unused one', () => {
    const last = parsed.years.length - 1;
    expect(parsed.ovrigt.kassamassigKorrigering[last]).toBe(14343.2);
    expect(parsed.ovrigt.nettoutlaning[last]).toBe(-1972.9);
    expect(parsed.ovrigt.utgiftstak[last - 1]).toBe(1700000);
    expect(parsed.ovrigt.alderspension.every((v) => v === null)).toBe(true);
    expect(parsed.anslag.some((a) => a.namn.includes('anslagsbehållningar'))).toBe(false);
  });

  it('records the UO name', () => {
    expect(parsed.uo).toEqual([
      { nr: 2, namn: 'Hälso- och sjukvård' },
      { nr: 5, namn: 'Hälso- och sjukvård' },
      { nr: 9, namn: 'Hälso- och sjukvård' },
    ]);
  });

  it('rejects a wrong header (annual endpoint returning another file)', () => {
    const bad = csv(['Utgiftsområde', 'Anslag'], ['09;1']);
    expect(() => parseExpenditure(bad)).toThrow(/header/);
    expect(() => parseExpenditure(csv(REVENUE_HEADER, []))).toThrow(/header/);
  });

  it('rejects duplicate (anslag, year) and unknown non-UO rows', () => {
    expect(() =>
      parseExpenditure(csv(EXPENDITURE_HEADER, [expRow(base({})), expRow(base({}))])),
    ).toThrow(/duplicate/);
    expect(() =>
      parseExpenditure(
        csv(EXPENDITURE_HEADER, [expRow({ Utgiftsområdesnamn: 'Nytt', År: '2024' })]),
      ),
    ).toThrow(/unknown non-UO/);
  });

  it('sums to the totals formula', () => {
    const last = parsed.years.length - 1;
    const uoSum = parsed.anslag.reduce((s, a) => s + (a.utfall[last] ?? 0), 0);
    const total =
      uoSum +
      (parsed.ovrigt.nettoutlaning[last] ?? 0) +
      (parsed.ovrigt.kassamassigKorrigering[last] ?? 0);
    expect(Math.round(total * 10) / 10).toBe(9.9 + 5 + 14343.2 - 1972.9);
  });
});

describe('parseRevenue', () => {
  const r = (over: Record<string, string>) =>
    revRow({
      Inkomsttyp: '1000',
      Inkomsttypsnamn: 'Skatter',
      Inkomsthuvudgrupp: '1100',
      Inkomsthuvudgruppsnamn: 'Direkta',
      Inkomsttitelgrupp: '1110',
      Inkomsttitelgruppsnamn: 'Inkomstskatter',
      Inkomsttitel: '1111',
      Inkomsttitelsnamn: 'Statlig inkomstskatt',
      År: '2024',
      'Statens budget': '1,5',
      Utfall: '2,25',
      ...over,
    });
  const parsed = parseRevenue(
    csv(REVENUE_HEADER, [
      r({ År: '2023', Inkomsttitelsnamn: 'Gammalt namn', Utfall: '' }),
      r({}),
      r({
        Inkomsttyp: '6000',
        Inkomsthuvudgrupp: '6200',
        Inkomsttitelgrupp: '',
        Inkomsttitelgruppsnamn: '',
        Inkomsttitel: '6211',
        Inkomsttitelsnamn: 'Fiske',
        Utfall: '-1,45',
      }),
      r({ Inkomsttitelgrupp: '1140-1160', Inkomsttitel: '1141', Utfall: '3' }),
    ]),
  );

  it('builds the hierarchy with latest names and sorted codes', () => {
    expect(parsed.typ.map((t) => t.kod)).toEqual(['1000', '6000']);
    expect(parsed.huvudgrupp).toHaveLength(2);
    expect(parsed.titelgrupp.map((t) => t.kod)).toEqual(['1110', '1140-1160']);
    expect(parsed.titlar.map((t) => t.kod)).toEqual(['1111', '1141', '6211']);
    expect(parsed.titlar[0].namn).toBe('Statlig inkomstskatt');
  });

  it('keeps empty as null and handles a missing titelgrupp', () => {
    const t = parsed.titlar[0];
    expect(t.utfall[parsed.years.indexOf(2023)]).toBeNull();
    expect(t.utfall[parsed.years.indexOf(2024)]).toBe(2.3);
    expect(t.budget[parsed.years.indexOf(2024)]).toBe(1.5);
    const fiske = parsed.titlar.find((x) => x.kod === '6211')!;
    expect(fiske.titelgrupp).toBeNull();
    expect(fiske.huvudgrupp).toBe('6200');
    expect(fiske.utfall.at(-1)).toBe(-1.4);
  });

  it('rejects a wrong header and a code with two parents', () => {
    expect(() => parseRevenue(csv(EXPENDITURE_HEADER, []))).toThrow(/header/);
    expect(() =>
      parseRevenue(csv(REVENUE_HEADER, [r({}), r({ År: '2023', Inkomsttitelgrupp: '1120' })])),
    ).toThrow(/two parents/);
  });
});

describe('meta', () => {
  it('tags revenue status from config, not data', () => {
    expect(yearStatuses([2022, 2023, 2024, 2025], 2023)).toEqual({
      '2022': 'final',
      '2023': 'final',
      '2024': 'preliminary',
      '2025': 'preliminary',
    });
  });

  it('keeps the fetched date when the content is unchanged', () => {
    const exp = parseExpenditure(csv(EXPENDITURE_HEADER, [expRow(base({}))]));
    const rev = parseRevenue(
      csv(REVENUE_HEADER, [
        revRow({
          Inkomsttyp: '1000',
          Inkomsttypsnamn: 'S',
          Inkomsthuvudgrupp: '1100',
          Inkomsthuvudgruppsnamn: 'D',
          Inkomsttitelgrupp: '1110',
          Inkomsttitelgruppsnamn: 'I',
          Inkomsttitel: '1111',
          Inkomsttitelsnamn: 'T',
          År: '2024',
        }),
      ]),
    );
    const file = (csvText: string) => ({
      url: 'https://example.org/x.zip',
      release: 'r',
      status: 'Definitiv',
      csv: csvText,
    });
    const args = {
      expenditure: exp,
      revenue: rev,
      expenditureFile: file('a'),
      revenueFile: file('b'),
      revenueFinalThrough: 2023,
    };
    const first = buildMeta({ ...args, today: '2026-01-01' });
    expect(first.fetched).toBe('2026-01-01');
    expect(buildMeta({ ...args, today: '2026-02-02', previous: first }).fetched).toBe('2026-01-01');
    const changed = buildMeta({
      ...args,
      expenditureFile: file('a2'),
      today: '2026-02-02',
      previous: first,
    });
    expect(changed.fetched).toBe('2026-02-02');
  });
});

describe('listing and files', () => {
  const html = `
    <a href="/OpenDataArsUtfallPage/GetFile?documentType=Inkomst&amp;fileType=Excel&amp;fileName=x.xlsx&amp;Year=2025&amp;month=0&amp;status=Prelimin%C3%A4r%201">x</a>
    <a href="/OpenDataArsUtfallPage/GetFile?documentType=Inkomst&amp;fileType=Zip&amp;fileName=%C3%85rsutfall%20inkomster%202006%20-%202025,%20%20f%C3%B6rsta.zip&amp;Year=2025&amp;month=0&amp;status=Prelimin%C3%A4r%201">x</a>
    <a href="/OpenDataArsUtfallPage/GetFile?documentType=Inkomst&amp;fileType=Zip&amp;fileName=%C3%85rsutfall%20inkomster%202006%20-%202025,%20%20andra.zip&amp;Year=2025&amp;month=0&amp;status=Prelimin%C3%A4r%202">x</a>
    <a href="/OpenDataArsUtfallPage/GetFile?documentType=Utgift&amp;fileType=Zip&amp;fileName=%C3%85rsutfall%20utgifter%201997%20-%202025,%20definitivt.zip&amp;Year=2025&amp;month=0&amp;status=Definitiv">x</a>`;
  const files = parseListing(html);

  it('keeps only zip links and unescapes them', () => {
    expect(files).toHaveLength(3);
    expect(files[0].url).toContain('https://www.statskontoret.se/OpenDataArsUtfallPage/GetFile?');
    expect(files[0].url).not.toContain('&amp;');
    expect(files[0].status).toBe('Preliminär 1');
  });

  it('picks the newest status per type', () => {
    expect(pickNewest(files, 'Inkomst').status).toBe('Preliminär 2');
    expect(pickNewest(files, 'Utgift').status).toBe('Definitiv');
    expect(statusRank('Definitiv')).toBeGreaterThan(statusRank('Preliminär 3'));
    expect(() => pickNewest([], 'Utgift')).toThrow();
  });

  it('normalises release names', () => {
    expect(releaseName('Årsutfall inkomster 2006 - 2025,  andra preliminära.zip')).toBe(
      'Årsutfall inkomster 2006 - 2025, andra preliminära',
    );
  });
});

describe('stringifyCompact', () => {
  it('puts primitive arrays on one line and is deterministic', () => {
    const out = stringifyCompact({ a: [1, null, 2.5], b: { c: [{ d: 1 }] }, e: [] });
    expect(out).toBe(
      '{\n  "a": [1, null, 2.5],\n  "b": {\n    "c": [\n      {\n        "d": 1\n      }\n    ]\n  },\n  "e": []\n}',
    );
    expect(JSON.parse(out)).toEqual({ a: [1, null, 2.5], b: { c: [{ d: 1 }] }, e: [] });
  });
});

describe('describeTarget / statusFromRelease', () => {
  it('derives the status from the release name', () => {
    expect(statusFromRelease('Årsutfall utgifter 1997 - 2025, definitivt')).toBe('Definitiv');
    expect(statusFromRelease('Årsutfall inkomster 2006 - 2025, första preliminära')).toBe(
      'Preliminär 1',
    );
    expect(statusFromRelease('Årsutfall inkomster 2006 - 2025, andra preliminära')).toBe(
      'Preliminär 2',
    );
    expect(statusFromRelease('x, tredje preliminära')).toBe('Preliminär 3');
    expect(() => statusFromRelease('something else')).toThrow();
  });

  it('uses the status query of a normal URL', () => {
    const url =
      'https://www.statskontoret.se/OpenDataArsUtfallPage/GetFile?documentType=Inkomst&fileType=Zip&fileName=%C3%85rsutfall%20inkomster%202006%20-%202025,%20%20andra%20prelimin%C3%A4ra.zip&Year=2025&month=0&status=Prelimin%C3%A4r%202';
    const t = describeTarget(url);
    expect(t.url).toBe(url);
    expect(t.location).toBe(url);
    expect(t.status).toBe('Preliminär 2');
  });

  it('falls back to the release name for a URL without status', () => {
    const t = describeTarget(
      'https://example.org/files/Årsutfall utgifter 1997 - 2025, definitivt.zip',
    );
    expect(t.status).toBe('Definitiv');
    expect(t.fileName).toBe('Årsutfall utgifter 1997 - 2025, definitivt.zip');
  });

  it('accepts a local path with the listing page, or a given URL, as provenance', () => {
    const path = '/tmp/x/Årsutfall inkomster 2006 - 2025,  andra preliminära.zip';
    const local = describeTarget(path);
    expect(local.location).toBe(path);
    expect(local.url).toBe(
      'https://www.statskontoret.se/analys-och-statistik/oppna-data/arsutfall/',
    );
    expect(local.status).toBe('Preliminär 2');
    expect(describeTarget(path, 'https://example.org/orig.zip').url).toBe(
      'https://example.org/orig.zip',
    );
  });
});

describe('readSingleZipEntry', () => {
  it('reads the only entry and rejects multi-entry zips', () => {
    const dir = mkdtempSync(join(tmpdir(), 'budget-zip-'));
    writeFileSync(join(dir, 'a.csv'), 'x;y\r\n1;2\r\n');
    writeFileSync(join(dir, 'b.csv'), 'z\n');
    const makeZip = (zip: string, ...files: string[]) =>
      execFileSync(
        'python3',
        [
          '-I',
          '-c',
          'import sys, zipfile\nz = zipfile.ZipFile(sys.argv[1], "w")\n[z.write(f) for f in sys.argv[2:]]\nz.close()',
          zip,
          ...files,
        ],
        { cwd: dir },
      );
    makeZip('one.zip', 'a.csv');
    makeZip('two.zip', 'a.csv', 'b.csv');
    expect(readSingleZipEntry(join(dir, 'one.zip'))).toBe('x;y\r\n1;2\r\n');
    expect(() => readSingleZipEntry(join(dir, 'two.zip'))).toThrow(/one zip entry/);
  });
});
