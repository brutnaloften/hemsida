/**
 * Staleness rules per dataset and a pure checker over the freshness manifest.
 * `tools/check-freshness.ts` is the CLI around it. Dates are passed in, never read from the clock.
 *
 * Calendar facts below are ASSUMPTIONS, deliberately conservative (late) so a dataset is only
 * flagged when it is very likely that newer data exists upstream. They were not verified against
 * the publishers' release calendars; tighten them once someone has.
 */
import type { FreshnessManifest } from './freshness.ts';

export type Rule =
  | {
      /** Annual data: year Y is expected once `today` reaches (month/day) of year Y+1. */
      kind: 'annual';
      month: number;
      day: number;
    }
  | {
      /** Continuously published data: the last fetch must be at most `days` old. */
      kind: 'max-age';
      days: number;
      /** Once a fetch on or after this date exists, the dataset is final and never stale again. */
      closeAfter?: string;
    };

export const RULES: Record<string, Rule> = {
  // ASSUMPTION: Statskontoret/ESV outturn for year Y is published in Feb-Mar Y+1, with revenue
  // outcomes finalised later. We expect year Y only from 1 July Y+1 to stay clear of that.
  budget: { kind: 'annual', month: 7, day: 1 },
  // ASSUMPTION: SCB annual KPI and GDP (BNP) for year Y are out by spring Y+1 (preliminary BNP
  // is revised later). Same conservative 1 July cut-off. Monthly KPI is not tracked yet: the
  // manifest records the latest year only.
  macro: { kind: 'annual', month: 7, day: 1 },
  // ASSUMPTION: Riksdag publishes continuously, so a monthly refresh is enough. The 2022-2026
  // term is treated as closed by one fetch on or after 2026-10-31 (term ended with the September
  // 2026 election; the last documents are assumed to be out by then).
  'riksdag-2022-2026': { kind: 'max-age', days: 30, closeAfter: '2026-10-31' },
};

export type Verdict = { id: string; stale: boolean; reason: string };

/** Newest year expected for an annual rule on `today` (YYYY-MM-DD). */
export function expectedYear(rule: Extract<Rule, { kind: 'annual' }>, today: string): number {
  const year = Number(today.slice(0, 4));
  const md = (m: number, d: number) => m * 100 + d;
  const todayMd = md(Number(today.slice(5, 7)), Number(today.slice(8, 10)));
  // Year Y is published from (rule date) in Y+1.
  return todayMd >= md(rule.month, rule.day) ? year - 1 : year - 2;
}

export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

export function checkFreshness(
  manifest: FreshnessManifest,
  today: string,
  rules: Record<string, Rule> = RULES,
): Verdict[] {
  const verdicts: Verdict[] = [];
  for (const [id, rule] of Object.entries(rules)) {
    const entry = manifest.datasets[id];
    if (entry && !isValidDate(entry.fetchedAt)) {
      verdicts.push({ id, stale: true, reason: `invalid fetchedAt ${entry.fetchedAt}` });
      continue;
    }
    if (rule.kind === 'max-age') {
      if (entry && rule.closeAfter && entry.fetchedAt >= rule.closeAfter) {
        verdicts.push({ id, stale: false, reason: `final snapshot taken ${entry.fetchedAt}` });
      } else if (!entry) {
        verdicts.push({ id, stale: true, reason: 'never ingested (no manifest entry)' });
      } else {
        const age = daysBetween(entry.fetchedAt, today);
        verdicts.push(
          age > rule.days
            ? {
                id,
                stale: true,
                reason: `last fetched ${entry.fetchedAt}, ${age} days ago (max ${rule.days})`,
              }
            : { id, stale: false, reason: `fetched ${age} days ago (max ${rule.days})` },
        );
      }
      continue;
    }
    const expected = expectedYear(rule, today);
    if (!entry) {
      verdicts.push({ id, stale: true, reason: `never ingested (expected data for ${expected})` });
      continue;
    }
    const have = Number(entry.latestPeriod.slice(0, 4));
    verdicts.push(
      have < expected
        ? { id, stale: true, reason: `latest period ${entry.latestPeriod}, expected ${expected}` }
        : {
            id,
            stale: false,
            reason: `latest period ${entry.latestPeriod} (expected ${expected})`,
          },
    );
  }
  for (const id of Object.keys(manifest.datasets)) {
    if (!(id in rules)) verdicts.push({ id, stale: false, reason: 'no rule configured' });
  }
  return verdicts;
}
