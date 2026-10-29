import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promiseSchema } from '@/schema/promise';
import { anslagByKod, meta } from '@/lib/budget/data';

const dataRoot = fileURLToPath(new URL('.', import.meta.url));

/**
 * Budget evidence references an anslag by its restated code, which is only unique within one
 * release of the ESV data. A reference is valid when the code exists in the committed data, the
 * name matches and the entry names that release.
 */
function budgetRefProblems(promises: ReturnType<typeof promiseSchema.parse>[]): string[] {
  const release = meta.years[meta.years.length - 1];
  const problems: string[] = [];
  for (const p of promises) {
    for (const e of p.evidence) {
      if (e.kind !== 'budget') continue;
      const a = anslagByKod(e.anslag.kod);
      if (e.anslag.release !== release) {
        problems.push(
          `${p.id}: budget entry refers to release ${e.anslag.release}, not ${release}`,
        );
      } else if (!a) {
        problems.push(`${p.id}: anslag ${e.anslag.kod} not found in src/data/budget`);
      } else if (a.namn !== e.anslag.namn) {
        problems.push(
          `${p.id}: anslag ${e.anslag.kod} is named "${a.namn}", not "${e.anslag.namn}"`,
        );
      }
      if (e.years.from < meta.years[0] || e.years.to > release) {
        problems.push(`${p.id}: budget years outside the data range`);
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

const sample = meta.years.length > 0 ? anslagByKod('0901011') : undefined;
const entry = (kod: string, namn: string, release: number) =>
  promiseSchema.parse({
    id: 'x',
    term: '2022-2026',
    title: 'T',
    description: 'D',
    source: { id: 's' },
    parties: ['M'],
    roles: {},
    type: 'budget',
    area: 'A',
    verdict: { value: 'unassessed', date: '2025-01-01' },
    evidence: [
      {
        kind: 'budget',
        anslag: { kod, namn, release },
        years: { from: 2022, to: 2025 },
        amounts: { before: 1, after: 2 },
        date: '2025-09-22',
        relevance: 'full',
      },
    ],
  });

describe('budget reference check', () => {
  const release = meta.years[meta.years.length - 1];

  it('passes for an existing code with matching name', () => {
    expect(sample).toBeDefined();
    expect(budgetRefProblems([entry(sample!.kod, sample!.namn, release)])).toEqual([]);
  });

  it('flags unknown codes, renamed anslag and a wrong release', () => {
    expect(budgetRefProblems([entry('9999999', 'Finns inte', release)])).toHaveLength(1);
    expect(budgetRefProblems([entry(sample!.kod, 'Annat namn', release)])).toHaveLength(1);
    expect(budgetRefProblems([entry(sample!.kod, sample!.namn, release - 1)])).toHaveLength(1);
  });
});

describe('budget references in the data', () => {
  it('all resolve', () => {
    expect(budgetRefProblems(loadPromises())).toEqual([]);
  });
});
