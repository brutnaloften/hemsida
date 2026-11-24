import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promiseSchema, statisticSeriesSchema, type StatisticSeries } from '@/schema/promise';
import { statisticRefProblems } from '@/lib/statistic-evidence';

const dataRoot = fileURLToPath(new URL('.', import.meta.url));

const terms = readdirSync(dataRoot, { withFileTypes: true }).filter((d) => d.isDirectory());

function jsonFiles(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
}

const seriesByTerm = new Map<string, Map<string, StatisticSeries>>();
const seriesFiles: { term: string; file: string; raw: unknown }[] = [];
for (const t of terms) {
  const dir = `${dataRoot}/${t.name}/statistics`;
  for (const file of jsonFiles(dir)) {
    seriesFiles.push({
      term: t.name,
      file,
      raw: JSON.parse(readFileSync(`${dir}/${file}`, 'utf-8')),
    });
  }
}

for (const { term, raw } of seriesFiles) {
  const parsed = statisticSeriesSchema.safeParse(raw);
  if (!parsed.success) continue; // reported by the test below
  const map = seriesByTerm.get(term) ?? new Map<string, StatisticSeries>();
  map.set(parsed.data.id, parsed.data);
  seriesByTerm.set(term, map);
}

describe('series files', () => {
  it('validate and are named after their id', () => {
    for (const { term, file, raw } of seriesFiles) {
      const s = statisticSeriesSchema.parse(raw);
      expect(file, `${term}/${file}`).toBe(`${s.id}.json`);
    }
  });
});

describe('statistic evidence references', () => {
  it('every statistic entry resolves to a series with matching values', () => {
    const promises = terms.flatMap((t) =>
      jsonFiles(`${dataRoot}/${t.name}/promises`).map((f) =>
        promiseSchema.parse(
          JSON.parse(readFileSync(`${dataRoot}/${t.name}/promises/${f}`, 'utf-8')),
        ),
      ),
    );
    expect(statisticRefProblems(promises, seriesByTerm)).toEqual([]);
  });
});
