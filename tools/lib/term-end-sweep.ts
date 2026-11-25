/**
 * Term-end sweep (hemsida-0tp): what happens to the promises of a finished term that were never
 * given a decisive verdict. Decisions by Andreas, 2026-11-25 (docs/data-model.md, "expired"):
 * - every `unassessed` promise becomes `expired` ("Löpt ut"), existing reasoning kept;
 * - an `in_progress` promise is split by evidence: one that already qualifies for
 *   partially_fulfilled / fulfilled under the normal rules is only FLAGGED (the rule check is a
 *   separate run, never this tool); one whose only Riksdag evidence is inquiry documents
 *   (dir/sou/ds, no law) becomes `expired`; the rest is left alone and listed for a decision;
 * - nothing else changes. `unfulfilled` is never set here.
 *
 * Pure logic. The CLI (tools/term-end-sweep.ts) loads the files and writes the report.
 */

import { isRiksdagEvidence, promiseSchema } from './schema.ts';
import type { PromiseRecord } from './schema.ts';
import { absenceSentences } from './write-reasoning.ts';

export type SweepAction =
  | 'expire' // unassessed -> expired
  | 'expire_inquiry_only' // in_progress with only dir/sou/ds -> expired
  | 'rule_check' // in_progress that already qualifies for partially_fulfilled / fulfilled
  | 'keep_needs_decision'; // in_progress, none of the above

export interface SweepItem {
  id: string;
  type: string;
  parties: string[];
  currentVerdict: string;
  evidenceKinds: string[];
  proposedVerdict: string;
  action: SweepAction;
  /** Evidence signature, e.g. "prop", "bet+prop", "statistic"; groups the keep / rule-check lists. */
  group: string;
  why: string;
  /** The reasoning would read as failure-implying next to "Löpt ut" (see failureImplying). */
  failureImplying: boolean;
  /** Carries a bet/other Riksdag entry judged `contradicts` (works against the promise). */
  contradicts: boolean;
}

/** Wording that says or hints the promise failed or that nothing happened. */
const FAILURE_WORDING =
  /(?<!\p{L})(?:misslyck\p{L}*|svek\p{L}*|övergiv\p{L}*|uteblev\p{L}*|brutit|bruten|lyckades\s+inte|ej\s+uppfyllt|inte\s+uppfyllt|inget\s+har\s+hänt|ingen\s+åtgärd|inga\s+åtgärder|inte\s+genomf\p{L}+|genomfördes\s+inte|har\s+inte\s+(?:införts|beslutats|genomförts|infört|beslutat|genomfört|tagits|tagit|vidtagits)|har\s+ingenting\s+hänt|inga\s+belägg|inga\s+dokument|inget\s+dokument)(?!\p{L})/iu;

/** True when the reasoning contains an absence claim or failure wording. */
export function failureImplying(reasoning: string): boolean {
  return FAILURE_WORDING.test(reasoning) || absenceSentences(reasoning).length > 0;
}

/** Fallback reasoning for an empty one (the schema needs reasoning for `expired`). */
export const EXPIRED_FALLBACK = 'Mandatperioden löpte ut utan avgörande bedömning.';

/** Riksdag evidence that counts toward a verdict (a `contradicts` entry never does). */
function countingRiksdag(p: PromiseRecord) {
  return p.evidence.filter(isRiksdagEvidence).filter((e) => e.relevance !== 'contradicts');
}

/** True when the promise would pass the normal evidence rules with the given verdict value. */
export function qualifiesFor(
  p: PromiseRecord,
  value: 'partially_fulfilled' | 'fulfilled',
): boolean {
  const candidate = {
    ...p,
    verdict: { ...p.verdict, value, reasoning: 'x', assessedBy: 'ai', history: [] },
  };
  return promiseSchema.safeParse(candidate).success;
}

/** Evidence signature without agreement entries (they never count toward a verdict). */
function signature(p: PromiseRecord): string {
  const kinds = [...new Set(p.evidence.map((e) => e.kind))].filter((k) => k !== 'agreement');
  return kinds.length === 0 ? '(none)' : kinds.sort().join('+');
}

/** Coarse group by the furthest stage of the evidence, for the grouped lists. */
export function stageGroup(p: PromiseRecord): string {
  const kinds = new Set(countingRiksdag(p).map((e) => e.kind));
  const other = new Set(p.evidence.map((e) => e.kind));
  if (kinds.has('sfs')) return 'law (sfs)';
  if (p.type === 'inquiry' && kinds.has('dir')) return 'inquiry directive (dir)';
  if (other.has('statistic')) return 'statistic-backed';
  if (other.has('budget')) return 'budget-backed';
  if (kinds.has('bet')) return kinds.has('prop') ? 'bet + prop, no law' : 'bet, no law';
  if (kinds.has('prop')) return 'prop, no law';
  if (kinds.has('mot')) return 'own motion (mot)';
  if (kinds.has('dir')) return 'directive (dir)';
  return 'other';
}

/** What the sweep would do with one promise; null when it is left untouched. */
export function classify(p: PromiseRecord): SweepItem | null {
  const base = {
    id: p.id,
    type: p.type,
    parties: p.parties,
    currentVerdict: p.verdict.value,
    evidenceKinds: [...new Set(p.evidence.map((e) => e.kind))].sort(),
    failureImplying: failureImplying(p.verdict.reasoning),
    contradicts: p.evidence.some((e) => isRiksdagEvidence(e) && e.relevance === 'contradicts'),
  };
  if (p.verdict.value === 'unassessed') {
    return {
      ...base,
      proposedVerdict: 'expired',
      action: 'expire',
      group: signature(p),
      why: 'Unassessed at term end: the term ended without a verdict.',
    };
  }
  if (p.verdict.value !== 'in_progress') return null;

  const kinds = [...new Set(countingRiksdag(p).map((e) => e.kind))];
  // Either verdict qualifying is enough: some promises pass fulfilled but not partially_fulfilled.
  const partial = qualifiesFor(p, 'partially_fulfilled');
  const full = qualifiesFor(p, 'fulfilled');
  if (partial || full) {
    const which =
      partial && full
        ? 'fulfilled or partially_fulfilled'
        : full
          ? 'fulfilled'
          : 'partially_fulfilled';
    return {
      ...base,
      proposedVerdict: which,
      action: 'rule_check',
      group: stageGroup(p),
      why: `Evidence already qualifies for ${which} under the existing rules (${signature(p)}); flagged for the rule check, not changed here.`,
    };
  }
  const onlyInquiry =
    kinds.length > 0 &&
    kinds.every((k) => k === 'dir' || k === 'sou' || k === 'ds') &&
    // statistic or budget evidence is a separate path; leave those for a decision
    p.evidence.every((e) => isRiksdagEvidence(e) || e.kind === 'agreement');
  if (onlyInquiry) {
    return {
      ...base,
      proposedVerdict: 'expired',
      action: 'expire_inquiry_only',
      group: signature(p),
      why: `Only inquiry documents (${kinds.join('+')}), no law: the term ended with the work at the planning stage.`,
    };
  }
  return {
    ...base,
    proposedVerdict: 'in_progress (unchanged)',
    action: 'keep_needs_decision',
    group: stageGroup(p),
    why: `In progress on ${signature(p)} without a law or inquiry-only evidence; needs a decision.`,
  };
}

export interface SweepReport {
  term: string;
  generatedAt: string;
  date: string;
  total: number;
  counts: {
    expire: number;
    expireInquiryOnly: number;
    ruleCheck: number;
    keepNeedsDecision: number;
    unfulfilledCandidates: number;
    failureImplying: number;
  };
  byTypeAndParty: Record<string, Record<string, number>>;
  keepGroups: Record<string, number>;
  ruleCheckGroups: Record<string, number>;
  items: SweepItem[];
  /** Specific act due within the term and evidently not carried out; empty until one is identified. */
  unfulfilledCandidates: { id: string; act: string; why: string }[];
}

const bump = (m: Record<string, number>, k: string) => (m[k] = (m[k] ?? 0) + 1);

export function buildReport(
  term: string,
  promises: readonly PromiseRecord[],
  date: string,
  generatedAt = new Date().toISOString(),
): SweepReport {
  const items = promises
    .map(classify)
    .filter((x): x is SweepItem => x !== null)
    .sort((a, b) => a.id.localeCompare(b.id));
  const byTypeAndParty: Record<string, Record<string, number>> = {};
  const keepGroups: Record<string, number> = {};
  const ruleCheckGroups: Record<string, number> = {};
  for (const i of items) {
    if (i.action === 'expire' || i.action === 'expire_inquiry_only') {
      const row = (byTypeAndParty[i.type] ??= {});
      for (const party of i.parties) bump(row, party);
    }
    if (i.action === 'keep_needs_decision') bump(keepGroups, i.group);
    if (i.action === 'rule_check') bump(ruleCheckGroups, i.group);
  }
  const n = (a: SweepAction) => items.filter((i) => i.action === a).length;
  return {
    term,
    generatedAt,
    date,
    total: promises.length,
    counts: {
      expire: n('expire'),
      expireInquiryOnly: n('expire_inquiry_only'),
      ruleCheck: n('rule_check'),
      keepNeedsDecision: n('keep_needs_decision'),
      unfulfilledCandidates: 0,
      failureImplying: items.filter(
        (i) => (i.action === 'expire' || i.action === 'expire_inquiry_only') && i.failureImplying,
      ).length,
    },
    byTypeAndParty,
    keepGroups,
    ruleCheckGroups,
    items,
    unfulfilledCandidates: [],
  };
}

const EXAMPLES = 10;

function table(items: SweepItem[]): string[] {
  return [
    '| id | type | party | current | evidence | proposed | why |',
    '|---|---|---|---|---|---|---|',
    ...items.map(
      (i) =>
        `| ${i.id} | ${i.type} | ${i.parties.join(',')} | ${i.currentVerdict} | ${i.evidenceKinds.join('+') || '-'} | ${i.proposedVerdict} | ${i.why} |`,
    ),
  ];
}

export function renderMarkdown(r: SweepReport): string {
  const by = (a: SweepAction) => r.items.filter((i) => i.action === a);
  const out: string[] = [
    `# Term-end sweep dry-run: ${r.term}`,
    '',
    `Generated ${r.generatedAt}; sweep date ${r.date}. Nothing was changed.`,
    '',
    '## Summary',
    '',
    `- ${r.total} promises in the term`,
    `- ${r.counts.expire} unassessed -> expired`,
    `- ${r.counts.expireInquiryOnly} in_progress with only dir/sou/ds -> expired`,
    `- ${r.counts.ruleCheck} in_progress that already qualify for partially_fulfilled / fulfilled (flag for the rule check, not changed)`,
    `- ${r.counts.keepNeedsDecision} in_progress kept, needs a decision`,
    `- ${r.counts.failureImplying} of the expired reasonings would read as failure-implying (flagged below)`,
    `- ${r.counts.unfulfilledCandidates} unfulfilled candidates (a specific act due in the term)`,
    '',
    '## (a) unassessed -> expired',
    '',
    'Counts of expired promises (both groups) by type and party:',
    '',
    '| type | party counts |',
    '|---|---|',
    ...Object.entries(r.byTypeAndParty).map(
      ([t, ps]) =>
        `| ${t} | ${Object.entries(ps)
          .sort()
          .map(([p, c]) => `${p} ${c}`)
          .join(', ')} |`,
    ),
    '',
    '### Failure-implying reasoning: rewrite before `--apply` (the tool refuses otherwise)',
    '',
    ...table(
      r.items.filter(
        (i) => (i.action === 'expire' || i.action === 'expire_inquiry_only') && i.failureImplying,
      ),
    ),
    '',
    '### Expired group promises that carry a `contradicts` entry, unassessed ones included (check before applying)',
    '',
    ...table(
      r.items.filter(
        (i) => (i.action === 'expire' || i.action === 'expire_inquiry_only') && i.contradicts,
      ),
    ),
    '',
    '## (b1) in_progress that should already be partial/fulfilled: flag for the rule check',
    '',
    ...Object.entries(r.ruleCheckGroups).map(([g, c]) => `- ${g}: ${c}`),
    '',
    ...table(by('rule_check').slice(0, EXAMPLES)),
    '',
    '## (b2) in_progress with only dir/sou/ds -> expired',
    '',
    ...table(by('expire_inquiry_only')),
    '',
    '## (b3) in_progress kept, needs a decision',
    '',
    ...Object.entries(r.keepGroups).map(([g, c]) => `- ${g}: ${c}`),
    '',
  ];
  for (const g of Object.keys(r.keepGroups)) {
    out.push(`### ${g}`, '');
    out.push(
      ...table(
        by('keep_needs_decision')
          .filter((i) => i.group === g)
          .slice(0, EXAMPLES),
      ),
      '',
    );
  }
  out.push(
    '## (c) unfulfilled candidates',
    '',
    r.unfulfilledCandidates.length === 0
      ? 'None identified. This tool never sets unfulfilled; it is reserved for a specific act due in the term.'
      : r.unfulfilledCandidates.map((c) => `- ${c.id}: ${c.act} (${c.why})`).join('\n'),
    '',
    'The full per-promise list is in the JSON report.',
    '',
  );
  return out.join('\n');
}

/**
 * Apply mode: the verdict block of one swept promise. The reasoning is the WORKING-TREE one
 * (`current`: failure-implying reasons are rewritten there before the run; an empty one gets a
 * fallback sentence). Only the history comes from `base` (the verdict as on the base ref): its
 * history plus the base verdict object itself. Returns null when the promise is not swept to
 * `expired`; throws when the reasoning that would be written is still failure-implying and
 * `allowFailureWording` is not set.
 */
export function applyVerdict(
  base: PromiseRecord['verdict'],
  current: PromiseRecord['verdict'],
  item: SweepItem,
  date: string,
  allowFailureWording = false,
): PromiseRecord['verdict'] | null {
  if (item.action !== 'expire' && item.action !== 'expire_inquiry_only') return null;
  const prev: PromiseRecord['verdict']['history'][number] = {
    value: base.value,
    ...(base.assessedBy ? { assessedBy: base.assessedBy } : {}),
    reasoning: base.reasoning,
    date: base.date,
  };
  const reasoning = current.reasoning.trim() === '' ? EXPIRED_FALLBACK : current.reasoning;
  if (!allowFailureWording && failureImplying(reasoning)) {
    throw new Error(
      `${item.id}: the reasoning to be written is failure-implying; rewrite it first`,
    );
  }
  return {
    value: 'expired',
    assessedBy: 'ai',
    reasoning,
    date,
    history: [...base.history, prev],
  };
}

const VERDICT_KEY_ORDER = ['value', 'assessedBy', 'reasoning', 'date', 'history'];

/**
 * `next` with the key order of `existing` (the raw JSON verdict): existing keys keep their place,
 * a new key goes after the nearest preceding key of the canonical order.
 */
export function inKeyOrder(
  existing: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const order = Object.keys(existing).filter((k) => k in next);
  for (const k of VERDICT_KEY_ORDER) {
    if (!(k in next) || order.includes(k)) continue;
    const before = VERDICT_KEY_ORDER.slice(0, VERDICT_KEY_ORDER.indexOf(k)).filter((x) =>
      order.includes(x),
    );
    const at = before.length === 0 ? 0 : order.indexOf(before[before.length - 1]!) + 1;
    order.splice(at, 0, k);
  }
  return Object.fromEntries(order.map((k) => [k, next[k]]));
}

/**
 * The verdict as on the base ref. `baseText` is the file content on the base, or null when the file
 * does not exist there (a promise added after the base); only then the working-tree verdict is
 * used, with a warning.
 */
export function resolveBaseVerdict(
  baseText: string | null,
  current: PromiseRecord['verdict'],
  warn: (msg: string) => void,
  label = '',
): PromiseRecord['verdict'] {
  if (baseText === null) {
    warn(`${label}: not on the base ref, using the working-tree verdict`);
    return current;
  }
  return promiseSchema.parse(JSON.parse(baseText)).verdict;
}
