// Manual regression guard: fail if any built page scrolls horizontally on a phone.
// Needs Playwright (not a repo dependency): `npm i --no-save playwright && npx playwright install chromium`
// or point PLAYWRIGHT at an existing install (absolute path to its index.mjs). Usage:
//   pnpm build && pnpm preview --port 4321 &
//   node tools/check-mobile-overflow.mjs [--width 320] [--sample 1] [--base http://localhost:4321]
// --sample N checks every Nth page (default 1 = all; try 20 for a quick pass).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const width = Number(arg('width', 320));
const sample = Number(arg('sample', 1));
const base = arg('base', 'http://localhost:4321');
const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');

const root = 'dist';
const paths = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f === 'index.html' && !readFileSync(p, 'utf8').includes('http-equiv="refresh"'))
      paths.push('/' + dir.slice(root.length + 1));
  }
})(root);

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width, height: 800 } })).newPage();
let failed = 0;
let checked = 0;
for (const [i, path] of paths.entries()) {
  if (i % sample !== 0) continue;
  await page.goto(base + path, { waitUntil: 'load' });
  await page.waitForTimeout(50);
  const over = await page
    .evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    .catch(() => 0); // client-side redirect stubs navigate away mid-evaluate
  checked++;
  if (over > 0) {
    failed++;
    console.log(`${path}: ${over}px wider than the ${width}px viewport`);
  }
}
await browser.close();
console.log(`checked ${checked} pages at ${width}px, ${failed} overflowing`);
process.exit(failed ? 1 : 0);
