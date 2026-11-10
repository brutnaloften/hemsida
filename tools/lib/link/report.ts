/**
 * Results of a linking run and its agreement with the hand-labelled eval pairs (hemsida-4np.5). Pure.
 * Hand labels are ground truth; the judge is measured against them: exact label agreement, relevance
 * precision/recall (match|partial are positives, no_match negatives, contradicts left out like in the scoring
 * report), stage agreement where a hand stage exists, and the disagreements to read.
 */
import { CONFIDENCES, type LinkConfig } from './config.ts';
import type { LinkCache } from './cache.ts';
import type { Judgement } from './judge.ts';
import type { LinkPlan, LinkPair } from './plan.ts';

export interface PairResult {
  pair_id: string;
  promise_id: string;
  document_id: string;
  judgement: Judgement;
  /** The judgement passes the configured thresholds: a candidate for evidence, never a verdict by itself. */
  proposed: boolean;
}

const rank = (c: Judgement['confidence']): number => CONFIDENCES.indexOf(c);

export function isProposal(j: Judgement, t: LinkConfig['thresholds']): boolean {
  return t.accept_labels.includes(j.label) && rank(j.confidence) >= rank(t.min_confidence);
}

/** Judgements of every planned pair that has one in the cache. `missing` counts pairs without. */
export function collectResults(
  plan: LinkPlan,
  cache: LinkCache,
  thresholds: LinkConfig['thresholds'],
): { results: PairResult[]; missing: number } {
  const results: PairResult[] = [];
  let missing = 0;
  for (const { pair, key } of plan.pairs) {
    const entry = cache.get(key);
    if (!entry) {
      missing++;
      continue;
    }
    results.push({
      pair_id: pair.id,
      promise_id: pair.promise_id,
      document_id: pair.document_id,
      judgement: entry.judgement,
      proposed: isProposal(entry.judgement, thresholds),
    });
  }
  return { results, missing };
}

export interface Disagreement {
  id: string;
  hand: string;
  judge: string;
  confidence: string;
  reason: string;
}
export interface AgreementReport {
  /** Pairs that have a hand label and a judgement. */
  compared: number;
  exact_label: { agree: number; share: number | null };
  /** Relevance: positives are match|partial, negatives no_match; contradicts pairs are excluded. */
  relevance: {
    tp: number;
    fp: number;
    fn: number;
    tn: number;
    precision: number | null;
    recall: number | null;
  };
  /** Hand label (row) by judged label (column). */
  confusion: Record<string, Record<string, number>>;
  /** Only pairs with a hand stage. */
  stage: { compared: number; agree: number; share: number | null };
  /** Pairs the thresholds turn into proposals, and how many of those the hand label also calls relevant. */
  proposed: {
    count: number;
    hand_relevant: number;
    hand_no_match: number;
    hand_contradicts: number;
  };
  disagreements: Disagreement[];
}

const isPos = (l: string) => l === 'match' || l === 'partial';
const share = (a: number, n: number): number | null => (n ? a / n : null);

export function buildAgreementReport(
  results: readonly PairResult[],
  pairs: readonly LinkPair[],
): AgreementReport {
  const byId = new Map(results.map((r) => [r.pair_id, r]));
  const confusion: Record<string, Record<string, number>> = {};
  const disagreements: Disagreement[] = [];
  let compared = 0;
  let agree = 0;
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  let stageN = 0;
  let stageAgree = 0;
  const proposed = { count: 0, hand_relevant: 0, hand_no_match: 0, hand_contradicts: 0 };
  for (const p of pairs) {
    const r = byId.get(p.id);
    if (!p.label || !r) continue;
    const j = r.judgement;
    compared++;
    const row = (confusion[p.label] ??= {});
    row[j.label] = (row[j.label] ?? 0) + 1;
    if (p.label === j.label) agree++;
    else
      disagreements.push({
        id: p.id,
        hand: p.label,
        judge: j.label,
        confidence: j.confidence,
        reason: j.reason,
      });
    if (isPos(p.label) && isPos(j.label)) tp++;
    else if (isPos(p.label)) fn++;
    else if (p.label === 'no_match') isPos(j.label) ? fp++ : tn++;
    if (p.stage) {
      stageN++;
      if (p.stage === j.stage) stageAgree++;
    }
    if (r.proposed) {
      proposed.count++;
      if (isPos(p.label)) proposed.hand_relevant++;
      else if (p.label === 'no_match') proposed.hand_no_match++;
      else proposed.hand_contradicts++;
    }
  }
  return {
    compared,
    exact_label: { agree, share: share(agree, compared) },
    relevance: {
      tp,
      fp,
      fn,
      tn,
      precision: share(tp, tp + fp),
      recall: share(tp, tp + fn),
    },
    confusion,
    stage: { compared: stageN, agree: stageAgree, share: share(stageAgree, stageN) },
    proposed,
    disagreements,
  };
}

export function formatAgreementReport(r: AgreementReport): string {
  const f = (n: number | null) => (n === null ? 'n/a' : n.toFixed(2));
  const lines = [
    `agreement with the hand labels: ${r.exact_label.agree}/${r.compared} exact (${f(r.exact_label.share)})`,
    `relevance (match|partial vs no_match): tp ${r.relevance.tp}, fp ${r.relevance.fp}, fn ${r.relevance.fn}, tn ${r.relevance.tn}; ` +
      `precision ${f(r.relevance.precision)}, recall ${f(r.relevance.recall)}`,
    `stage: ${r.stage.agree}/${r.stage.compared} agree (${f(r.stage.share)}) where a hand stage exists`,
    `proposals at the configured thresholds: ${r.proposed.count} ` +
      `(hand: ${r.proposed.hand_relevant} relevant, ${r.proposed.hand_no_match} no_match, ${r.proposed.hand_contradicts} contradicts)`,
    '',
    'confusion (hand label -> judged label):',
  ];
  for (const [hand, row] of Object.entries(r.confusion)) {
    lines.push(
      `  ${hand}: ${Object.entries(row)
        .map(([l, n]) => `${l} ${n}`)
        .join(', ')}`,
    );
  }
  if (r.disagreements.length) {
    lines.push('', 'disagreements:');
    for (const d of r.disagreements)
      lines.push(`  ${d.id}: hand ${d.hand}, judge ${d.judge} (${d.confidence})`);
  }
  return lines.join('\n');
}
