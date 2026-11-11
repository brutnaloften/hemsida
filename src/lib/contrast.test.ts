import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AGREEMENT_OUTCOMES, VERDICTS } from '@/schema/promise';

/**
 * WCAG contrast of the text/background pairs in src/styles/globals.css, in both themes. The test
 * parses the CSS so the tokens cannot drift from what is checked.
 */
const css = readFileSync(new URL('../styles/globals.css', import.meta.url), 'utf8');

type Theme = 'light' | 'dark';

/** Declarations of the first `:root` / `.dark` block that defines `marker`. */
function block(theme: Theme, marker: string): Record<string, string> {
  const selector = theme === 'light' ? ':root {' : '.dark {';
  let from = 0;
  for (;;) {
    const i = css.indexOf(selector, from);
    if (i < 0) throw new Error(`no ${selector} block with ${marker}`);
    const end = css.indexOf('\n  }', i);
    const close = css.indexOf('\n}', i);
    const stop = end >= 0 && end < close ? end : close;
    const body = css.slice(i, stop);
    if (body.includes(marker)) {
      return Object.fromEntries(
        [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
      );
    }
    from = i + 1;
  }
}

function hslToRgb(value: string): [number, number, number] {
  const [h, s, l] = value.split(/\s+/).map((x) => parseFloat(x));
  const sat = s / 100;
  const lig = l / 100;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return 255 * (lig - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
  };
  return [f(0), f(8), f(4)];
}

function toRgb(value: string): [number, number, number] {
  if (value.startsWith('#')) {
    const n = parseInt(value.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return hslToRgb(value);
}

function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(fg: string, bg: string): number {
  const [a, b] = [luminance(toRgb(fg)), luminance(toRgb(bg))].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

describe.each(['light', 'dark'] as const)('contrast (%s)', (theme) => {
  const base = block(theme, '--background');
  const badges = block(theme, '--verdict-fulfilled-bg');
  const ground = base['--background'];
  // transparent backgrounds sit on the ground (or on the muted surface for the period bar/panels).
  const bgOf = (v: string, surface: string) => (v === 'transparent' ? surface : v);

  it('body text and secondary text reach 4.5:1 on ground and surface', () => {
    for (const bg of [ground, base['--muted']]) {
      expect(ratio(base['--foreground'], bg)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(base['--muted-foreground'], bg)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(base['--foreground-soft'], bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('ink on the highlighter reaches 4.5:1', () => {
    expect(ratio(base['--highlight-foreground'], base['--highlight'])).toBeGreaterThanOrEqual(4.5);
  });

  it('primary button text reaches 4.5:1', () => {
    expect(ratio(base['--primary-foreground'], base['--primary'])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(VERDICTS)('verdict badge %s reaches 4.5:1', (v) => {
    const fg = badges[`--verdict-${v}-fg`];
    for (const surface of [ground, base['--muted']]) {
      const bg = bgOf(badges[`--verdict-${v}-bg`], surface);
      expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(AGREEMENT_OUTCOMES)('agreement badge %s reaches 4.5:1', (o) => {
    const fg = badges[`--agreement-${o}-fg`];
    for (const surface of [ground, base['--muted']]) {
      const bg = bgOf(badges[`--agreement-${o}-bg`], surface);
      expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('the Motverkar evidence label reaches 4.5:1', () => {
    const fg = badges['--evidence-contradicts-fg'];
    for (const surface of [ground, base['--muted']]) {
      const bg = bgOf(badges['--evidence-contradicts-bg'], surface);
      expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    }
    expect(ratio(badges['--evidence-contradicts-border'], ground)).toBeGreaterThanOrEqual(3);
  });

  it('the dashed outline of unassessed badges reaches 3:1 against the ground (WCAG 1.4.11)', () => {
    expect(ratio(badges['--verdict-unassessed-border'], ground)).toBeGreaterThanOrEqual(3);
  });
});
