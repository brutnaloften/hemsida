/**
 * Normalise promise `area` values onto the controlled vocabulary.
 *
 *   node --experimental-strip-types tools/map-areas.ts [--term 2022-2026] [--apply]
 *
 * Covers the promise files and the candidate files (src/data/<term>/candidates/,
 * whose entries hold a promise under `.promise`). Without --apply it only reports:
 * counts per target area and every label that tools/area-mapping.json does not
 * cover (with a committee-based proposal). With --apply it rewrites the files and
 * refuses if anything is unmapped, so add those labels to the mapping file first.
 * Run `pnpm fmt` afterwards. Reusable for new terms.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { invertMapping, resolveArea, type AreaMappingFile } from './lib/area-mapping.ts';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const termIdx = args.indexOf('--term');
const term = termIdx >= 0 ? args[termIdx + 1] : '2022-2026';

const root = new URL('..', import.meta.url);
const mapping = invertMapping(
  JSON.parse(readFileSync(new URL('tools/area-mapping.json', root), 'utf8')) as AreaMappingFile,
);

type P = { area: string; committee?: string };
const unmapped = new Map<string, { count: number; proposals: Map<string, number> }>();
const perArea = new Map<string, number>();
const writes: { file: URL; text: string }[] = [];
let changed = 0;

/** Resolve one promise object in place; returns true when its area changed. */
function fix(p: P): boolean {
  const r = resolveArea(p.area, p.committee, mapping);
  if (r.status === 'proposed') {
    const e = unmapped.get(p.area) ?? { count: 0, proposals: new Map() };
    e.count++;
    const k = r.area ?? '?';
    e.proposals.set(k, (e.proposals.get(k) ?? 0) + 1);
    unmapped.set(p.area, e);
    return false;
  }
  perArea.set(r.area, (perArea.get(r.area) ?? 0) + 1);
  if (r.area === p.area) return false;
  p.area = r.area;
  return true;
}

const promiseDir = new URL(`src/data/${term}/promises/`, root);
for (const name of readdirSync(promiseDir).filter((f) => f.endsWith('.json'))) {
  const file = new URL(name, promiseDir);
  const p = JSON.parse(readFileSync(file, 'utf8')) as P;
  const area = p.area;
  if (fix(p)) {
    // Replace only the area value so key order and formatting stay untouched.
    const text = readFileSync(file, 'utf8');
    const next = text.replace(/("area":\s*)"(?:[^"\\]|\\.)*"/, `$1${JSON.stringify(p.area)}`);
    if (next === text) throw new Error(`could not rewrite area ${area} in ${name}`);
    writes.push({ file, text: next });
    changed++;
  }
}

const candDir = new URL(`src/data/${term}/candidates/`, root);
if (existsSync(candDir)) {
  for (const name of readdirSync(candDir).filter((f) => f.endsWith('.json'))) {
    const file = new URL(name, candDir);
    const entries = JSON.parse(readFileSync(file, 'utf8')) as { promise?: P }[];
    let touched = false;
    for (const e of entries) if (e.promise && fix(e.promise)) touched = true;
    if (touched) {
      writes.push({ file, text: JSON.stringify(entries, null, 2) + '\n' });
      changed++;
    }
  }
}

for (const [a, n] of [...perArea].sort((x, y) => y[1] - x[1])) console.log(`${n}\t${a}`);
if (unmapped.size > 0) {
  console.log('\nUnmapped labels (add to tools/area-mapping.json):');
  for (const [label, e] of unmapped) {
    const prop = [...e.proposals].map(([a, n]) => `${a} (${n})`).join(', ');
    console.log(`  ${e.count}x "${label}" -> proposed: ${prop}`);
  }
}
console.log(`\n${changed} file(s) would change, ${unmapped.size} unmapped label(s).`);

if (apply) {
  if (unmapped.size > 0) {
    console.error('Refusing to apply with unmapped labels.');
    process.exit(1);
  }
  for (const w of writes) writeFileSync(w.file, w.text);
  console.log('Applied. Run `pnpm fmt` to normalise formatting.');
}
