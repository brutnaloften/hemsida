import { describe, expect, it } from 'vitest';
import type { Brief, DocumentBrief } from './eval-brief.ts';
import {
  buildSummary,
  highlight,
  renderSummary,
  useColor,
  visibleLength,
  wrap,
  yearLabel,
  type BriefSummary,
} from './eval-summary.ts';
import { annotateParagraphs, parseRiksdagText } from './riksdag-text.ts';
import { HC01SOU1_AMOUNT_PARAGRAPH, HD01SOU1_TEXT } from './riksdag-text.fixtures.ts';

const hd = annotateParagraphs(parseRiksdagText(HD01SOU1_TEXT), 'bet');
const hc = annotateParagraphs(
  [
    { text: 'Anslaget 1:6 Bidrag till folkhälsa och sjukvård', heading: true },
    { text: HC01SOU1_AMOUNT_PARAGRAPH, heading: false },
  ],
  'bet',
);

const curated = [
  'förlossningsvård',
  'förlossningsplan',
  'barnmorsketeam',
  'förlossning',
  'mödravård',
  'kvinnors och flickors hälsa',
];
// `nationell` comes from the promise title, not from its keywords, and is very frequent.
const derived = [...curated, 'nationell'];
const nationell = Array.from({ length: 80 }, () => ({
  text: 'Det finns en nationell strategi.',
  heading: false,
}));
const hdNoisy = annotateParagraphs([...parseRiksdagText(HD01SOU1_TEXT), ...nationell], 'bet');

describe('buildSummary', () => {
  it('picks the government sentence next to the 1 000 000 000 kr amount, not the whole paragraph', () => {
    const s = buildSummary(hd, derived, curated);
    expect(s.mode).toBe('amounts');
    expect(s.main).toHaveLength(1);
    expect(s.main[0]!.kind).toBe('government');
    expect(s.main[0]!.text).toBe(
      'Satsningen på kvinnors och flickors hälsa och mödravården fortsätter.',
    );
    expect(s.main[0]!.amounts.map((a) => a.kronor)).toEqual([1_000_000_000]);
  });

  it('only takes amounts from the matched sentence, not from the rest of the paragraph', () => {
    const s = buildSummary(hd, derived, curated);
    // the 200 000 000 kr sentence in the same paragraph is about sexuellt våld
    expect(s.main[0]!.amounts.some((a) => a.kronor === 200_000_000)).toBe(false);
  });

  it('collapses the opposition to one line per party, preferring the sentence with more terms', () => {
    const s = buildSummary(hd, derived, curated);
    const by = (p: string) => s.opposition.find((f) => f.parties.join() === p);
    expect(by('S')?.kind).toBe('special_statement');
    expect(by('S')?.text).toContain('sänka den särskilda satsningen på mödravård');
    expect(by('MP')?.amounts.map((a) => a.kronor)).toEqual([600_000_000]);
    expect(new Set(s.opposition.map((f) => f.parties.join())).size).toBe(s.opposition.length);
  });

  it('finds the prior-year amount on the prior-year text', () => {
    const s = buildSummary(hc, derived, curated);
    expect(s.main[0]!.amounts.map((a) => a.kronor)).toEqual([1_600_000_000]);
    expect(s.main[0]!.text).toBe(
      'För 2024 avsattes 1 600 000 000 kronor för förlossningsvård och kvinnors hälsa.',
    );
  });

  it('never lists a generic derived term and merges prefix duplicates', () => {
    const s = buildSummary(hdNoisy, derived, curated);
    expect(s.terms.map((t) => t.term)).not.toContain('nationell');
    // förlossningsplan has no hit, so it stays; förlossningsvård is kept only because
    // förlossning (its prefix) has hits in the text
    expect(s.terms.find((t) => t.term === 'förlossningsplan')?.count).toBe(0);
    const zero = buildSummary(hdNoisy, ['förlossningsplan', 'förlossning'], ['förlossningsplan']);
    expect(zero.terms.map((t) => t.term)).toEqual(['förlossningsplan']);
  });

  it('drops a longer term whose shorter prefix term has no hits', () => {
    const s = buildSummary(hd, ['barnmorske', 'barnmorsketeam'], ['barnmorske', 'barnmorsketeam']);
    expect(s.terms.map((t) => t.term)).toEqual(['barnmorske']);
  });

  it('falls back to term sentences without amounts for non-budget text', () => {
    const dir = annotateParagraphs(
      [
        { text: 'Anhörigstöd ska utvecklas. Särskilda medel behövs inte.', heading: false },
        { text: 'Ett annat stycke.', heading: false },
      ],
      'dir',
    );
    const s = buildSummary(dir, ['anhörigstöd'], ['anhörigstöd']);
    expect(s.mode).toBe('sentences');
    expect(s.main[0]!.text).toBe('Anhörigstöd ska utvecklas.');
    expect(s.main[0]!.amounts).toEqual([]);
  });

  it('reports mode none when no term occurs', () => {
    const s = buildSummary(hd, ['barnmorsketeam'], ['barnmorsketeam']);
    expect(s.mode).toBe('none');
    expect(s.main).toEqual([]);
    expect(s.terms).toEqual([{ term: 'barnmorsketeam', count: 0, sample: null }]);
  });
});

describe('formatting helpers', () => {
  it('bolds terms to the end of the word, only with colour', () => {
    expect(highlight('Förlossningsvården växer.', ['förlossning'], false)).toBe(
      'Förlossningsvården växer.',
    );
    expect(highlight('Förlossningsvården växer.', ['förlossning'], true)).toBe(
      '\u001b[1mFörlossningsvården\u001b[22m växer.',
    );
  });

  it('honours NO_COLOR and non-TTY', () => {
    expect(useColor(true, {})).toBe(true);
    expect(useColor(true, { NO_COLOR: '1' })).toBe(false);
    expect(useColor(false, {})).toBe(false);
    expect(useColor(undefined, {})).toBe(false);
  });

  it('wraps to the width counting visible characters only', () => {
    const text = highlight('aaaa bbbb cccc dddd', ['bbbb'], true);
    const lines = wrap(text, 9, 2);
    expect(lines.map(visibleLength).every((n) => n <= 9)).toBe(true);
    expect(lines).toHaveLength(3);
  });

  it('labels budget riksmöten by budget year', () => {
    expect(yearLabel('2025/26', '2025-12-01', true)).toBe('2026');
    expect(yearLabel('2025/26', '2025-12-01', false)).toBe('2025/26');
    expect(yearLabel('2023', '2023-03-01', false)).toBe('2023');
  });
});

function docBrief(over: Partial<DocumentBrief>): DocumentBrief {
  return {
    document_id: 'HD01SoU1',
    document_type: 'bet',
    title: 'Statens budget inom utgiftsområde 9',
    rm: '2025/26',
    date: '2025-12-10',
    url: 'https://data.riksdagen.se/dokument/HD01SoU1.html',
    text_available: true,
    paragraph_count: 10,
    terms: [],
    passages: [],
    ...over,
  };
}

function briefOf(prior: Brief['prior_year']): Brief {
  return {
    pair_id: 'p::HD01SoU1',
    promise_id: 'p',
    promise_title: 'Nationell förlossningsplan',
    document: docBrief({}),
    prior_year: prior,
  };
}

describe('renderSummary', () => {
  const summary: BriefSummary = {
    current: buildSummary(hdNoisy, derived, curated),
    prior: buildSummary(hc, derived, curated),
  };
  const brief = briefOf({
    status: 'found',
    document: docBrief({ document_id: 'HC01SoU1', rm: '2024/25' }),
  });
  const out = renderSummary(brief, summary, { width: 100, color: false })!;

  it('shows both years side by side, then the zero-hit lines, and never a label', () => {
    expect(out).toContain('NYCKELFYND (utan bedömning)');
    expect(out).toMatch(/2026\s+Regeringen\s+1 000 000 000 kr\s+«Satsningen på kvinnors/);
    expect(out).toMatch(/2025\s+Regeringen\s+1 600 000 000 kr\s+«För 2024 avsattes/);
    expect(out).toMatch(/S \(särskilt yttrande\)\s+«Vidare har regeringen valt att sänka/);
    expect(out).toContain('«förlossningsplan»: 0 träffar (båda åren)');
    expect(out).toContain('«barnmorsketeam»: 0 träffar (båda åren)');
    expect(out).not.toMatch(/nationell/);
    expect(out).not.toMatch(/match|partial|no_match|contradicts/i);
  });

  it('prints the prefix note once and fits the width', () => {
    expect(out.match(/räknas från ordbörjan/g)).toHaveLength(1);
    expect(out.split('\n').every((l) => visibleLength(l) <= 100)).toBe(true);
  });

  it('contains no ANSI codes without colour and bold codes with it', () => {
    expect(out).not.toContain('\u001b');
    const colour = renderSummary(brief, summary, { width: 100, color: true })!;
    expect(colour).toContain('\u001b[1m');
  });

  it('wraps to a narrow terminal', () => {
    const narrow = renderSummary(brief, summary, { width: 60, color: false })!;
    expect(narrow.split('\n').every((l) => l.length <= 60)).toBe(true);
  });

  it('is never empty for a document without hits or amounts', () => {
    const empty: BriefSummary = {
      current: buildSummary(hd, ['barnmorsketeam'], ['barnmorsketeam']),
      prior: null,
    };
    const text = renderSummary(briefOf(null), empty, { width: 100, color: false })!;
    expect(text).toContain('Inga meningar med löftets sökord hittades i texten.');
    expect(text).toContain('«barnmorsketeam»: 0 träffar');
  });

  it('says so when there is no prior year or no text, and returns null without a summary', () => {
    const none = renderSummary(
      briefOf({ status: 'none', reason: 'utanför mandatperioden' }),
      summary,
      { width: 100, color: false },
    )!;
    expect(none).toContain('Föregående år: ingen motsvarighet (utanför mandatperioden).');
    const noText = { ...briefOf(null), document: docBrief({ text_available: false }) };
    expect(renderSummary(noText, summary, { width: 100, color: false })).toContain(
      'Fulltext saknas',
    );
    expect(renderSummary(briefOf(null), undefined, { width: 100, color: false })).toBeNull();
  });
});
