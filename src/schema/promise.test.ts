import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  promiseSchema,
  sourceSchema,
  sourceRefSchema,
  VERDICTS,
  VERDICT_LABELS,
} from '@/schema/promise';

const valid = {
  id: 'tido-skarpta-straff-gangbrott',
  term: '2022-2026',
  title: 'Skärpta straff',
  description: 'Straffen ska skärpas.',
  source: { id: 'tidoavtalet', page: 23 },
  parties: ['M', 'KD', 'L', 'SD'],
  roles: { M: 'government', SD: 'support' },
  type: 'legislative',
  area: 'Kriminalpolitik',
  verdict: {
    value: 'fulfilled',
    reasoning: 'Lagen trädde i kraft.',
    date: '2023-07-01',
    history: [{ value: 'in_progress', reasoning: 'Prop lagd.', date: '2023-03-02' }],
  },
  evidence: [
    {
      kind: 'prop',
      dok_id: 'HA03xxx',
      designation: 'Prop. 2022/23:45',
      title: 'Skärpta straff',
      date: '2023-03-02',
      url: 'https://data.riksdagen.se/dokument/HA03xxx',
      relevance: 'full',
    },
  ],
};

describe('promiseSchema', () => {
  it('accepts a valid promise and applies defaults', () => {
    const p = promiseSchema.parse(valid);
    expect(p.keywords).toEqual([]);
    expect(p.evidence[0]!.note).toBeNull();
  });

  it('rejects unknown verdict values', () => {
    const bad = { ...valid, verdict: { ...valid.verdict, value: 'Uppfyllt' } };
    expect(promiseSchema.safeParse(bad).success).toBe(false);
  });

  it('requires reasoning except for not_started', () => {
    const v = (value: string) => ({
      ...valid,
      verdict: { value, reasoning: '', date: '2023-01-01' },
    });
    expect(promiseSchema.safeParse(v('not_started')).success).toBe(true);
    expect(promiseSchema.safeParse(v('broken')).success).toBe(false);
  });

  it('rejects bad terms, parties and evidence kinds', () => {
    expect(promiseSchema.safeParse({ ...valid, term: '2022' }).success).toBe(false);
    expect(promiseSchema.safeParse({ ...valid, parties: ['X'] }).success).toBe(false);
    const ev = [{ ...valid.evidence[0], kind: 'news' }];
    expect(promiseSchema.safeParse({ ...valid, evidence: ev }).success).toBe(false);
  });

  it('rejects votes on non-bet evidence', () => {
    const votes = { M: 'yes' };
    const bad = { ...valid, evidence: [{ ...valid.evidence[0], votes }] };
    expect(promiseSchema.safeParse(bad).success).toBe(false);
    const ok = { ...valid, evidence: [{ ...valid.evidence[0], kind: 'bet', votes }] };
    expect(promiseSchema.safeParse(ok).success).toBe(true);
  });

  it('rejects roles for parties not in parties', () => {
    expect(promiseSchema.safeParse({ ...valid, parties: ['M'] }).success).toBe(false);
  });

  it('has a Swedish label for every verdict', () => {
    for (const v of VERDICTS) expect(VERDICT_LABELS[v]).toBeTruthy();
  });
});

describe('promise data', () => {
  it('accepts every current data file', () => {
    const dir = fileURLToPath(new URL('../data/2022-2026/promises', import.meta.url));
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const r = promiseSchema.safeParse(JSON.parse(readFileSync(`${dir}/${f}`, 'utf-8')));
      expect(r.success, f).toBe(true);
      if (r.success) expect(`${r.data.id}.json`, f).toBe(f);
    }
  });

  it('references an existing source', () => {
    const dir = fileURLToPath(new URL('../data/2022-2026/promises', import.meta.url));
    const sourceDir = fileURLToPath(new URL('../data/sources', import.meta.url));
    const sourceIds = readdirSync(sourceDir).map((f) => f.replace(/\.json$/, ''));
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const p = promiseSchema.parse(JSON.parse(readFileSync(`${dir}/${f}`, 'utf-8')));
      expect(sourceIds, f).toContain(p.source.id);
    }
  });
});

describe('sources data', () => {
  it('accepts every file in src/data/sources and matches the filename', () => {
    const dir = fileURLToPath(new URL('../data/sources', import.meta.url));
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    expect(files).toContain('tidoavtalet.json');
    for (const f of files) {
      const r = sourceSchema.safeParse(JSON.parse(readFileSync(`${dir}/${f}`, 'utf-8')));
      expect(r.success, f).toBe(true);
      if (r.success) expect(`${r.data.id}.json`).toBe(f);
    }
  });
});

describe('sourceSchema', () => {
  const src = {
    id: 'tidoavtalet',
    title: 'Tidöavtalet',
    kind: 'government_agreement',
    parties: ['M', 'KD', 'L', 'SD'],
    date: '2022-10-14',
    url: 'https://example.com/a.pdf',
    archive: 'https://web.archive.org/web/2022/https://example.com/a.pdf',
  };
  it('accepts a valid source', () => {
    expect(sourceSchema.safeParse(src).success).toBe(true);
  });
  it('rejects bad kind, date and url', () => {
    expect(sourceSchema.safeParse({ ...src, kind: 'news' }).success).toBe(false);
    expect(sourceSchema.safeParse({ ...src, date: '14/10/2022' }).success).toBe(false);
    expect(sourceSchema.safeParse({ ...src, url: 'not a url' }).success).toBe(false);
  });
});

describe('sourceRefSchema', () => {
  it('accepts id with optional page and quote', () => {
    expect(sourceRefSchema.safeParse({ id: 'tidoavtalet' }).success).toBe(true);
    expect(sourceRefSchema.safeParse({ id: 'tidoavtalet', page: 3, quote: 'x' }).success).toBe(
      true,
    );
  });
  it('rejects bad slug and non-positive page', () => {
    expect(sourceRefSchema.safeParse({ id: 'Bad Id' }).success).toBe(false);
    expect(sourceRefSchema.safeParse({ id: 'a', page: 0 }).success).toBe(false);
  });
});
