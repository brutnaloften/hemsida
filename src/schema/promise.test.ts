import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  promiseSchema,
  sourceSchema,
  sourceRefSchema,
  VERDICTS,
  VERDICT_LABELS,
  AGREEMENT_OUTCOMES,
  agreementOutcomeLabel,
  agreementName,
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
    {
      kind: 'sfs',
      dok_id: 'sfs-2023-300',
      designation: 'SFS 2023:300',
      title: 'Lag om skärpta straff',
      date: '2023-06-01',
      url: 'https://data.riksdagen.se/dokument/SFS2023-300',
      relevance: 'full',
    },
  ],
};
const unassessed = { value: 'unassessed', reasoning: '', date: '2023-01-01' };

describe('promiseSchema', () => {
  it('rejects an area outside the controlled vocabulary', () => {
    expect(promiseSchema.safeParse({ ...valid, area: 'Skolpolitik' }).success).toBe(false);
    expect(promiseSchema.safeParse({ ...valid, area: '' }).success).toBe(false);
  });

  it('accepts a valid promise and applies defaults', () => {
    const p = promiseSchema.parse(valid);
    expect(p.keywords).toEqual([]);
    expect(p.evidence[0]!.note).toBeNull();
  });

  it('accepts assessedBy ai or human on a verdict and its history, and rejects other values', () => {
    const verdict = (assessedBy: string) => ({
      ...valid,
      verdict: {
        value: 'in_progress',
        assessedBy,
        reasoning: 'Prop. 1',
        date: '2026-01-01',
        history: [{ value: 'unassessed', assessedBy, reasoning: '', date: '2022-10-14' }],
      },
      evidence: [
        {
          kind: 'prop',
          dok_id: 'X1',
          designation: 'Prop. 1',
          title: 'T',
          date: '2026-01-01',
          url: 'https://data.riksdagen.se/dokument/X1.html',
          relevance: 'full',
        },
      ],
    });
    expect(promiseSchema.safeParse(verdict('ai')).success).toBe(true);
    expect(promiseSchema.safeParse(verdict('human')).success).toBe(true);
    expect(promiseSchema.safeParse(verdict('robot')).success).toBe(false);
  });

  it('rejects unknown verdict values', () => {
    const bad = { ...valid, verdict: { ...valid.verdict, value: 'Uppfyllt' } };
    expect(promiseSchema.safeParse(bad).success).toBe(false);
  });

  it('requires reasoning except for unassessed', () => {
    const v = (value: string) => ({
      ...valid,
      verdict: { value, reasoning: '', date: '2023-01-01' },
    });
    expect(promiseSchema.safeParse(v('unassessed')).success).toBe(true);
    expect(promiseSchema.safeParse(v('not_assessable')).success).toBe(false);
    expect(promiseSchema.safeParse(v('abandoned')).success).toBe(false);
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
    const ok = {
      ...valid,
      verdict: unassessed,
      evidence: [{ ...valid.evidence[0], kind: 'bet', votes }],
    };
    expect(promiseSchema.safeParse(ok).success).toBe(true);
  });

  describe('figures', () => {
    const figure = {
      year: 2026,
      amount: 1000,
      scope: 'kvinnors och flickors hälsa och mödravården',
      tier: 'intention',
      speaker: { role: 'government' },
      quote: 'För 2026 avsätts 1 000 000 000 kronor.',
    };
    const figure2024 = {
      year: 2024,
      amount: 1600,
      scope: 'förlossningsvård och kvinnors hälsa',
      tier: 'intention',
      speaker: { role: 'committee', party: 'M' },
      quote: 'För 2024 avsattes 1 600 000 000 kronor för förlossningsvård och kvinnors hälsa.',
    };
    const withFigures = (kind: string, figures: unknown[]) => ({
      ...valid,
      verdict: unassessed,
      evidence: [{ ...valid.evidence[0], kind, figures }],
    });

    it('accepts figures on bet and prop', () => {
      expect(promiseSchema.safeParse(withFigures('bet', [figure, figure2024])).success).toBe(true);
      expect(promiseSchema.safeParse(withFigures('prop', [figure])).success).toBe(true);
    });

    it('rejects figures on other kinds', () => {
      for (const kind of ['dir', 'sou', 'ds', 'sfs', 'mot']) {
        expect(promiseSchema.safeParse(withFigures(kind, [figure])).success, kind).toBe(false);
      }
    });

    it('rejects a wrong tier, role, unknown field or empty scope', () => {
      for (const bad of [
        { ...figure, tier: 'outcome' },
        { ...figure, speaker: { role: 'opposition' } },
        { ...figure, extra: 1 },
        { ...figure, scope: '' },
      ]) {
        expect(promiseSchema.safeParse(withFigures('bet', [bad])).success).toBe(false);
      }
    });

    it('does not qualify a verdict', () => {
      const inProgress = { value: 'in_progress', reasoning: 'Satsning.', date: '2025-01-01' };
      const betOnly = (figures?: unknown[]) => ({
        ...valid,
        verdict: inProgress,
        evidence: [{ ...valid.evidence[0], kind: 'bet', ...(figures && { figures }) }],
      });
      // in_progress needs a dir/sou/ds/prop entry: a bet fails with or without figures.
      expect(promiseSchema.safeParse(betOnly()).success).toBe(false);
      expect(promiseSchema.safeParse(betOnly([figure])).success).toBe(false);
      // The same promise passes once a prop is linked, so the failure above is about the evidence.
      const withProp = {
        ...betOnly([figure]),
        evidence: [
          { ...valid.evidence[0], kind: 'prop' },
          { ...valid.evidence[0], kind: 'bet', figures: [figure] },
        ],
      };
      expect(promiseSchema.safeParse(withProp).success).toBe(true);
    });
  });

  describe('agreement evidence', () => {
    const agreement = {
      kind: 'agreement',
      source: 'tidoavtalet',
      date: '2022-10-14',
      promises: ['tido-skarpta-straff-gangbrott'],
      outcome: 'included',
    };
    const withEvidence = (...evidence: unknown[]) => ({ ...valid, verdict: unassessed, evidence });

    it('accepts an agreement entry next to Riksdag entries and defaults note', () => {
      const r = promiseSchema.safeParse(withEvidence(agreement, valid.evidence[0]));
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.evidence[0]!.note).toBeNull();
    });

    it('requires an empty promises list for not_addressed', () => {
      const ok = { ...agreement, outcome: 'not_addressed', promises: [] };
      expect(promiseSchema.safeParse(withEvidence(ok)).success).toBe(true);
      const bad = { ...ok, promises: ['tido-skarpta-straff-gangbrott'] };
      expect(promiseSchema.safeParse(withEvidence(bad)).success).toBe(false);
    });

    it('requires a non-empty promises list for every other outcome', () => {
      for (const outcome of AGREEMENT_OUTCOMES.filter((o) => o !== 'not_addressed')) {
        const bad = { ...agreement, outcome, promises: [] };
        expect(promiseSchema.safeParse(withEvidence(bad)).success, outcome).toBe(false);
      }
    });

    it('rejects Riksdag fields mixed into an agreement', () => {
      for (const extra of [{ dok_id: 'H901' }, { votes: { S: 'yes' } }, { url: 'https://x.se' }]) {
        expect(promiseSchema.safeParse(withEvidence({ ...agreement, ...extra })).success).toBe(
          false,
        );
      }
    });

    it('rejects unknown outcomes and a missing source', () => {
      expect(
        promiseSchema.safeParse(withEvidence({ ...agreement, outcome: 'dropped' })).success,
      ).toBe(false);
      const { source: _s, ...noSource } = agreement;
      expect(promiseSchema.safeParse(withEvidence(noSource)).success).toBe(false);
    });

    it('rejects two agreement entries for the same source', () => {
      const bad = withEvidence(agreement, { ...agreement, outcome: 'weakened' });
      expect(promiseSchema.safeParse(bad).success).toBe(false);
      const other = withEvidence(agreement, { ...agreement, source: 'tidoavtalet-2' });
      expect(promiseSchema.safeParse(other).success).toBe(true);
    });

    it('has a Swedish label for every outcome', () => {
      for (const o of AGREEMENT_OUTCOMES) {
        expect(agreementOutcomeLabel(o, { shortTitle: 'Tidöavtalet', title: 'x' })).toBeTruthy();
      }
    });
  });

  describe('budget evidence', () => {
    const budget = {
      kind: 'budget',
      anslag: { kod: '0901011', namn: 'Exempelanslag', release: 2025 },
      years: { from: 2022, to: 2025 },
      amounts: { before: 1000, after: 1500.5 },
      date: '2025-09-22',
      relevance: 'full',
    };
    const withEvidence = (...evidence: unknown[]) => ({ ...valid, verdict: unassessed, evidence });
    const ok = (e: unknown) => promiseSchema.safeParse(withEvidence(e)).success;

    it('accepts a budget entry next to Riksdag entries and defaults note', () => {
      const r = promiseSchema.safeParse(withEvidence(budget, valid.evidence[0]));
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.evidence[0]!.note).toBeNull();
    });

    it('accepts a discontinued anslag code with year suffix', () => {
      expect(ok({ ...budget, anslag: { ...budget.anslag, kod: '0501003 2024' } })).toBe(true);
    });

    it('rejects a malformed anslag code, unordered years and Riksdag fields', () => {
      expect(ok({ ...budget, anslag: { ...budget.anslag, kod: '1:11' } })).toBe(false);
      expect(ok({ ...budget, years: { from: 2025, to: 2022 } })).toBe(false);
      expect(ok({ ...budget, dok_id: 'H901' })).toBe(false);
      expect(ok({ ...budget, amounts: { before: 1 } })).toBe(false);
    });

    it('never qualifies a verdict', () => {
      const fulfilled = { value: 'fulfilled', reasoning: 'Budgeten höjdes.', date: '2025-10-01' };
      const r = promiseSchema.safeParse({ ...valid, verdict: fulfilled, evidence: [budget] });
      expect(r.success).toBe(false);
      const p = { ...valid, verdict: { ...fulfilled, value: 'in_progress' }, evidence: [budget] };
      expect(promiseSchema.safeParse(p).success).toBe(false);
    });
  });

  describe('verdict-evidence constraints', () => {
    const ev = (kind: string, extra: object = {}) => ({
      kind,
      dok_id: kind === 'sfs' ? 'sfs-2023-300' : `D-${kind}`,
      designation: kind === 'sfs' ? 'SFS 2023:300' : `Beteckning ${kind}`,
      title: 'Titel',
      date: '2023-03-02',
      url: 'https://data.riksdagen.se/dokument/x',
      relevance: 'full',
      ...extra,
    });
    const agreement = {
      kind: 'agreement',
      source: 'tidoavtalet',
      date: '2022-10-14',
      promises: ['tido-x'],
      outcome: 'included',
    };
    const make = (value: string, reasoning: string, evidence: unknown[], extra: object = {}) => ({
      ...valid,
      ...extra,
      verdict: { value, reasoning, date: '2024-01-01' },
      evidence,
    });
    const ok = (p: unknown) => promiseSchema.safeParse(p).success;
    const messages = (p: unknown) => {
      const r = promiseSchema.safeParse(p);
      return r.success ? [] : r.error.issues.map((i) => i.message);
    };

    it('needs no evidence for unassessed, not_assessable and the other free verdicts', () => {
      expect(ok(make('unassessed', '', []))).toBe(true);
      expect(ok(make('not_assessable', 'För vagt.', []))).toBe(true);
      for (const v of ['unfulfilled', 'abandoned']) {
        expect(ok(make(v, 'Motivering.', [])), v).toBe(true);
      }
    });

    it.each(['dir', 'sou', 'ds', 'prop'])('in_progress is allowed with %s evidence', (kind) => {
      expect(ok(make('in_progress', 'Pågår.', [ev(kind)]))).toBe(true);
    });

    it('in_progress is rejected without dir/sou/ds/prop evidence', () => {
      expect(ok(make('in_progress', 'Pågår.', []))).toBe(false);
      for (const kind of ['bet', 'sfs', 'mot']) {
        expect(ok(make('in_progress', 'Pågår.', [ev(kind)])), kind).toBe(false);
      }
      expect(messages(make('in_progress', 'Pågår.', []))[0]).toContain('in_progress requires');
    });

    it('accepts relevance contradicts but never counts it toward a verdict', () => {
      const against = (kind: string) => ev(kind, { relevance: 'contradicts' });
      expect(ok(make('unassessed', '', [against('prop')]))).toBe(true);
      // A contradicting prop does not qualify in_progress, a full one next to it does.
      expect(ok(make('in_progress', 'Pågår.', [against('prop')]))).toBe(false);
      expect(
        ok(make('in_progress', 'Pågår.', [against('prop'), { ...ev('sou'), dok_id: 'D2' }])),
      ).toBe(true);
      expect(ok(make('fulfilled', 'Klart.', [against('sfs')]))).toBe(false);
      // Nor does it document a broken promise, even when the reasoning cites it.
      expect(ok(make('broken', 'Beteckning prop motverkar.', [against('prop')]))).toBe(false);
    });

    it('fulfilled needs sfs evidence', () => {
      expect(ok(make('fulfilled', 'Lag i kraft.', [ev('sfs')]))).toBe(true);
      for (const kind of ['dir', 'sou', 'ds', 'prop', 'bet', 'mot']) {
        expect(ok(make('fulfilled', 'Klart.', [ev(kind)])), kind).toBe(false);
      }
      expect(ok(make('fulfilled', 'Klart.', []))).toBe(false);
    });

    it('fulfilled and partially_fulfilled need an sfs entry in force at the verdict date', () => {
      for (const v of ['fulfilled', 'partially_fulfilled']) {
        expect(ok(make(v, 'Lag i kraft.', [ev('sfs', { date: '2024-01-01' })])), v).toBe(true);
        expect(ok(make(v, 'Motivering.', [])), v).toBe(false);
        expect(ok(make(v, 'Motivering.', [ev('prop')])), v).toBe(false);
        // verdict.date is 2024-01-01; a law taking effect later was not in force yet.
        const later = make(v, 'Motivering.', [ev('sfs', { date: '2024-01-02' })]);
        expect(ok(later), v).toBe(false);
        expect(messages(later)[0]).toContain('on or before the verdict date');
        // An earlier in-force law next to a later one is enough.
        const both = [
          ev('sfs', { date: '2024-01-02' }),
          ev('sfs', { dok_id: 'sfs-2022-1', designation: 'SFS 2022:1', date: '2023-01-01' }),
        ];
        expect(ok(make(v, 'Motivering.', both)), v).toBe(true);
      }
    });

    it('does not check history entries against the evidence', () => {
      const p = make('in_progress', 'Pågår.', [ev('prop')]);
      const history = [{ value: 'partially_fulfilled', reasoning: 'Äldre.', date: '2023-01-01' }];
      expect(ok({ ...p, verdict: { ...p.verdict, history } })).toBe(true);
    });

    it('validates the sfs dok_id format and that the designation matches it', () => {
      const good = make('fulfilled', 'Klart.', [ev('sfs')]);
      expect(ok(good)).toBe(true);
      const bad = (extra: object) => make('unassessed', '', [ev('sfs', extra)]);
      expect(ok(bad({ dok_id: 'sfs-2025-625', designation: 'SFS 2025:625' }))).toBe(true);
      expect(ok(bad({ dok_id: 'sfs-2025-625', designation: 'SFS 2025:62' }))).toBe(false);
      expect(ok(bad({ dok_id: 'SFS2025-625', designation: 'SFS 2025:625' }))).toBe(false);
      expect(ok(bad({ dok_id: 'sfs-25-625', designation: 'SFS 25:625' }))).toBe(false);
    });

    it('agreement evidence alone never allows in_progress, fulfilled or broken', () => {
      for (const v of ['in_progress', 'fulfilled', 'broken']) {
        expect(ok(make(v, 'Avtalet säger så.', [agreement])), v).toBe(false);
      }
      expect(ok(make('in_progress', 'Pågår.', [agreement, ev('prop')]))).toBe(true);
      expect(ok(make('fulfilled', 'Klart.', [agreement, ev('sfs')]))).toBe(true);
    });

    it('broken is allowed with a bet that has votes', () => {
      const bet = ev('bet', { votes: { S: 'no', M: 'yes' } });
      expect(ok(make('broken', 'Riksdagen röstade nej.', [bet]))).toBe(true);
    });

    it('broken is allowed when reasoning cites a Riksdag document that reversed it', () => {
      const prop = ev('prop', { designation: 'Prop. 2024/25:10' });
      expect(ok(make('broken', 'Upphävdes genom Prop. 2024/25:10.', [prop]))).toBe(true);
    });

    it('broken is rejected without a vote or a cited document', () => {
      expect(ok(make('broken', 'De gjorde tvärtom.', []))).toBe(false);
      expect(ok(make('broken', 'De gjorde tvärtom.', [ev('bet')]))).toBe(false);
      expect(ok(make('broken', 'De gjorde tvärtom.', [ev('prop')]))).toBe(false);
    });

    describe('no_evidence', () => {
      const withTerms = { committee: 'Justitieutskottet', keywords: ['skärpta straff'] };

      it('accepts reasoning with a date and a searched committee or keyword', () => {
        const r = 'Sökte 2026-10-01 i Justitieutskottet utan träff.';
        expect(ok(make('no_evidence', r, [], withTerms))).toBe(true);
        const k = 'Sökning 2026-10-01 på "Skärpta straff" gav ingen träff.';
        expect(ok(make('no_evidence', k, [], withTerms))).toBe(true);
      });

      it('rejects empty reasoning', () => {
        expect(ok(make('no_evidence', '', [], withTerms))).toBe(false);
      });

      it('rejects reasoning without a date', () => {
        const m = messages(
          make('no_evidence', 'Sökte i Justitieutskottet utan träff.', [], withTerms),
        );
        expect(m.join()).toContain('date of the search');
      });

      it('rejects reasoning that names neither committee nor keyword', () => {
        const m = messages(
          make('no_evidence', 'Sökte 2026-10-01 men hittade inget.', [], withTerms),
        );
        expect(m.join()).toContain('what was searched');
      });

      it('falls back to a minimum length when the promise has no committee or keywords', () => {
        const base = { committee: undefined, keywords: [] };
        expect(ok(make('no_evidence', '2026-10-01 inget.', [], base))).toBe(false);
        const long =
          '2026-10-01: sökte på riksdagen.se efter motioner och propositioner, ingen träff.';
        expect(ok(make('no_evidence', long, [], base))).toBe(true);
      });
    });

    it('does not check history entries', () => {
      const p = make('unassessed', '', [], {});
      p.verdict = {
        ...p.verdict,
        history: [{ value: 'fulfilled', reasoning: 'x', date: '2023-01-01' }],
      } as never;
      expect(ok(p)).toBe(true);
    });
  });

  it('rejects roles for parties not in parties', () => {
    expect(promiseSchema.safeParse({ ...valid, parties: ['M'] }).success).toBe(false);
  });

  it('lists unassessed first, labelled Inte bedömt', () => {
    expect(VERDICTS[0]).toBe('unassessed');
    expect(VERDICT_LABELS.unassessed).toBe('Inte bedömt');
  });

  it('has a Swedish label for every verdict', () => {
    for (const v of VERDICTS) expect(VERDICT_LABELS[v]).toBeTruthy();
  });
});

const dataRoot = fileURLToPath(new URL('../data', import.meta.url));

/** Every promise file in every term folder: src/data/<term>/promises/*.json */
function promiseFiles(): { dir: string; file: string }[] {
  return readdirSync(dataRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(`${dataRoot}/${d.name}/promises`))
    .flatMap((d) => {
      const dir = `${dataRoot}/${d.name}/promises`;
      return readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((file) => ({ dir, file }));
    });
}

describe('promise data', () => {
  it('finds promise files', () => {
    expect(promiseFiles().length).toBeGreaterThan(0);
  });

  it('accepts every current data file in every term folder', () => {
    for (const { dir, file } of promiseFiles()) {
      const r = promiseSchema.safeParse(JSON.parse(readFileSync(`${dir}/${file}`, 'utf-8')));
      expect(r.success, `${dir}/${file}`).toBe(true);
      if (r.success) {
        expect(`${r.data.id}.json`, file).toBe(file);
        expect(dir.endsWith(`/${r.data.term}/promises`), `${file} term matches folder`).toBe(true);
      }
    }
  });

  it('references an existing source', () => {
    const sourceDir = `${dataRoot}/sources`;
    const sourceIds = readdirSync(sourceDir).map((f) => f.replace(/\.json$/, ''));
    for (const { dir, file } of promiseFiles()) {
      const p = promiseSchema.parse(JSON.parse(readFileSync(`${dir}/${file}`, 'utf-8')));
      expect(sourceIds, file).toContain(p.source.id);
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

describe('agreementOutcomeLabel', () => {
  const tido = { shortTitle: 'Tidöavtalet', title: 'Tidöavtalet: Överenskommelse för Sverige' };
  const fictional = { shortTitle: 'Januariavtalet', title: 'Januariöverenskommelsen' };
  it('builds all five outcome labels with the agreement name', () => {
    expect(agreementOutcomeLabel('included', tido)).toBe('Med i Tidöavtalet');
    expect(agreementOutcomeLabel('weakened', tido)).toBe('Urvattnat i Tidöavtalet');
    expect(agreementOutcomeLabel('strengthened', tido)).toBe('Skärpt i Tidöavtalet');
    expect(agreementOutcomeLabel('contradicted', tido)).toBe('Motsägs av Tidöavtalet');
    expect(agreementOutcomeLabel('not_addressed', tido)).toBe('Saknas i Tidöavtalet');
  });
  it('works for another agreement name', () => {
    expect(agreementOutcomeLabel('included', fictional)).toBe('Med i Januariavtalet');
    expect(agreementOutcomeLabel('contradicted', fictional)).toBe('Motsägs av Januariavtalet');
    expect(agreementOutcomeLabel('not_addressed', fictional)).toBe('Saknas i Januariavtalet');
  });
  it('falls back to the long title without a shortTitle', () => {
    expect(agreementName({ title: 'Lång titel' })).toBe('Lång titel');
  });
});

describe('sourceSchema', () => {
  const src = {
    id: 'tidoavtalet',
    title: 'Tidöavtalet: Överenskommelse för Sverige',
    shortTitle: 'Tidöavtalet',
    kind: 'government_agreement',
    parties: ['M', 'KD', 'L', 'SD'],
    date: '2022-10-14',
    url: 'https://example.com/a.pdf',
    archive: 'https://web.archive.org/web/2022/https://example.com/a.pdf',
  };
  it('accepts a valid source', () => {
    expect(sourceSchema.safeParse(src).success).toBe(true);
  });
  it('requires shortTitle for government agreements only', () => {
    const { shortTitle: _omit, ...without } = src;
    expect(sourceSchema.safeParse(without).success).toBe(false);
    expect(sourceSchema.safeParse({ ...without, kind: 'manifesto' }).success).toBe(true);
  });
  it('accepts an optional urlDeadAsOf date and rejects a malformed one', () => {
    expect(sourceSchema.safeParse({ ...src, urlDeadAsOf: '2026-10-28' }).success).toBe(true);
    expect(sourceSchema.safeParse({ ...src, urlDeadAsOf: 'yesterday' }).success).toBe(false);
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
