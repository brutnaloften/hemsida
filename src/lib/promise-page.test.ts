import { describe, expect, it } from 'vitest';
import type { Evidence, Source } from '@/schema/promise';
import { buildReverseIndex } from '@/lib/agreement-index';
import {
  buildTimelineSteps,
  historyUrl,
  relatedFromOtherParties,
  suggestSourceUrl,
  voteRows,
} from '@/lib/promise-page';

const manifesto: Source = {
  id: 'm-2022',
  title: 'Valmanifest 2022',
  kind: 'manifesto',
  parties: ['M'],
  date: '2022-08-01',
  url: 'https://example.com/a',
  archive: 'https://example.com/b',
};
const doc = (
  kind: 'dir' | 'sou' | 'ds' | 'prop' | 'bet' | 'sfs' | 'mot',
  date: string,
): Evidence => ({
  kind,
  dok_id: `${kind}-${date}`,
  designation: kind,
  title: kind,
  date,
  url: 'https://example.com',
  relevance: 'full',
  note: null,
});
const agreement: Evidence = {
  kind: 'agreement',
  source: 'tidoavtalet',
  date: '2022-10-14',
  promises: ['tido-x'],
  outcome: 'included',
  note: null,
};
const budget: Evidence = {
  kind: 'budget',
  anslag: { kod: '1234567', namn: 'X', release: 2025 },
  years: { from: 2022, to: 2025 },
  amounts: { before: 1, after: 2 },
  date: '2024-09-20',
  relevance: 'full',
  note: null,
};
const types = (evidence: Evidence[], source: Source | undefined = manifesto) =>
  buildTimelineSteps({ source: { id: 'm-2022' }, evidence }, source).map((s) =>
    s.type === 'missing' || s.type === 'document' ? `${s.type}:${s.stage}` : s.type,
  );

describe('buildTimelineSteps', () => {
  it('shows the promise and a dashed step per pipeline stage when there is no evidence', () => {
    expect(types([])).toEqual([
      'promise',
      'missing:dir',
      'missing:utredning',
      'missing:prop',
      'missing:bet',
      'missing:sfs',
    ]);
  });

  it('has no agreement step without agreement evidence', () => {
    expect(types([])).not.toContain('agreement');
  });

  it('adds the agreement step only', () => {
    expect(types([agreement]).slice(0, 3)).toEqual(['promise', 'agreement', 'missing:dir']);
  });

  it('orders a full chain by stage and treats sou/ds as one stage', () => {
    const out = types([
      doc('sfs', '2024-06-01'),
      doc('prop', '2023-03-01'),
      doc('ds', '2022-12-01'),
      doc('bet', '2023-05-01'),
      doc('dir', '2022-11-01'),
      agreement,
    ]);
    expect(out).toEqual([
      'promise',
      'agreement',
      'document:dir',
      'document:utredning',
      'document:prop',
      'document:bet',
      'document:sfs',
    ]);
  });

  it('keeps documents of one stage by date and puts motions and budget last by date', () => {
    const out = buildTimelineSteps(
      {
        source: { id: 'm-2022' },
        evidence: [
          budget,
          doc('mot', '2023-01-01'),
          doc('prop', '2024-01-01'),
          doc('prop', '2023-01-01'),
        ],
      },
      manifesto,
    );
    const dated = out.flatMap((s) =>
      s.type === 'document' || s.type === 'budget' ? [s.evidence.date] : [],
    );
    expect(dated).toEqual(['2023-01-01', '2024-01-01', '2023-01-01', '2024-09-20']);
    expect(out.at(-1)?.type).toBe('budget');
  });

  it('labels the first step by source kind, and survives a missing source', () => {
    const tido: Source = { ...manifesto, kind: 'government_agreement', shortTitle: 'Tidöavtalet' };
    const first = (s: Source | undefined) =>
      buildTimelineSteps({ source: { id: 'x', page: 3 }, evidence: [] }, s)[0];
    expect(first(manifesto)).toMatchObject({ label: 'Vallöfte', date: '2022-08-01', page: 3 });
    expect(first(tido)).toMatchObject({ label: 'Utfäst i Tidöavtalet' });
    expect(first(undefined)).toMatchObject({ label: 'Utfäst', date: undefined });
  });
});

describe('suggestSourceUrl and historyUrl', () => {
  it('prefills an issue and encodes a long title', () => {
    const url = new URL(suggestSourceUrl({ id: 'm-x', title: 'Ett mycket långt löfte & mer?' }));
    expect(url.pathname).toBe('/brutnaloften/hemsida/issues/new');
    expect(url.searchParams.get('title')).toContain('Ett mycket långt löfte & mer?');
    expect(url.searchParams.get('body')).toContain('m-x');
  });
  it('links the promise file history when the term is known', () => {
    expect(historyUrl('2022-2026', 'm-x')).toMatch(/src\/data\/2022-2026\/promises\/m-x\.json$/);
    expect(historyUrl(undefined, 'm-x')).toBeUndefined();
  });
});

describe('relatedFromOtherParties', () => {
  const mk = (id: string, parties: string[], evidence: Evidence[] = []) => ({
    id,
    title: id,
    parties,
    evidence,
  });
  const m = mk('m-a', ['M'], [agreement]);
  const kd = mk('kd-a', ['KD'], [agreement]);
  const m2 = mk('m-b', ['M'], [agreement]);
  const reverse = new Map([['tido-x', [m, kd, m2]]]);
  it('finds other parties promises linked to the same agreement point', () => {
    expect(relatedFromOtherParties(m, reverse).map((p) => p.id)).toEqual(['kd-a']);
  });
  it('is empty without agreement links or other parties', () => {
    expect(relatedFromOtherParties(mk('s', ['S']), reverse)).toEqual([]);
    expect(relatedFromOtherParties(m, new Map([['tido-x', [m, m2]]]))).toEqual([]);
  });
});

describe('basedOn via buildReverseIndex', () => {
  it('lists the manifesto promises behind an agreement point, and nothing for a manifesto promise', () => {
    const point = { id: 'tido-x', title: 'T', parties: ['M'], evidence: [] };
    const m = { id: 'm-a', title: 'A', parties: ['M'], evidence: [agreement] };
    const index = buildReverseIndex([point, m]);
    expect(index.get('tido-x')?.map((p) => p.id)).toEqual(['m-a']);
    expect(index.get('m-a')).toBeUndefined();
  });
});

describe('voteRows', () => {
  it('lists recorded parties in party order with Swedish labels', () => {
    expect(voteRows({ V: 'no', S: 'abstain' })).toEqual([
      { party: 'S', vote: 'abstain', label: 'Avstår' },
      { party: 'V', vote: 'no', label: 'Nej' },
    ]);
    expect(voteRows({})).toEqual([]);
  });
});
