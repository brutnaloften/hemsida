import { describe, expect, it } from 'vitest';
import { parseAmounts, sentenceSpans } from './eval-brief.ts';

function split(text: string): string[] {
  return sentenceSpans(text).map((s) => text.slice(s.start, s.end));
}

describe('sentenceSpans', () => {
  it('splits after words ending in st, also non-ASCII ones', () => {
    expect(split('Det är bäst. Regeringen anser annat.')).toHaveLength(2);
    expect(split('Det sker i höst. Utskottet välkomnar det.')).toHaveLength(2);
    expect(split('Personröst. Väst. Ett.')).toHaveLength(3);
  });

  it('does not split inside citations', () => {
    expect(split('Se prop. 2024/25:1 för detaljer.')).toHaveLength(1);
    expect(split('Se (bet. 2015/16:KU4 punkt 5, rskr. 2015/16:155). Nästa mening.')).toHaveLength(
      2,
    );
    expect(split('Se rskr. 2015/16:155 och s. 34. Nästa mening.')).toHaveLength(2);
    expect(split('Se prop. 2018/19:91 s. 34 och så vidare.')).toHaveLength(1);
  });

  it('does not split after s.k., m.m., dvs. or bl.a.', () => {
    expect(split('Det gäller s.k. Tidöavtalet och m.m. Det gäller dvs. Sverige.')).toHaveLength(1);
    expect(split('Det gäller bl.a. Sverige och t.ex. Norge.')).toHaveLength(1);
  });

  it('splits after "s." that is not followed by a digit', () => {
    expect(split('Det rör sig om hus. Nästa.')).toHaveLength(2);
    expect(split('Se s. Nästa.')).toHaveLength(2);
  });
});

describe('parseAmounts', () => {
  it('does not read "3 krävs" or "5 kronofogden" as kronor', () => {
    expect(parseAmounts('I avsnitt 5.3.3 krävs ett beslut.')).toEqual([]);
    expect(parseAmounts('Kapitel 3 krävs. Se 5 kronofogden.')).toEqual([]);
    expect(parseAmounts('Det kostar 3 kr.')).toHaveLength(1);
  });

  it('keeps "cirka" and attributes the year within a sentence split by the abbreviation rules', () => {
    const [a] = parseAmounts('Överskottet var cirka 4 miljarder kronor 2023.');
    expect(a).toMatchObject({ kronor: 4_000_000_000, year: 2023, approx: true });
    const both = parseAmounts(
      'Se prop. 2022/23:1. Det avsätts 5 miljoner kronor 2024 enligt s. 12.',
    );
    expect(both).toHaveLength(1);
    expect(both[0]!.year).toBe(2024);
  });

  it('attaches a year only when the sentence ties it to the money', () => {
    const year = (t: string) => parseAmounts(t)[0]?.year;
    expect(year('För 2026 avsätts 1 000 000 000 kronor.')).toBe(2026);
    expect(year('För 2024 avsattes 1 600 000 000 kronor för förlossningsvård.')).toBe(2024);
    expect(year('Regeringen avsätter 1 700 000 000 kronor under 2023.')).toBe(2023);
    expect(year('Anslaget uppgår till 5 miljoner kronor 2023.')).toBe(2023);
    expect(year('Med 2026 års prisnivå motsvarar det 2 miljoner kronor.')).toBe(2026);
    // a year elsewhere in the sentence is not the amount's year
    expect(year('Regeln infördes 2022 och kostar 200 000 000 kronor.')).toBeNull();
    // ranges, riksmöten and references are never a single year
    expect(year('Ett åtagande på högst 36 miljoner kronor för 2026–2046.')).toBeNull();
    expect(year('Enligt prop. 2024/25:1 avsätts 5 miljoner kronor.')).toBeNull();
    expect(year('Enligt lagen (2025:50) avsätts 5 miljoner kronor.')).toBeNull();
  });

  it('keeps öre decimals in raw', () => {
    expect(parseAmounts('Avgiften är 332,60 kronor.')[0]!.raw).toBe('332,60 kronor');
  });
});
