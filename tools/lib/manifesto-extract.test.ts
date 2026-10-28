import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  EXTRACTION_RULES,
  addRawCandidates,
  quoteMatchKind,
  quoteMatches,
  splitPages,
  toManifestoEntry,
  validateCandidates,
  type RawManifestoCandidate,
} from './manifesto-extract.ts';

const srcL = {
  id: 'valmanifest-2022-l',
  kind: 'manifesto' as const,
  parties: ['L' as const],
  date: '2022-08-01',
};
const srcS = { ...srcL, id: 'valmanifest-2022-s', parties: ['S' as const] };

const raw = (over: Partial<RawManifestoCandidate> = {}): RawManifestoCandidate => ({
  slug: 'Skolplikt förlängd',
  section: 'Skola',
  title: 'Förläng skolplikten',
  description: 'Skolplikten ska förlängas.',
  page: 2,
  quote: 'Skolplikten ska förlängas',
  type: 'legislative',
  area: 'Utbildningspolitik',
  committee: 'UbU',
  keywords: ['skolplikt', ' '],
  ...over,
});

describe('toManifestoEntry', () => {
  it('builds an L entry: prefix, government role, unassessed, no evidence', () => {
    const e = toManifestoEntry(raw(), srcL, new Set(), '2026-10-28');
    expect(e.section).toBe('Skola');
    expect(e.promise.id).toBe('val2022-l-skolplikt-forlangd');
    expect(e.promise.parties).toEqual(['L']);
    expect(e.promise.roles).toEqual({ L: 'government' });
    expect(e.promise.source).toEqual({
      id: 'valmanifest-2022-l',
      page: 2,
      quote: 'Skolplikten ska förlängas',
    });
    expect(e.promise.verdict.value).toBe('unassessed');
    expect(e.promise.evidence).toEqual([]);
    expect(e.promise.keywords).toEqual(['skolplikt']);
  });

  it('differs for another party (S: prefix and opposition role)', () => {
    const e = toManifestoEntry(raw(), srcS, new Set(), '2026-10-28');
    expect(e.promise.id).toBe('val2022-s-skolplikt-forlangd');
    expect(e.promise.roles).toEqual({ S: 'opposition' });
    expect(e.promise.source.id).toBe('valmanifest-2022-s');
  });

  it('gives SD the support role', () => {
    const e = toManifestoEntry(raw(), { ...srcL, parties: ['SD'] }, new Set(), '2026-10-28');
    expect(e.promise.roles).toEqual({ SD: 'support' });
  });

  it('suffixes colliding ids', () => {
    const taken = new Set(['val2022-l-skolplikt-forlangd', 'val2022-l-skolplikt-forlangd-2']);
    expect(toManifestoEntry(raw(), srcL, taken, '2026-10-28').promise.id).toBe(
      'val2022-l-skolplikt-forlangd-3',
    );
  });

  it('rejects unknown type and multi-party sources', () => {
    expect(() => toManifestoEntry(raw({ type: 'nope' }), srcL, new Set(), 'x')).toThrow(
      /unknown type/,
    );
    expect(() =>
      toManifestoEntry(raw(), { ...srcL, parties: ['L', 'M'] }, new Set(), '2026-10-28'),
    ).toThrow(/exactly one party/);
  });

  it('rejects a source that is not a manifesto', () => {
    expect(() =>
      toManifestoEntry(raw(), { ...srcL, kind: 'government_agreement' }, new Set(), 'x'),
    ).toThrow(/kind must be "manifesto"/);
  });
});

describe('addRawCandidates', () => {
  it('derives ids, replaces entries from the same pages and sorts', () => {
    const first = addRawCandidates(
      [raw({ page: 5 }), raw({ page: 2 })],
      srcL,
      new Set(),
      [],
      '2026-10-28',
    );
    expect(first.map((e) => e.promise.source.page)).toEqual([2, 5]);
    expect(first.map((e) => e.promise.id)).toEqual([
      'val2022-l-skolplikt-forlangd',
      'val2022-l-skolplikt-forlangd-2',
    ]);
    const second = addRawCandidates(
      [raw({ page: 5, slug: 'ny' })],
      srcL,
      new Set(),
      first,
      '2026-10-28',
    );
    expect(second.map((e) => e.promise.id)).toEqual([
      'val2022-l-skolplikt-forlangd',
      'val2022-l-ny',
    ]);
  });

  it('avoids ids of existing promise files', () => {
    const out = addRawCandidates(
      [raw()],
      srcL,
      new Set(['val2022-l-skolplikt-forlangd']),
      [],
      '2026-10-28',
    );
    expect(out[0].promise.id).toBe('val2022-l-skolplikt-forlangd-2');
  });

  it('throws on a malformed raw candidate', () => {
    expect(() => addRawCandidates([{ title: 'x' }], srcL, new Set(), [], '2026-10-28')).toThrow(
      /raw candidate \[0\]/,
    );
  });
});

describe('quoteMatches', () => {
  const page =
    'Skolplikten ska\nförlängas till 18 år.\nVi vill ha låg-\nstadiet i fokus och el-\nbilar.';
  it('matches verbatim and across whitespace', () => {
    expect(quoteMatches(page, 'Skolplikten ska förlängas')).toBe(true);
  });
  it('matches through line-break hyphenation and real hyphens', () => {
    expect(quoteMatches(page, 'ha lågstadiet i fokus')).toBe(true);
    expect(quoteMatches(page, 'el-bilar')).toBe(true);
  });
  it('normalises curly quotes and dashes', () => {
    expect(quoteMatches('Han sa “ja” – tydligt', 'Han sa "ja" - tydligt')).toBe(true);
  });
  it('rejects a mismatch and an empty quote', () => {
    expect(quoteMatches(page, 'Skolplikten ska avskaffas')).toBe(false);
    expect(quoteMatches(page, '  ')).toBe(false);
  });
});

describe('quoteMatchKind', () => {
  it('reports exact for the strict match and loose only for the fallback', () => {
    expect(quoteMatchKind('Skolplikten ska förlängas', 'Skolplikten ska förlängas')).toBe('exact');
    expect(quoteMatchKind('Skolplikten ska förlängas', 'Skol plikten ska för längas')).toBe(
      'loose',
    );
    expect(quoteMatchKind('abc', 'xyz')).toBe('none');
  });
});

describe('splitPages', () => {
  it('splits on form feeds and drops the trailing empty page', () => {
    expect(splitPages('a\fb\f')).toEqual(['a', 'b']);
  });
});

describe('validateCandidates', () => {
  const entry = (r = raw(), taken = new Set<string>()) =>
    toManifestoEntry(r, srcL, taken, '2026-10-28');
  const ctx = {
    sourceId: srcL.id,
    existingIds: new Set<string>(),
    tidoIds: new Set(['tido-a']),
    pages: ['omslag', 'Skolplikten ska förlängas till 18 år.'],
    prefix: 'val2022-l',
  };

  it('accepts a good file and counts links', () => {
    const linked = {
      ...entry(),
      link: { promises: ['tido-a'], outcome: 'included', note: null, rationale: 'r' },
    };
    const r = validateCandidates([linked], ctx);
    expect(r.errors).toEqual([]);
    expect(r).toMatchObject({ count: 1, linked: 1 });
  });

  it('flags a bad quote', () => {
    const r = validateCandidates([entry(raw({ quote: 'Något helt annat' }))], ctx);
    expect(r.errors.join()).toMatch(/not a verbatim substring of page 2/);
  });

  it('warns, not errors, on a loose-only quote match', () => {
    const r = validateCandidates([entry(raw({ quote: 'Skol plikten ska förlängas' }))], ctx);
    expect(r.errors).toEqual([]);
    expect(r.warnings.join()).toMatch(/ignoring spaces and hyphens/);
  });

  it('flags a page beyond the text', () => {
    const r = validateCandidates([entry(raw({ page: 9 }))], ctx);
    expect(r.errors.join()).toMatch(/beyond/);
  });

  it('flags duplicate ids and collisions with existing promise files', () => {
    const e = entry();
    expect(validateCandidates([e, e], ctx).errors.join()).toMatch(/duplicate id/);
    const r = validateCandidates([e], { ...ctx, existingIds: new Set([e.promise.id]) });
    expect(r.errors.join()).toMatch(/collides/);
  });

  it('flags dangling link ids', () => {
    const e = {
      ...entry(),
      link: { promises: ['tido-zzz'], outcome: 'included', note: null, rationale: '' },
    };
    expect(validateCandidates([e], ctx).errors.join()).toMatch(/"tido-zzz" not found/);
  });

  it('flags an unknown outcome label', () => {
    const e = {
      ...entry(),
      link: { promises: ['tido-a'], outcome: 'dropped', note: null, rationale: '' },
    };
    expect(validateCandidates([e], ctx).errors.join()).toMatch(/link\.outcome/);
  });

  it('requires not_addressed exactly when promises is empty', () => {
    const link = (promises: string[], outcome: string) => ({
      ...entry(),
      link: { promises, outcome, note: null, rationale: '' },
    });
    expect(validateCandidates([link([], 'not_addressed')], ctx).errors).toEqual([]);
    expect(validateCandidates([link(['tido-a'], 'not_addressed')], ctx).errors.join()).toMatch(
      /must have an empty promises list/,
    );
    expect(validateCandidates([link([], 'weakened')], ctx).errors.join()).toMatch(
      /needs at least one linked promise/,
    );
    expect(validateCandidates([link(['tido-a', 'tido-a'], 'included')], ctx).errors.join()).toMatch(
      /duplicates/,
    );
  });

  it('flags schema errors, wrong source id and wrong prefix', () => {
    const bad = { section: 's', promise: { id: 'Not A Slug' } };
    expect(validateCandidates([bad], ctx).errors[0]).toMatch(/schema/);
    const r = validateCandidates([entry()], { ...ctx, sourceId: 'other', prefix: 'val2022-m' });
    expect(r.errors.join()).toMatch(/expected "other"/);
    expect(r.errors.join()).toMatch(/must start with/);
  });

  it('skips the quote check without page text', () => {
    const r = validateCandidates([entry(raw({ quote: 'nonsense' }))], { ...ctx, pages: null });
    expect(r.errors).toEqual([]);
    expect(r.warnings.length).toBe(1);
  });
});

describe('EXTRACTION_RULES', () => {
  it('mentions the manifesto-specific rules', () => {
    expect(EXTRACTION_RULES).toMatch(/value statements/);
    expect(EXTRACTION_RULES).toMatch(/"section"/);
  });
});

describe('validate-manifesto-candidates CLI', () => {
  let dir = '';
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function setup(quote: string): string[] {
    dir = mkdtempSync(join(tmpdir(), 'manifesto-'));
    const term = join(dir, '2022-2026');
    mkdirSync(join(term, 'candidates'), { recursive: true });
    mkdirSync(join(term, 'promises'));
    mkdirSync(join(dir, 'sources'));
    writeFileSync(
      join(dir, 'sources', 'valmanifest-2022-l.json'),
      JSON.stringify({
        ...srcL,
        title: 'Fixture',
        kind: 'manifesto',
        url: 'https://example.com/a.pdf',
        archive: 'https://web.archive.org/a.pdf',
      }),
    );
    const tido = toManifestoEntry(raw(), { ...srcL, id: 'tidoavtalet' }, new Set(), '2026-10-28');
    tido.promise.id = 'tido-a';
    writeFileSync(join(term, 'candidates', 'tidoavtalet.json'), JSON.stringify([tido]));
    writeFileSync(
      join(term, 'candidates', 'valmanifest-2022-l.json'),
      JSON.stringify([toManifestoEntry(raw({ quote }), srcL, new Set(), '2026-10-28')]),
    );
    writeFileSync(join(dir, 'pages.txt'), 'omslag\fSkolplikten ska förlängas till 18 år.\f');
    return [
      '--experimental-strip-types',
      join(import.meta.dirname, '..', 'validate-manifesto-candidates.ts'),
      '--source',
      'valmanifest-2022-l',
      '--data-dir',
      dir,
      '--pages-text',
      join(dir, 'pages.txt'),
    ];
  }

  it('exits 0 on a good fixture', () => {
    const out = execFileSync('node', setup('Skolplikten ska förlängas'), { encoding: 'utf8' });
    expect(out).toMatch(/1 candidates, 0 with links, 0 errors/);
  });

  it('exits non-zero on a bad quote', () => {
    expect(() =>
      execFileSync('node', setup('Skolplikten ska avskaffas'), { stdio: 'pipe' }),
    ).toThrow();
  });

  it('does not need Tidö candidates when no entry has a link', () => {
    const args = setup('Skolplikten ska förlängas');
    rmSync(join(dir, '2022-2026', 'candidates', 'tidoavtalet.json'));
    const out = execFileSync('node', args, { encoding: 'utf8' });
    expect(out).toMatch(/0 errors/);
  });

  it('gives a clean error for an invalid source file', () => {
    const args = setup('Skolplikten ska förlängas');
    writeFileSync(join(dir, 'sources', 'valmanifest-2022-l.json'), '{"id":"x"}');
    try {
      execFileSync('node', args, { stdio: 'pipe' });
      expect.unreachable();
    } catch (err) {
      const stderr = String((err as { stderr?: unknown }).stderr);
      expect(stderr).toMatch(/Error: invalid source file/);
      expect(stderr).not.toMatch(/ZodError/);
    }
  });
});

describe('add-manifesto-candidates CLI', () => {
  let dir = '';
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('writes a valid candidate file that the validator accepts', () => {
    dir = mkdtempSync(join(tmpdir(), 'manifesto-add-'));
    mkdirSync(join(dir, 'sources'));
    mkdirSync(join(dir, '2022-2026', 'candidates'), { recursive: true });
    writeFileSync(
      join(dir, 'sources', 'valmanifest-2022-l.json'),
      JSON.stringify({
        ...srcL,
        title: 'Fixture',
        url: 'https://example.com/a.pdf',
        archive: 'https://web.archive.org/a.pdf',
      }),
    );
    writeFileSync(join(dir, 'raw.json'), JSON.stringify([raw()]));
    writeFileSync(join(dir, 'pages.txt'), 'omslag\fSkolplikten ska förlängas till 18 år.\f');
    const tools = join(import.meta.dirname, '..');
    const out = execFileSync(
      'node',
      [
        '--experimental-strip-types',
        join(tools, 'add-manifesto-candidates.ts'),
        '--source',
        'valmanifest-2022-l',
        '--input',
        join(dir, 'raw.json'),
        '--date',
        '2026-10-28',
        '--data-dir',
        dir,
      ],
      { encoding: 'utf8' },
    );
    expect(out).toMatch(/wrote 1 candidates/);
    const validated = execFileSync(
      'node',
      [
        '--experimental-strip-types',
        join(tools, 'validate-manifesto-candidates.ts'),
        '--source',
        'valmanifest-2022-l',
        '--data-dir',
        dir,
        '--pages-text',
        join(dir, 'pages.txt'),
      ],
      { encoding: 'utf8' },
    );
    expect(validated).toMatch(/1 candidates, 0 with links, 0 errors/);
  });
});
