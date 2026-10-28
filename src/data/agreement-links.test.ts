import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promiseSchema, sourceSchema } from '@/schema/promise';

const dataRoot = fileURLToPath(new URL('.', import.meta.url));

/**
 * Dangling references in agreement evidence: linked promise ids that are not promise files in
 * the same term, and agreement sources that are not a government_agreement source file.
 */
function agreementLinkProblems(
  promises: ReturnType<typeof promiseSchema.parse>[],
  sourceKinds: Map<string, string>,
): string[] {
  const idsByTerm = new Map<string, Set<string>>();
  for (const p of promises) {
    if (!idsByTerm.has(p.term)) idsByTerm.set(p.term, new Set());
    idsByTerm.get(p.term)!.add(p.id);
  }
  const promiseById = new Map(promises.map((p) => [p.id, p]));
  const problems: string[] = [];
  for (const p of promises) {
    for (const e of p.evidence) {
      if (e.kind !== 'agreement') continue;
      if (new Set(e.promises).size !== e.promises.length) {
        problems.push(`${p.id}: duplicate linked ids in agreement entry for ${e.source}`);
      }
      for (const id of e.promises) {
        if (id === p.id) problems.push(`${p.id}: agreement entry links to itself`);
        const target = promiseById.get(id);
        if (target && target.term === p.term && target.source.id !== e.source) {
          problems.push(
            `${p.id}: linked promise ${id} has source ${target.source.id}, not ${e.source}`,
          );
        }
        if (!idsByTerm.get(p.term)?.has(id)) {
          problems.push(`${p.id}: linked promise ${id} not found in term ${p.term}`);
        }
      }
      const kind = sourceKinds.get(e.source);
      if (kind !== 'government_agreement') {
        problems.push(
          kind === undefined
            ? `${p.id}: agreement source ${e.source} has no file in src/data/sources`
            : `${p.id}: agreement source ${e.source} is kind ${kind}, not government_agreement`,
        );
      }
    }
  }
  return problems;
}

function loadPromises() {
  return readdirSync(dataRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(`${dataRoot}/${d.name}/promises`))
    .flatMap((d) =>
      readdirSync(`${dataRoot}/${d.name}/promises`)
        .filter((f) => f.endsWith('.json'))
        .map((f) =>
          promiseSchema.parse(
            JSON.parse(readFileSync(`${dataRoot}/${d.name}/promises/${f}`, 'utf-8')),
          ),
        ),
    );
}

function loadSourceKinds(): Map<string, string> {
  const dir = `${dataRoot}/sources`;
  const kinds = new Map<string, string>();
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const s = sourceSchema.parse(JSON.parse(readFileSync(`${dir}/${f}`, 'utf-8')));
    kinds.set(s.id, s.kind);
  }
  return kinds;
}

const base = {
  term: '2022-2026',
  title: 'T',
  description: 'D',
  source: { id: 'valmanifest-2022-l' },
  parties: ['L'],
  roles: { L: 'government' },
  type: 'legislative',
  area: 'A',
  verdict: { value: 'unassessed', date: '2022-10-14' },
};
const manifesto = (agreementSource: string, linked: string | string[], id = 'val2022-l-x') =>
  promiseSchema.parse({
    ...base,
    id,
    evidence: [
      {
        kind: 'agreement',
        source: agreementSource,
        date: '2022-10-14',
        promises: Array.isArray(linked) ? linked : [linked],
        outcome: 'included',
      },
    ],
  });
const tido = promiseSchema.parse({ ...base, id: 'tido-x', source: { id: 'tidoavtalet' } });

describe('agreement link check', () => {
  const kinds = new Map([
    ['tidoavtalet', 'government_agreement'],
    ['valmanifest-2022-l', 'manifesto'],
  ]);

  it('passes for resolvable ids and a government_agreement source', () => {
    expect(agreementLinkProblems([manifesto('tidoavtalet', 'tido-x'), tido], kinds)).toEqual([]);
  });

  it('flags a dangling Tidö id', () => {
    const problems = agreementLinkProblems([manifesto('tidoavtalet', 'tido-missing'), tido], kinds);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('tido-missing');
  });

  it('flags a linked promise from a different source', () => {
    const other = promiseSchema.parse({ ...base, id: 'other-x', source: { id: 'annat' } });
    const problems = agreementLinkProblems([manifesto('tidoavtalet', 'other-x'), other], kinds);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('not tidoavtalet');
  });

  it('flags self-links and duplicate ids', () => {
    const self = agreementLinkProblems([manifesto('tidoavtalet', 'val2022-l-x'), tido], kinds);
    expect(self.some((p) => p.includes('itself'))).toBe(true);
    const dup = agreementLinkProblems(
      [manifesto('tidoavtalet', ['tido-x', 'tido-x']), tido],
      kinds,
    );
    expect(dup.some((p) => p.includes('duplicate'))).toBe(true);
  });

  it('flags a missing source file and a source of the wrong kind', () => {
    const kindProblems = (src: string) =>
      agreementLinkProblems([manifesto(src, 'tido-x'), tido], kinds).filter((p) =>
        p.includes('agreement source'),
      );
    expect(kindProblems('nope')).toHaveLength(1);
    expect(kindProblems('valmanifest-2022-l')).toHaveLength(1);
  });
});

describe('agreement links in the data', () => {
  it('all resolve', () => {
    expect(agreementLinkProblems(loadPromises(), loadSourceKinds())).toEqual([]);
  });
});
