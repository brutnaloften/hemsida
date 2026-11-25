import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * JSX drops the whitespace between a text line and a following `{expression}` or element on the
 * next line, so "mandatperioden.\n<strong>Löpt ut" renders as "mandatperioden.Löpt ut". Intro
 * copy with conditional sentences needs an explicit `{' '}`. This scans the page sources for
 * a sentence terminator that is not followed by a space (or `{' '}`) before an inline element, an
 * expression or the text after a conditional fragment.
 */
const FILES = ['StartPage.astro', 'PartierPage.astro', 'PartyPage.astro'];
const INLINE = /^(<(strong|a|em|span|code)[\s>]|\{)/;

function problems(source: string): string[] {
  const lines = source.split('\n');
  const found: string[] = [];
  lines.forEach((line, i) => {
    const t = line.trim();
    // Same line: "text.<strong>" or "text.</>}Text".
    if (/[.!?:]<(strong|a|em|span|code)[\s>]/.test(t) || /[.!?]<\/>\}[A-Za-zÅÄÖåäö&]/.test(t))
      found.push(`${i + 1}: ${t}`);
    // Line break: a sentence ends the line and an inline element or expression starts the next.
    if (/[.!?:]$/.test(t)) {
      const next = lines.slice(i + 1).find((l) => l.trim() !== '');
      if (next && INLINE.test(next.trim())) found.push(`${i + 1}: "${t}" then "${next.trim()}"`);
    }
  });
  return found;
}

describe('page copy spacing', () => {
  it.each(FILES)('%s has no sentence glued to the next inline element', (file) => {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
    expect(problems(source)).toEqual([]);
  });

  it('the checker catches the known failure shapes', () => {
    expect(problems('<p>\n  Klart.\n  <strong>Löpt ut</strong>\n</p>')).toHaveLength(1);
    expect(problems("<p>\n  Klart.{' '}\n  <strong>Löpt ut</strong>\n</p>")).toEqual([]);
    expect(problems('Klart.</>}Löpt')).toHaveLength(1);
    expect(problems('Klart.<a href="x">länk</a>')).toHaveLength(1);
  });
});
