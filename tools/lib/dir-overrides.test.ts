/**
 * Offline check of tools/dir-overrides.json: no network, no tools/out cache, no model. Every entry
 * must name a real inquiry promise with a dir evidence entry for that designation, and the
 * promise's verdict must be what the inquiry rule gives with the override (docs/data-model.md,
 * "Inquiry promises"): fulfilled when a confirmed directive is a match, otherwise
 * partially_fulfilled when one is partial.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dirOverridesSchema, findDirOverride } from './dir-overrides.ts';
import { reasoningProblems } from './write-reasoning.ts';
import { promiseSchema } from './schema.ts';
import type { JudgedPair, StoreDocument } from './apply-links.ts';
import { applyLinks, withDirOverrides } from './apply-links.ts';

const root = join(import.meta.dirname, '..', '..');
const overrides = dirOverridesSchema.parse(
  JSON.parse(readFileSync(join(root, 'tools', 'dir-overrides.json'), 'utf8')),
);
const loadPromise = (id: string) => {
  const file = join(root, 'src', 'data', '2022-2026', 'promises', `${id}.json`);
  return existsSync(file) ? promiseSchema.parse(JSON.parse(readFileSync(file, 'utf8'))) : null;
};

describe('tools/dir-overrides.json', () => {
  it('has no duplicate promise + directive entries', () => {
    const keys = overrides.map((o) => `${o.promise_id}::${o.designation}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  for (const o of overrides) {
    describe(`${o.promise_id} / ${o.designation}`, () => {
      const promise = loadPromise(o.promise_id);

      it('names an existing inquiry promise with that directive as evidence', () => {
        expect(promise).not.toBeNull();
        expect(promise!.type).toBe('inquiry');
        const dir = promise!.evidence.find(
          (e) => e.kind === 'dir' && e.designation === o.designation,
        );
        expect(dir).toBeDefined();
        // The entry's relevance is what the evidence entry shows.
        expect((dir as { relevance: string }).relevance).toBe(
          o.relevance === 'match' ? 'full' : 'partial',
        );
      });

      it('has a reason', () => {
        expect(o.reason.trim().length).toBeGreaterThan(20);
      });

      it('matches the verdict the inquiry rule gives', () => {
        const confirmed = overrides.filter((x) => x.promise_id === o.promise_id);
        const expected = confirmed.some((x) => x.relevance === 'match')
          ? 'fulfilled'
          : 'partially_fulfilled';
        expect(promise!.verdict.value).toBe(expected);
        expect(promise!.verdict.assessedBy).toBe('ai');
        expect(reasoningProblems(promise!.verdict.reasoning, [], false, undefined, true)).toEqual(
          [],
        );
      });
    });
  }
});

describe('dir overrides in applyLinks', () => {
  const dir = {
    dok_id: 'D1',
    doktyp: 'dir',
    rm: '2023',
    beteckning: '98',
    titel: 'Utredning',
    datum: '2023-06-22',
    url: 'https://data.riksdagen.se/dokument/D1.html',
    text: '',
  } as StoreDocument;
  const docs = new Map([['D1', dir]]);
  const base = promiseSchema.parse({
    ...loadPromise('tido-utredning-kommunala-lakare')!,
    id: 'tido-x',
    evidence: [],
    verdict: { value: 'unassessed', reasoning: '', date: '2022-10-14', history: [] },
  });
  const medium = (label: JudgedPair['label']): JudgedPair => ({
    promise_id: 'tido-x',
    document_id: 'D1',
    label,
    stage: 'preparatory',
    confidence: 'medium',
    proposed: true,
  });
  const entry = (relevance: 'match' | 'partial') => ({
    promise_id: 'tido-x',
    designation: 'Dir. 2023:98',
    relevance,
    reason: 'Read by hand against the directive text.',
    date: '2026-11-25',
  });
  const run = (o: ReturnType<typeof entry>, label: JudgedPair['label']) =>
    applyLinks(base, [medium(label)], docs, '2026-11-25', new Map(), undefined, new Set(), [o]);

  it('a medium directive judgement keeps the promise in_progress without an override', () => {
    const r = applyLinks(base, [medium('match')], docs, '2026-11-25');
    expect(r!.verdict.value).toBe('in_progress');
  });

  it('a confirmed match gives fulfilled and a confirmed partial gives partially_fulfilled', () => {
    expect(run(entry('match'), 'partial')!.verdict.value).toBe('fulfilled');
    expect(run(entry('partial'), 'match')!.verdict.value).toBe('partially_fulfilled');
    expect((run(entry('partial'), 'match')!.evidence[0] as { relevance: string }).relevance).toBe(
      'partial',
    );
  });

  it('only touches the named promise and directive, and only inquiry promises', () => {
    const other = { ...base, id: 'tido-y' };
    expect(findDirOverride([entry('match')], 'tido-y', 'Dir. 2023:98')).toBeUndefined();
    expect(withDirOverrides(other, [medium('match')], docs, [entry('match')])[0]!.confidence).toBe(
      'medium',
    );
    const legislative = { ...base, type: 'legislative' as const };
    expect(
      withDirOverrides(legislative, [medium('match')], docs, [entry('match')])[0]!.confidence,
    ).toBe('medium');
  });
});
