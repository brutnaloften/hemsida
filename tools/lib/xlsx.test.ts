import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  buildSeries,
  parseConfig,
  readXlsxValue,
  xlsxSeriesConfigSchema,
  xlsxSelection,
} from './statistics-ingest.ts';
import { readWorkbook, readZip } from './xlsx.ts';

/** Minimal zip writer for fixtures (no CRC check on read, so the CRC is left 0). */
function zip(files: Record<string, string>, stored = false): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBuf = Buffer.from(name);
    const raw = Buffer.from(text);
    const data = stored ? raw : deflateRawSync(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0);
    head.writeUInt16LE(stored ? 0 : 8, 10);
    head.writeUInt32LE(data.length, 20);
    head.writeUInt32LE(raw.length, 24);
    head.writeUInt16LE(nameBuf.length, 28);
    head.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    central.push(head, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
function xlsx(sheetXml: string, shared: string[]): Buffer {
  return zip({
    'xl/workbook.xml': `<workbook ${NS} xmlns:r="x"><sheets><sheet name="Kön, första" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
    'xl/sharedStrings.xml': `<sst ${NS}>${shared.map((s) => `<si><t>${s}</t></si>`).join('')}</sst>`,
    'xl/worksheets/sheet1.xml': `<worksheet ${NS}><sheetData>${sheetXml}</sheetData></worksheet>`,
  });
}

const sheetXml =
  `<row r="6"><c r="B6" t="s"><v>0</v></c><c r="E6" t="s"><v>1</v></c></row>` +
  `<row r="30"><c r="A30" s="1"/><c r="B30" t="s"><v>2</v></c><c r="E30"><v>3744</v></c></row>` +
  `<row r="31"><c r="B31" t="s"><v>3</v></c><c r="E31" t="s"><v>4</v></c></row>`;
const shared = ['Uppehållsgrund 2', 'Totalt', 'Vidarebosättning (Kvot)', 'Annat &amp; mer', '..'];

describe('readZip / readWorkbook', () => {
  it('reads deflated and stored entries', () => {
    expect(
      readZip(zip({ 'a.txt': 'hej' }))
        .get('a.txt')
        ?.toString(),
    ).toBe('hej');
    expect(
      readZip(zip({ 'a.txt': 'hej' }, true))
        .get('a.txt')
        ?.toString(),
    ).toBe('hej');
  });

  it('rejects a non-zip (an HTML error page)', () => {
    expect(() => readZip(Buffer.from('<html>Något gick fel</html>'.repeat(5)))).toThrow(/zip/);
  });

  it('reads sheet names, shared strings (with entities), numbers and skips empty cells', () => {
    const wb = readWorkbook(xlsx(sheetXml, shared));
    expect(wb.names).toEqual(['Kön, första']);
    const s = wb.sheets.get('Kön, första')!;
    expect(s.get('B30')).toBe('Vidarebosättning (Kvot)');
    expect(s.get('E30')).toBe(3744);
    expect(s.get('B31')).toBe('Annat & mer');
    expect(s.has('A30')).toBe(false);
  });
});

const config = xlsxSeriesConfigSchema.parse({
  id: 'mv-test',
  source: 'migrationsverket',
  table: 'x.xlsx, blad Kön, första',
  files: [{ period: '2022', url: 'https://example.org/a.xlsx' }],
  sheet: 'Kön, första',
  labelColumn: 'B',
  rowLabel: 'Vidarebosättning (Kvot)',
  valueColumn: 'E',
  checks: [{ cell: 'E6', equals: 'Totalt' }],
  label: 'Test',
  unit: 'tillstånd',
  frequency: 'year',
});
const sheet = () => readWorkbook(xlsx(sheetXml, shared));

describe('readXlsxValue', () => {
  it('reads the cell in the labelled row under the checked header', () => {
    expect(readXlsxValue(sheet(), config, '2022')).toBe(3744);
  });

  it('fails when a header check does not hold', () => {
    expect(() =>
      readXlsxValue(sheet(), { ...config, checks: [{ cell: 'E6', equals: 'Kvinna' }] }, '2022'),
    ).toThrow(/E6/);
  });

  it('fails on a missing or ambiguous row', () => {
    expect(() => readXlsxValue(sheet(), { ...config, rowLabel: 'Saknas' }, '2022')).toThrow(
      /0 rows/,
    );
  });

  it('never reads a suppressed cell as zero', () => {
    expect(() => readXlsxValue(sheet(), { ...config, rowLabel: 'Annat & mer' }, '2022')).toThrow(
      /not a number/,
    );
  });

  it('uses the period as the row label without rowLabel', () => {
    const rows = `<row r="1"><c r="A1"><v>2022</v></c><c r="H1"><v>10242</v></c></row>`;
    const s = readWorkbook(xlsx(rows, []));
    const c = {
      ...config,
      labelColumn: 'A',
      rowLabel: undefined,
      valueColumn: 'H',
      checks: [{ cell: 'A1', equals: '{period}' }],
    };
    expect(readXlsxValue(s, c, '2022')).toBe(10242);
    // A period placeholder pins the year: the wrong file for a period fails.
    expect(() => readXlsxValue(s, c, '2023')).toThrow(/A1/);
  });

  it('checks cells on another sheet and requires the sheet to exist', () => {
    const c = { ...config, checks: [{ sheet: 'Saknas', cell: 'E6', equals: 'Totalt' }] };
    expect(() => readXlsxValue(sheet(), c, '2022')).toThrow(/no sheet "Saknas"/);
  });

  it('rejects a config without checks', () => {
    expect(() => xlsxSeriesConfigSchema.parse({ ...config, checks: [] })).toThrow();
  });
});

describe('reader edge cases', () => {
  const read = (rows: string, strings: string[] = []) =>
    readWorkbook(xlsx(rows, strings)).sheets.get('Kön, första')!;

  it('treats an empty <v> as an absent cell and throws on a non-numeric one', () => {
    expect(read('<row r="1"><c r="A1"><v></v></c></row>').has('A1')).toBe(false);
    expect(() => read('<row r="1"><c r="A1"><v>abc</v></c></row>')).toThrow(/non-numeric/);
  });

  it('keeps shared-string indexes aligned across an empty <si/>', () => {
    const wb = zip({
      'xl/workbook.xml': `<workbook ${NS} xmlns:r="x"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      'xl/_rels/workbook.xml.rels': `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
      'xl/sharedStrings.xml': `<sst ${NS}><si/><si><t>efter</t></si></sst>`,
      'xl/worksheets/sheet1.xml': `<worksheet ${NS}><sheetData><row r="1"><c r="A1" t="s"><v>1</v></c></row></sheetData></worksheet>`,
    });
    expect(readWorkbook(wb).sheets.get('S')!.get('A1')).toBe('efter');
  });

  it('reads inline strings and rich-text shared strings without phonetic runs', () => {
    const s = read(
      '<row r="1"><c r="A1" t="inlineStr"><is><t>Rad</t></is></c><c r="B1" t="s"><v>0</v></c></row>',
      [],
    );
    expect(s.get('A1')).toBe('Rad');
    const rich = zip({
      'xl/workbook.xml': `<workbook ${NS} xmlns:r="x"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      'xl/_rels/workbook.xml.rels': `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
      'xl/sharedStrings.xml': `<sst ${NS}><si><r><t>Vård </t></r><r><t xml:space="preserve">eller</t></r><rPh><t>ignored</t></rPh></si></sst>`,
      'xl/worksheets/sheet1.xml': `<worksheet ${NS}><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData></worksheet>`,
    });
    expect(readWorkbook(rich).sheets.get('S')!.get('A1')).toBe('Vård eller');
  });
});

describe('xlsx series config and file', () => {
  it('records the selection, collapsing one shared url', () => {
    expect(xlsxSelection(config)).toEqual({
      sheet: 'Kön, första',
      labelColumn: 'B',
      rowLabel: 'Vidarebosättning (Kvot)',
      valueColumn: 'E',
      url: 'https://example.org/a.xlsx',
    });
    const two = {
      ...config,
      files: [
        { period: '2022', url: 'https://example.org/a.xlsx' },
        { period: '2023', url: 'https://example.org/b.xlsx' },
      ],
    };
    expect(xlsxSelection(two)['url 2023']).toBe('https://example.org/b.xlsx');
  });

  it('builds a valid series and rejects a duplicate period', () => {
    const s = buildSeries({
      config,
      values: new Map([['2022', 3744]]),
      today: '2026-11-24',
    });
    expect(s.source).toBe('migrationsverket');
    expect(s.values).toEqual({ '2022': 3744 });
    const dup = { ...config, files: [config.files[0]!, config.files[0]!] };
    expect(() => parseConfig({ term: '2022-2026', series: [dup] })).toThrow(/duplicate period/);
  });
});
