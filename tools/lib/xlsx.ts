/**
 * Minimal read-only .xlsx reader (no dependency): a ZIP central-directory walk plus `inflateRawSync`,
 * the workbook's sheet names, shared strings and the cell values of every sheet. Enough for the
 * agencies' published tables; formulas, dates and styles are not interpreted (a date cell comes back
 * as its serial number).
 */
import { inflateRawSync } from 'node:zlib';

export type Cell = string | number;
/** Cell reference ("E30") -> value. Empty cells are absent. */
export type Sheet = Map<string, Cell>;
export interface Workbook {
  /** Sheet names in workbook order. */
  names: string[];
  sheets: Map<string, Sheet>;
}

/** Entries of a ZIP archive by name, inflated. Throws on anything but stored/deflate entries. */
export function readZip(buf: Buffer): Map<string, Buffer> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip archive (no end-of-central-directory record)');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, Buffer>();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('corrupt zip central directory');
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(dataStart, dataStart + compSize);
    if (method === 0) out.set(name, Buffer.from(raw));
    else if (method === 8) out.set(name, inflateRawSync(raw));
    else throw new Error(`unsupported zip compression method ${method} for ${name}`);
  }
  return out;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function unescapeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    if (e[0] === '#') {
      return String.fromCodePoint(
        e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1),
      );
    }
    return ENTITIES[e.toLowerCase()]!;
  });
}

function textOf(xml: string): string {
  return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
    .map((m) => unescapeXml(m[1]!))
    .join('');
}

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? unescapeXml(m[1]!) : undefined;
}

export function readWorkbook(buf: Buffer): Workbook {
  const zip = readZip(buf);
  const get = (name: string): string => {
    const f = zip.get(name);
    if (!f) throw new Error(`xlsx part missing: ${name}`);
    return f.toString('utf8');
  };
  const shared = zip.has('xl/sharedStrings.xml')
    ? [...get('xl/sharedStrings.xml').matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((m) =>
        textOf(m[1]!),
      )
    : [];
  const rels = new Map<string, string>();
  for (const m of get('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\s[^>]*>/g)) {
    const id = attr(m[0], 'Id');
    const target = attr(m[0], 'Target');
    if (id && target) rels.set(id, target.replace(/^\/?(xl\/)?/, 'xl/'));
  }
  const names: string[] = [];
  const sheets = new Map<string, Sheet>();
  for (const m of get('xl/workbook.xml').matchAll(/<sheet\s[^>]*>/g)) {
    const name = attr(m[0], 'name');
    const rid = attr(m[0], 'r:id');
    const target = rid ? rels.get(rid) : undefined;
    if (!name || !target) throw new Error('workbook sheet without name or relationship');
    names.push(name);
    const cells: Sheet = new Map();
    const xml = get(target);
    for (const c of xml.matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(` ${c[1]}`, 'r');
      const type = attr(` ${c[1]}`, 't');
      const inner = c[2];
      if (!ref || inner === undefined) continue;
      if (type === 'inlineStr') {
        cells.set(ref, textOf(inner));
        continue;
      }
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      if (v === undefined) continue;
      if (type === 's') cells.set(ref, shared[Number(v)] ?? '');
      else if (type === 'str') cells.set(ref, unescapeXml(v));
      else if (type === undefined || type === 'n') cells.set(ref, Number(v));
      // booleans and errors are ignored
    }
    sheets.set(name, cells);
  }
  return { names, sheets };
}

/** Column letters ("A", "AB") of a cell reference. */
export function columnOf(ref: string): string {
  return /^[A-Z]+/.exec(ref)?.[0] ?? '';
}

/** Row number of a cell reference. */
export function rowOf(ref: string): number {
  return Number(/\d+$/.exec(ref)?.[0]);
}
