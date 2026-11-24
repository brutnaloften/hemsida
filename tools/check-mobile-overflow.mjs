// Manual regression guard: fail if any built page scrolls horizontally on a phone, or if an AI-tag
// popup (opened by hover and by keyboard focus) is not fully inside the viewport. HTTP errors and
// page crashes fail the run.
// Needs Playwright (not a repo dependency): `npm i --no-save playwright && npx playwright install chromium`
// or point PLAYWRIGHT at an existing install (absolute path to its index.mjs). Usage:
//   pnpm build && pnpm preview --port 4321 &
//   node tools/check-mobile-overflow.mjs [--width 320] [--sample 1] [--base http://localhost:4321]
// --sample N checks every Nth page (default 1 = all; try 20 for a quick pass).
// --max-tags N opens at most N evenly spread AI tags per page (default 12).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const width = Number(arg('width', 320));
const sample = Number(arg('sample', 1));
const maxTags = Number(arg('max-tags', 12));
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
let tagsChecked = 0;
const fail = (msg) => {
  failed++;
  console.log(msg);
};
// Page errors and crashes are failures, not something to swallow.
let pageProblem = null;
page.on('pageerror', (e) => (pageProblem = `page error: ${e.message}`));
page.on('crash', () => (pageProblem = 'page crashed'));

/** Popup of the n-th AI tag, opened with `open`, as a rect plus the overflow it causes. */
const measureTag = (n, open, block) =>
  page.evaluate(
    async ([n, open, block]) => {
      const tag = document.querySelectorAll('.ai-tag')[n];
      const anchor = tag.firstElementChild;
      const popup = tag.lastElementChild;
      // Scroll first, then open: the popup must follow the tag, not sit at its unscrolled position.
      anchor.scrollIntoView({ block, inline: 'nearest' });
      if (open === 'focus') anchor.focus({ preventScroll: true });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const r = popup.getBoundingClientRect();
      const out = {
        left: r.left,
        right: r.right,
        shown: r.width > 0,
        over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        vw: window.innerWidth,
        vh: window.innerHeight,
        top: r.top,
        bottom: r.bottom,
        anchorY: anchor.getBoundingClientRect().bottom,
      };
      if (open === 'focus') anchor.blur();
      return out;
    },
    [n, open, block],
  );

for (const [i, path] of paths.entries()) {
  if (i % sample !== 0) continue;
  pageProblem = null;
  const res = await page.goto(base + path, { waitUntil: 'load' });
  if (!res || res.status() >= 400) {
    fail(`${path}: HTTP ${res?.status()}`);
    continue;
  }
  await page.waitForTimeout(50);
  checked++;
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (over > 0) fail(`${path}: ${over}px wider than the ${width}px viewport`);

  // Open AI tags by keyboard focus and by hover; the popup must stay inside [0, innerWidth].
  const count = await page.locator('.ai-tag').count();
  const step = Math.max(1, Math.ceil(count / maxTags));
  for (let n = 0; n < count; n += step) {
    for (const [how, block] of [
      ['focus', 'center'],
      ['hover', 'center'],
      ['focus', 'start'],
    ]) {
      if (how === 'hover') {
        await page
          .locator('.ai-tag')
          .nth(n)
          .evaluate((t, block) => {
            t.scrollIntoView({ block, inline: 'nearest' });
          }, block);
        await page.locator('.ai-tag').nth(n).hover();
      }
      const m = await measureTag(n, how, block);
      if (how === 'hover') await page.mouse.move(0, 0);
      tagsChecked++;
      const label = `${path} (AI tag #${n}, ${how}, scrolled to ${block})`;
      if (!m.shown) fail(`${label}: popup not shown`);
      else if (m.left < -0.5 || m.right > m.vw + 0.5)
        fail(
          `${label}: popup spans ${m.left.toFixed(0)}..${m.right.toFixed(0)}, viewport 0..${m.vw}`,
        );
      else if (m.top < 0 || m.bottom > m.vh)
        fail(
          `${label}: popup spans y ${m.top.toFixed(0)}..${m.bottom.toFixed(0)}, viewport 0..${m.vh}`,
        );
      else if (m.top - m.anchorY < -1 || m.top - m.anchorY > 40)
        fail(
          `${label}: popup is not directly below its tag (gap ${(m.top - m.anchorY).toFixed(0)}px)`,
        );
      if (m.over > 0) fail(`${label}: opening it makes the page ${m.over}px too wide`);
    }
  }
  if (pageProblem) fail(`${path}: ${pageProblem}`);
}
await browser.close();
console.log(
  `checked ${checked} pages and ${tagsChecked} AI-tag popups at ${width}px, ${failed} problems`,
);
process.exit(failed ? 1 : 0);
