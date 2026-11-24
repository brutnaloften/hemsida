import type { Evidence, PromiseRecord, StatisticSeries, StatisticEvidence } from '@/schema/promise';

const num = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 });

/**
 * Checks every statistic evidence entry against the series files of the same term: the series
 * exists, both periods exist and carry the stated values, and an entry on a price series carries
 * an inflation note. `seriesByTerm` maps term -> series id -> series.
 */
export function statisticRefProblems(
  promises: readonly Pick<PromiseRecord, 'id' | 'term' | 'evidence'>[],
  seriesByTerm: ReadonlyMap<string, ReadonlyMap<string, StatisticSeries>>,
): string[] {
  const problems: string[] = [];
  for (const p of promises) {
    for (const e of p.evidence) {
      if (e.kind !== 'statistic') continue;
      const s = seriesByTerm.get(p.term)?.get(e.series);
      if (!s) {
        problems.push(`${p.id}: series ${e.series} not found in src/data/${p.term}/statistics`);
        continue;
      }
      for (const which of ['baseline', 'latest'] as const) {
        const { period, v } = e[which];
        const actual = s.values[period];
        if (actual === undefined) {
          problems.push(`${p.id}: series ${s.id} has no value for ${which} period ${period}`);
        } else if (actual !== v) {
          problems.push(`${p.id}: ${which} ${period} is ${v}, series ${s.id} says ${actual}`);
        }
      }
      if (s.priceBasis !== undefined && e.inflationNote === undefined) {
        problems.push(
          `${p.id}: series ${s.id} is a price series (${s.priceBasis}); the entry needs an inflationNote`,
        );
      }
    }
  }
  return problems;
}

/** Swedish display strings for a statistic entry; `series` supplies label and unit. */
export function formatStatistic(
  e: StatisticEvidence,
  series: Pick<StatisticSeries, 'label' | 'unit' | 'priceBasis'> | undefined,
): { label: string; baseline: string; latest: string; change: string; target: string | undefined } {
  const unit = series?.unit ?? '';
  const fmt = (v: number) => `${num.format(v)}${unit ? ` ${unit}` : ''}`;
  const diff = Math.round((e.latest.v - e.baseline.v) * 100) / 100;
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : '';
  const basis = series?.priceBasis === 'nominal' ? ', nominellt' : '';
  const t = e.target;
  let target: string | undefined;
  if (t.type === 'direction') target = t.op === 'up' ? 'Löftet pekar uppåt' : 'Löftet pekar nedåt';
  else if (t.type === 'threshold') {
    target = `Löftets nivå: ${t.op === 'gte' ? 'minst' : 'högst'} ${fmt(t.value)}${t.byYear ? ` till ${t.byYear}` : ''}`;
  }
  return {
    label: series?.label ?? e.series,
    baseline: `${e.baseline.period}: ${fmt(e.baseline.v)}`,
    latest: `${e.latest.period}: ${fmt(e.latest.v)}`,
    change: `${sign}${num.format(Math.abs(diff))}${unit ? ` ${unit}` : ''}${basis}`,
    target,
  };
}

export const isStatistic = (e: Evidence): e is StatisticEvidence => e.kind === 'statistic';
