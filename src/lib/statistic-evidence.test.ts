import { describe, expect, it } from 'vitest';
import {
  isRiksdagEvidence,
  promiseSchema,
  statisticSeriesSchema,
  statisticMoved,
  statisticTargetMet,
  type StatisticSeries,
} from '@/schema/promise';
import { formatStatistic, statisticRefProblems } from '@/lib/statistic-evidence';
import { buildTimelineSteps } from '@/lib/promise-page';

// StatisticSeries fixtures with the values read in docs/outcome-promises.md (probe log).
const seriesFixtures = [
  {
    id: 'scb-undersysselsatta-15-74',
    source: 'scb',
    table: 'TAB2876',
    selection: {
      Arbetskraftsutbud: '3',
      Kon: '1+2',
      Alder: 'tot15-74',
      ContentsCode: 'AM0401UT',
    },
    label: 'Undersysselsatta 15-74 år',
    unit: 'tusen personer',
    frequency: 'year',
    fetched_at: '2026-11-24',
    values: { '2022': 299, '2023': 337.2, '2024': 350.9, '2025': 376.3 },
  },
  {
    id: 'scb-fardigstallda-bostader',
    source: 'scb',
    table: 'TAB4193',
    selection: { Region: 'Riket' },
    label: 'Färdigställda bostäder i nybyggda hus',
    unit: 'bostäder',
    frequency: 'year',
    fetched_at: '2026-11-24',
    values: { '2022': 54018, '2023': 65595, '2024': 45475, '2025': 31359 },
  },
  {
    id: 'scb-installerad-vindkraft',
    source: 'scb',
    table: 'TAB4063',
    selection: { Region: 'Riket', Kraftslag: 'Vind' },
    label: 'Installerad effekt, vindkraft',
    unit: 'MW',
    frequency: 'year',
    fetched_at: '2026-11-24',
    values: { '2022': 14278, '2025': 18127 },
  },
  {
    id: 'scb-drivmedelspris',
    source: 'scb',
    table: 'TAB0000',
    selection: {},
    label: 'Bensinpris',
    unit: 'kr/liter',
    frequency: 'year',
    fetched_at: '2026-11-24',
    priceBasis: 'nominal',
    values: { '2022': 20, '2025': 17 },
  },
].map((s) => statisticSeriesSchema.parse(s));

const seriesByTerm = new Map([
  ['2022-2026', new Map<string, StatisticSeries>(seriesFixtures.map((s) => [s.id, s]))],
]);

const action = {
  kind: 'sfs',
  dok_id: 'sfs-2024-100',
  designation: 'SFS 2024:100',
  title: 'Lag',
  date: '2024-01-01',
  url: 'https://svenskforfattningssamling.se/doc/2024100.html',
  relevance: 'full',
};

const stat = (over: Record<string, unknown> = {}) => ({
  kind: 'statistic',
  series: 'scb-undersysselsatta-15-74',
  baseline: { period: '2022', v: 299 },
  latest: { period: '2025', v: 376.3 },
  target: { type: 'direction', op: 'down' },
  relevance: 'full',
  date: '2026-02-20',
  note: null,
  ...over,
});

const promise = (over: Record<string, unknown> = {}) => ({
  id: 'val2022-m-minska-ofrivilligt-deltidsarbete',
  term: '2022-2026',
  title: 'Minska ofrivilligt deltidsarbete',
  description: 'Ofrivilligt deltidsarbete ska minska.',
  source: { id: 'm-valmanifest-2022' },
  parties: ['M'],
  roles: { M: 'government' },
  type: 'outcome',
  area: 'Arbetsmarknad',
  verdict: { value: 'unassessed', date: '2026-11-24' },
  evidence: [stat()],
  ...over,
});

const verdict = (value: string) => ({
  verdict: { value, reasoning: 'Statistiken visar utfallet, inte orsaken.', date: '2026-11-24' },
});

describe('statistic evidence', () => {
  it('worked example 1: the rise in under-employment validates and stays unassessed', () => {
    const p = promiseSchema.parse(promise());
    expect(statisticRefProblems([p], seriesByTerm)).toEqual([]);
    const e = p.evidence[0];
    if (e?.kind !== 'statistic') throw new Error('expected statistic');
    expect(statisticTargetMet(e)).toBe(false);
    expect(isRiksdagEvidence(e)).toBe(false);
    // the timeline shows the rise
    const step = buildTimelineSteps(p, undefined).find((s) => s.type === 'statistic');
    expect(step).toBeDefined();
    expect(formatStatistic(e, seriesFixtures[0]).change).toBe('+77,3 tusen personer');
  });

  it('worked example 2: wind moved up nationally, partial relevance caps the verdict at partial', () => {
    const wind = stat({
      series: 'scb-installerad-vindkraft',
      baseline: { period: '2022', v: 14278 },
      latest: { period: '2025', v: 18127 },
      target: { type: 'direction', op: 'up' },
      relevance: 'partial',
    });
    const base = {
      id: 'val2022-l-mer-sol-och-vindkraft-i-hela-landet',
      parties: ['L'],
      roles: { L: 'government' },
      evidence: [wind, action],
    };
    expect(statisticRefProblems([promiseSchema.parse(promise(base))], seriesByTerm)).toEqual([]);
    expect(
      promiseSchema.safeParse(promise({ ...base, ...verdict('partially_fulfilled') })).success,
    ).toBe(true);
    expect(promiseSchema.safeParse(promise({ ...base, ...verdict('fulfilled') })).success).toBe(
      false,
    );
  });

  it('worked example 3: housing fell against the promise and qualifies nothing', () => {
    const housing = stat({
      series: 'scb-fardigstallda-bostader',
      baseline: { period: '2022', v: 54018 },
      latest: { period: '2025', v: 31359 },
      target: { type: 'direction', op: 'up' },
    });
    const base = {
      id: 'val2022-sd-oka-bostadsbyggandet',
      parties: ['SD'],
      roles: { SD: 'support' },
      evidence: [housing, action],
    };
    expect(statisticRefProblems([promiseSchema.parse(promise(base))], seriesByTerm)).toEqual([]);
    for (const v of ['partially_fulfilled', 'fulfilled']) {
      expect(promiseSchema.safeParse(promise({ ...base, ...verdict(v) })).success).toBe(false);
    }
  });

  it('needs action evidence as well as the statistic', () => {
    const up = stat({ target: { type: 'direction', op: 'up' } });
    expect(
      promiseSchema.safeParse(promise({ evidence: [up], ...verdict('partially_fulfilled') }))
        .success,
    ).toBe(false);
    expect(
      promiseSchema.safeParse(promise({ evidence: [up, action], ...verdict('fulfilled') })).success,
    ).toBe(true);
    // a statistic and a contradicting law does not count as action
    expect(
      promiseSchema.safeParse(
        promise({
          evidence: [up, { ...action, relevance: 'contradicts' }],
          ...verdict('partially_fulfilled'),
        }),
      ).success,
    ).toBe(false);
  });

  it('never qualifies an opposition-only promise, and a law alone does not settle an outcome', () => {
    const up = stat({ target: { type: 'direction', op: 'up' } });
    for (const v of ['partially_fulfilled', 'fulfilled']) {
      expect(
        promiseSchema.safeParse(
          promise({
            parties: ['V'],
            roles: { V: 'opposition' },
            evidence: [up, action],
            ...verdict(v),
          }),
        ).success,
      ).toBe(false);
      // a law without a statistic does not settle an outcome promise either
      expect(promiseSchema.safeParse(promise({ evidence: [action], ...verdict(v) })).success).toBe(
        false,
      );
    }
  });

  it('never sets broken or in_progress on its own', () => {
    const down = stat({
      target: { type: 'direction', op: 'up' },
      latest: { period: '2025', v: 100 },
    });
    expect(
      promiseSchema.safeParse(promise({ evidence: [down], ...verdict('broken') })).success,
    ).toBe(false);
    expect(
      promiseSchema.safeParse(promise({ evidence: [down], ...verdict('in_progress') })).success,
    ).toBe(false);
  });

  it('fulfilled needs a reached threshold with full relevance, within the term', () => {
    const t = (value: number, byYear?: number) =>
      stat({
        series: 'scb-installerad-vindkraft',
        baseline: { period: '2022', v: 14278 },
        latest: { period: '2025', v: 18127 },
        target: { type: 'threshold', op: 'gte', value, ...(byYear ? { byYear } : {}) },
      });
    const ok = (e: unknown) =>
      promiseSchema.safeParse(promise({ evidence: [e, action], ...verdict('fulfilled') })).success;
    expect(ok(t(18000))).toBe(true);
    expect(ok(t(20000))).toBe(false);
    expect(ok(t(18000, 2030))).toBe(false);
    expect(ok(t(18000, 2026))).toBe(true);
  });

  it('checks series existence, values and the nominal price rule', () => {
    const p = (e: unknown) => promiseSchema.parse(promise({ evidence: [e] }));
    expect(statisticRefProblems([p(stat({ series: 'nope' }))], seriesByTerm)[0]).toMatch(
      /not found/,
    );
    expect(
      statisticRefProblems([p(stat({ latest: { period: '2025', v: 1 } }))], seriesByTerm)[0],
    ).toMatch(/series scb-undersysselsatta-15-74 says 376.3/);
    expect(
      statisticRefProblems([p(stat({ baseline: { period: '2021', v: 1 } }))], seriesByTerm)[0],
    ).toMatch(/no value/);
    const fuel = stat({
      series: 'scb-drivmedelspris',
      baseline: { period: '2022', v: 20 },
      latest: { period: '2025', v: 17 },
      target: { type: 'direction', op: 'down' },
    });
    expect(statisticRefProblems([p(fuel)], seriesByTerm)[0]).toMatch(/inflationNote/);
    expect(
      statisticRefProblems(
        [p({ ...fuel, inflationNote: 'Justerat för KPI var minskningen större.' })],
        seriesByTerm,
      ),
    ).toEqual([]);
    expect(formatStatistic(statisticOf(fuel), seriesFixtures[3]).change).toBe(
      '−3 kr/liter, nominellt',
    );
  });

  it('rejects unknown fields (no tier) and a latest period before the baseline', () => {
    expect(
      promiseSchema.safeParse(promise({ evidence: [stat({ tier: 'outcome' })] })).success,
    ).toBe(false);
    expect(
      promiseSchema.safeParse(promise({ evidence: [stat({ latest: { period: '2021', v: 1 } })] }))
        .success,
    ).toBe(false);
  });

  it('statisticMoved follows the target direction', () => {
    const e = statisticOf(stat({ target: { type: 'threshold', op: 'lte', value: 1 } }));
    expect(statisticMoved(e)).toBe(false);
    expect(statisticMoved(statisticOf(stat({ target: { type: 'none' } })))).toBe(false);
  });

  it('edge cases for moved, reached and unmoved series', () => {
    const ok = (e: unknown, v: string) =>
      promiseSchema.safeParse(promise({ evidence: [e, action], ...verdict(v) })).success;
    const win = (target: unknown, latest: number, baseline = 120) =>
      stat({
        baseline: { period: '2022', v: baseline },
        latest: { period: '2025', v: latest },
        target,
      });
    // moved against the promise although above the threshold's reach: gte 100, 120 -> 105
    const against = win({ type: 'threshold', op: 'gte', value: 100 }, 105);
    expect(ok(against, 'partially_fulfilled')).toBe(false);
    expect(ok(against, 'fulfilled')).toBe(false);
    // lte threshold, fell and reached
    const lteMet = win({ type: 'threshold', op: 'lte', value: 110 }, 105);
    expect(ok(lteMet, 'partially_fulfilled')).toBe(true);
    expect(ok(lteMet, 'fulfilled')).toBe(true);
    // lte threshold, fell but not reached: partial only
    const lteNot = win({ type: 'threshold', op: 'lte', value: 100 }, 105);
    expect(ok(lteNot, 'partially_fulfilled')).toBe(true);
    expect(ok(lteNot, 'fulfilled')).toBe(false);
    // lte threshold, rose
    const lteUp = win({ type: 'threshold', op: 'lte', value: 130 }, 125);
    expect(ok(lteUp, 'partially_fulfilled')).toBe(false);
    expect(ok(lteUp, 'fulfilled')).toBe(false);
    // unchanged value
    const flat = win({ type: 'direction', op: 'up' }, 120);
    expect(ok(flat, 'partially_fulfilled')).toBe(false);
    expect(ok(flat, 'fulfilled')).toBe(false);
    // target none never qualifies
    const none = win({ type: 'none' }, 200);
    expect(ok(none, 'partially_fulfilled')).toBe(false);
    expect(ok(none, 'fulfilled')).toBe(false);
  });

  it('rejects equal or mixed-format periods and statistics on non-outcome promises', () => {
    const bad = (over: Record<string, unknown>) =>
      promiseSchema.safeParse(promise({ evidence: [stat(over)] })).success;
    expect(bad({ latest: { period: '2022', v: 1 } })).toBe(false);
    expect(bad({ latest: { period: '2025-Q1', v: 1 } })).toBe(false);
    expect(bad({ latest: { period: '25', v: 1 } })).toBe(false);
    expect(
      bad({ latest: { period: '2025-Q4', v: 1 }, baseline: { period: '2022-Q1', v: 2 } }),
    ).toBe(true);
    expect(promiseSchema.safeParse(promise({ type: 'legislative' })).success).toBe(false);
  });

  it('requires priceBasis on a price series and the newest period as latest', () => {
    const base = { ...seriesFixtures[3], priceBasis: undefined };
    expect(statisticSeriesSchema.safeParse(base).success).toBe(false);
    const p = promiseSchema.parse(
      promise({ evidence: [stat({ latest: { period: '2024', v: 350.9 } })] }),
    );
    expect(statisticRefProblems([p], seriesByTerm)[0]).toMatch(/not the newest/);
  });
});

function statisticOf(raw: unknown) {
  const e = promiseSchema.parse(promise({ evidence: [raw] })).evidence[0];
  if (e?.kind !== 'statistic') throw new Error('expected statistic');
  return e;
}
