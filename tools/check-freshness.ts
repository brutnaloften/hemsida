/**
 * Print stale datasets and why; exit 1 if any are stale.
 *   node --experimental-strip-types tools/check-freshness.ts [--today YYYY-MM-DD]
 */
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { defaultManifestPath, loadManifest } from './lib/freshness.ts';
import { checkFreshness, isValidDate } from './lib/freshness-check.ts';

const { values } = parseArgs({ options: { today: { type: 'string' } } });
const today = values.today ?? new Date().toISOString().slice(0, 10);
if (!isValidDate(today)) throw new Error(`--today must be YYYY-MM-DD, got ${today}`);

const manifest = loadManifest(defaultManifestPath(resolve(import.meta.dirname, '..')));
const verdicts = checkFreshness(manifest, today);
for (const v of verdicts) console.log(`${v.stale ? 'STALE' : 'ok   '} ${v.id}: ${v.reason}`);
const stale = verdicts.filter((v) => v.stale);
if (stale.length > 0) {
  console.error(`${stale.length} stale dataset(s): ${stale.map((v) => v.id).join(', ')}`);
  process.exit(1);
}
