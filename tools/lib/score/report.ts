/**
 * Metrics of a scoring run against the hand-labelled eval pairs (hemsida-vzn). Pure; reproduces the numbers
 * of the earlier one-off Jev eval script (removed) for the same scores.
 */
import { auc } from '../jev.ts';
import type { ScoreResults } from './results.ts';

export interface LabelledPair {
  id: string;
  promise_id: string;
  document_id: string;
  label: 'match' | 'partial' | 'contradicts' | 'no_match' | null;
}
export interface ReportRow {
  id: string;
  label: string;
  score: number;
  /** 1 = the pair's own promise scores highest among the promises scored for the document. */
  rank_in_doc: number;
  of: number;
}
export interface LabelStats {
  n: number;
  mean: number;
  min: number;
  max: number;
}
export interface ThresholdStats {
  threshold: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number | null;
  recall: number | null;
}
export interface Report {
  /** match|partial against no_match; NaN becomes null (JSON) when one side is empty. */
  auc: number | null;
  scored_pairs: number;
  unscored_pairs: number;
  per_label: Record<string, LabelStats>;
  thresholds: ThresholdStats[];
  rows: ReportRow[];
  lowest_positives: ReportRow[];
  highest_negatives: ReportRow[];
}

export const THRESHOLDS = [0.3, 0.4, 0.5, 0.6, 0.7];
const isPositive = (l: string) => l === 'match' || l === 'partial';
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Pairs without a label, or whose document has no results at all, are left out (the latter counted as
 * `unscored_pairs`). A promise missing from a scored document counts as 0. `contradicts` pairs appear in the
 * per-label stats but not in AUC or precision/recall (they are neither positives nor clean negatives).
 */
export function buildReport(results: ScoreResults, pairs: readonly LabelledPair[]): Report {
  const rows: ReportRow[] = [];
  let unscored = 0;
  for (const p of pairs) {
    if (!p.label) continue;
    const doc = results[p.document_id];
    if (!doc) {
      unscored++;
      continue;
    }
    const own = doc[p.promise_id]?.score ?? 0;
    const others = Object.values(doc);
    rows.push({
      id: p.id,
      label: p.label,
      score: own,
      rank_in_doc: 1 + others.filter((s) => s.score > own).length,
      of: others.length,
    });
  }
  const pos = rows.filter((r) => isPositive(r.label));
  const neg = rows.filter((r) => r.label === 'no_match');
  const a = auc(
    pos.map((r) => r.score),
    neg.map((r) => r.score),
  );

  const per_label: Record<string, LabelStats> = {};
  for (const l of ['match', 'partial', 'contradicts', 'no_match']) {
    const s = rows.filter((r) => r.label === l).map((r) => r.score);
    if (s.length)
      per_label[l] = { n: s.length, mean: mean(s), min: Math.min(...s), max: Math.max(...s) };
  }
  const thresholds = THRESHOLDS.map((t): ThresholdStats => {
    const tp = pos.filter((r) => r.score >= t).length;
    const fp = neg.filter((r) => r.score >= t).length;
    return {
      threshold: t,
      tp,
      fp,
      fn: pos.length - tp,
      tn: neg.length - fp,
      precision: tp + fp ? tp / (tp + fp) : null,
      recall: pos.length ? tp / pos.length : null,
    };
  });
  return {
    auc: Number.isNaN(a) ? null : a,
    scored_pairs: rows.length,
    unscored_pairs: unscored,
    per_label,
    thresholds,
    rows,
    lowest_positives: [...pos].sort((x, y) => x.score - y.score).slice(0, 8),
    highest_negatives: [...neg].sort((x, y) => y.score - x.score).slice(0, 6),
  };
}

export function formatReport(r: Report): string {
  const f = (n: number | null, d = 2) => (n === null ? 'n/a' : n.toFixed(d));
  const row = (x: ReportRow) =>
    `${x.score.toFixed(2)} rank ${x.rank_in_doc}/${x.of} ${x.label} ${x.id}`;
  const lines = [
    `AUC (match|partial vs no_match): ${f(r.auc, 3)}  (${r.scored_pairs} pairs scored, ${r.unscored_pairs} without results)`,
  ];
  for (const [l, s] of Object.entries(r.per_label)) {
    lines.push(
      `${l}: n=${s.n}, mean ${s.mean.toFixed(2)}, min ${s.min.toFixed(2)}, max ${s.max.toFixed(2)}`,
    );
  }
  lines.push('', 'threshold  precision  recall   tp  fp  fn  tn');
  for (const t of r.thresholds) {
    lines.push(
      `${t.threshold.toFixed(1).padEnd(9)}  ${f(t.precision).padEnd(9)}  ${f(t.recall).padEnd(6)}  ${String(t.tp).padStart(3)} ${String(t.fp).padStart(3)} ${String(t.fn).padStart(3)} ${String(t.tn).padStart(3)}`,
    );
  }
  lines.push('', 'lowest-scoring positives and highest-scoring negatives:');
  lines.push(...r.lowest_positives.map(row), '--', ...r.highest_negatives.map(row));
  return lines.join('\n');
}
