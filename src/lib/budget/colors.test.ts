import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Contrast of the label text on every budget fill (docs/design/budget-explorer.md P6): >= 4.5:1. */
const css = readFileSync(new URL('../../styles/globals.css', import.meta.url), 'utf8');
const darkStart = css.indexOf('\n  .dark {');
if (darkStart === -1) throw new Error('.dark block not found in globals.css');

function tokens(block: string): Map<string, [number, number, number]> {
  const out = new Map<string, [number, number, number]>();
  for (const m of block.matchAll(/--(budget-[\w-]+):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%;/g)) {
    out.set(m[1], [Number(m[2]), Number(m[3]) / 100, Number(m[4]) / 100]);
  }
  return out;
}

type Rgb = [number, number, number];
function hslToRgb([h, s, l]: [number, number, number]): Rgb {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function over(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return fg.map((c, i) => c * alpha + bg[i] * (1 - alpha)) as Rgb;
}

const modes = {
  light: {
    t: tokens(css.slice(0, darkStart)),
    background: hslToRgb([0, 0, 1]),
  },
  dark: {
    t: tokens(css.slice(darkStart)),
    background: hslToRgb([240, 0.1, 0.039]),
  },
};

describe.each(Object.entries(modes))('budget colours, %s mode', (_mode, { t, background }) => {
  const fills = [1, 2, 3, 4]
    .flatMap((i) => [`budget-out-${i}`, `budget-in-${i}`])
    .concat('budget-other');

  it('defines every token', () => {
    for (const name of [...fills, 'budget-box-foreground', 'budget-hatch']) {
      expect(t.has(name), name).toBe(true);
    }
  });

  it.each(fills)('label text on %s is at least 4.5:1', (name) => {
    const fg = hslToRgb(t.get('budget-box-foreground')!);
    expect(contrast(fg, hslToRgb(t.get(name)!))).toBeGreaterThanOrEqual(4.5);
  });

  it('label text on the hatched saldo box (stripes at full 35 % over the page) is at least 4.5:1', () => {
    const fg = hslToRgb(t.get('budget-box-foreground')!);
    const worst = over(hslToRgb(t.get('budget-hatch')!), 0.35, background);
    expect(contrast(fg, worst)).toBeGreaterThanOrEqual(4.5);
  });
});
