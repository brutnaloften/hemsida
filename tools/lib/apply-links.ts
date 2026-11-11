/**
 * Step 8 of docs/riksdag-linking.md: turn judged promise/document pairs into `evidence[]` and a
 * verdict on a promise. Pure; tools/apply-links.ts does the file I/O.
 *
 * Rules (deliberately conservative, a model sets the verdict and no human reviews it, so the verdict is tagged `assessedBy: 'ai'`):
 *  - evidence = the pairs the judge proposed (match or partial at the configured confidence)
 *    whose stage is not `background`, skrivelser excluded, one entry per document; `match` becomes relevance `full`, `partial` becomes `partial`;
 *  - the verdict is `in_progress` when the evidence includes a dir, sou, ds or prop, otherwise
 *    the promise stays `unassessed` (a betänkande alone may only reject motions);
 *  - never `fulfilled` (needs an sfs entry the store does not have), never `no_evidence` (the
 *    search must be exhaustive first) and never `broken` (a `contradicts` label is only reported);
 *  - a `contradicts` pair (proposed, stage not `background`) becomes evidence with relevance
 *    `contradicts` ("Motverkar") only when the promise also has full/partial planning evidence or
 *    the document is already evidence on it; it never counts toward the verdict, never pulls in a
 *    deciding betänkande and a promise whose only evidence works against it stays \`unassessed\`;
 *  - the betänkande that decided a linked proposition (from `decidedBy`, derived from the
 *    betänkande's own references, see decided-by.ts) is added as evidence with stage definitive;
 *  - eligible promises are `unassessed` ones (existing Riksdag evidence stays, new documents are merged
 *    in by dok_id; one that already has a dir/sou/ds/prop is treated as curated and skipped) and ones
 *    whose verdict is tagged `assessedBy: 'ai'`, which are recomputed (their Riksdag evidence is
 *    replaced and the earlier verdict goes to history when its value changes), so a later backfill
 *    reaches them; any other verdict is left alone, which keeps hand edits safe.
 */
import {
  isRiksdagEvidence,
  type Evidence,
  type PromiseRecord,
  type RiksdagEvidence,
} from './schema.ts';

export interface StoreDocument {
  dok_id: string;
  doktyp: string;
  rm: string;
  beteckning: string;
  titel: string;
  datum: string;
  url: string;
  /** Start of the document text; only used to tell skrivelser from propositions. */
  text?: string;
}

export interface JudgedPair {
  promise_id: string;
  document_id: string;
  label: 'match' | 'partial' | 'contradicts' | 'no_match';
  stage: 'definitive' | 'preparatory' | 'background';
  confidence: 'high' | 'medium' | 'low';
  proposed: boolean;
}

const PLANNING = new Set(['dir', 'sou', 'ds', 'prop']);

/** Evidence that counts toward a verdict: everything except a document working against the promise. */
const isSupporting = (e: RiksdagEvidence): boolean => e.relevance !== 'contradicts';

/**
 * The store files a regeringens skrivelse under doktyp `prop`, but it proposes nothing and the
 * schema has no `skr` kind, so it is never used as evidence.
 */
export function isSkrivelse(d: StoreDocument): boolean {
  return d.doktyp === 'prop' && /Regeringens skrivelse/.test((d.text ?? '').slice(0, 600));
}

/** Display designation, e.g. `Prop. 2025/26:207`, `Bet. 2025/26:SoU18`, `SOU 2023:12`. */
export function designationOf(d: StoreDocument): string {
  switch (d.doktyp) {
    case 'prop':
      return `Prop. ${d.rm}:${d.beteckning}`;
    case 'bet':
      return `Bet. ${d.rm}:${d.beteckning}`;
    case 'dir':
      return `Dir. ${d.rm}:${d.beteckning}`;
    case 'sou':
      return `SOU ${d.rm}:${d.beteckning}`;
    case 'ds':
      return `Ds ${d.rm}:${d.beteckning}`;
    default:
      throw new Error(`unsupported document type ${d.doktyp}`);
  }
}

/** Budget propositions are handled by one betänkande per utgiftsområde, none of them "the" decision. */
export function isBudgetProp(d: StoreDocument): boolean {
  return d.doktyp === 'prop' && (d.beteckning === '1' || /^Budgetpropositionen/.test(d.titel));
}

const MAX_DECIDING_BETS = 4;

export function evidenceFor(
  pair: JudgedPair,
  doc: StoreDocument,
): RiksdagEvidence & { kind: RiksdagEvidence['kind'] } {
  return {
    kind: doc.doktyp as RiksdagEvidence['kind'],
    dok_id: doc.dok_id,
    designation: designationOf(doc),
    title: doc.titel,
    date: doc.datum,
    url: doc.url,
    relevance:
      pair.label === 'match' ? 'full' : pair.label === 'contradicts' ? 'contradicts' : 'partial',
    note: null,
  };
}

export interface Applied {
  evidence: Evidence[];
  verdict: PromiseRecord['verdict'];
}

type VerdictEntry = PromiseRecord['verdict']['history'][number];

const asHistory = (v: PromiseRecord['verdict']): VerdictEntry => ({
  value: v.value,
  ...(v.assessedBy ? { assessedBy: v.assessedBy } : {}),
  reasoning: v.reasoning,
  date: v.date,
});

/**
 * Returns null when the promise must not be touched or nothing would change.
 *
 * Eligible: `unassessed` promises (Riksdag evidence already there is kept and new documents are
 * merged in by dok_id) and promises whose verdict this tool set earlier (`assessedBy: "ai"`), which
 * are recomputed from the newest judgements: their Riksdag evidence is replaced, and the earlier
 * verdict goes to `history` when its value changes. Any other verdict is left alone.
 */
export function applyLinks(
  promise: PromiseRecord,
  pairs: readonly JudgedPair[],
  docs: ReadonlyMap<string, StoreDocument>,
  today: string,
  decidedBy: ReadonlyMap<string, readonly string[]> = new Map(),
): Applied | null {
  const rerunAi = promise.verdict.assessedBy === 'ai';
  if (!rerunAi && promise.verdict.value !== 'unassessed') return null;
  const existingRiksdag = promise.evidence.filter(isRiksdagEvidence);
  // Unassessed with a dir/sou/ds/prop already attached was curated by someone: leave it.
  if (!rerunAi && existingRiksdag.some((e) => isSupporting(e) && PLANNING.has(e.kind))) return null;
  const otherEvidence = promise.evidence.filter((e) => !isRiksdagEvidence(e));

  const byDoc = new Map<string, { pair: JudgedPair; doc: StoreDocument }>();
  const against = new Map<string, { pair: JudgedPair; doc: StoreDocument }>();
  for (const pair of pairs) {
    if (!pair.proposed || pair.label === 'no_match') continue;
    // `background` = only mentions the topic or rejects motions about it: not evidence of action.
    if (pair.stage === 'background') continue;
    const doc = docs.get(pair.document_id);
    if (!doc || !['dir', 'sou', 'ds', 'prop', 'bet'].includes(doc.doktyp) || isSkrivelse(doc))
      continue;
    if (pair.label === 'contradicts') {
      against.set(doc.dok_id, { pair, doc });
      continue;
    }
    const seen = byDoc.get(doc.dok_id);
    if (!seen || (seen.pair.label === 'partial' && pair.label === 'match')) {
      byDoc.set(doc.dok_id, { pair, doc });
    }
  }

  // A proposition's deciding betänkande is evidence next to it, with the proposition's relevance.
  for (const { pair, doc } of [...byDoc.values()]) {
    if (doc.doktyp !== 'prop' || isBudgetProp(doc)) continue;
    const deciding = decidedBy.get(doc.dok_id) ?? [];
    // Many deciding bets means a budget-like bill whose every utskott handles a slice of it.
    if (deciding.length > MAX_DECIDING_BETS) continue;
    for (const betId of deciding) {
      const bet = docs.get(betId);
      if (!bet || bet.doktyp !== 'bet' || byDoc.has(bet.dok_id)) continue;
      byDoc.set(bet.dok_id, {
        pair: { ...pair, document_id: betId, stage: 'definitive' },
        doc: bet,
      });
    }
  }

  const entries = [...byDoc.values()].sort(
    (a, b) => a.doc.datum.localeCompare(b.doc.datum) || a.doc.dok_id.localeCompare(b.doc.dok_id),
  );
  const planning = entries.filter((e) => PLANNING.has(e.doc.doktyp));
  // A document working against the promise is only shown next to evidence that something is
  // being done, or when it was already shown (its judgement still stands); a full/partial
  // judgement of the same document wins.
  const judged = new Set(pairs.map((p) => p.document_id));
  const showAgainst = (id: string) =>
    planning.length > 0 ||
    existingRiksdag.some(
      (e) => isSupporting(e) && PLANNING.has(e.kind) && (!rerunAi || !judged.has(e.dok_id)),
    ) ||
    existingRiksdag.some((e) => e.dok_id === id);
  const contradicting = [...against.values()]
    .filter((e) => !byDoc.has(e.doc.dok_id) && showAgainst(e.doc.dok_id))
    .sort(
      (a, b) => a.doc.datum.localeCompare(b.doc.datum) || a.doc.dok_id.localeCompare(b.doc.dok_id),
    );
  const fresh = [...entries, ...contradicting].map((e) => evidenceFor(e.pair, e.doc));
  // An AI verdict's evidence is exactly what the judgements support now; for an unassessed promise
  // the evidence already there stays and new documents are added.
  // Evidence no judgement in this run mentions came from elsewhere (an earlier run, a hand edit):
  // only what the judge now rejects is dropped.
  const unjudged = existingRiksdag.filter((e) => !judged.has(e.dok_id));
  const riksdag: RiksdagEvidence[] = rerunAi
    ? [...unjudged, ...fresh.filter((f) => !unjudged.some((x) => x.dok_id === f.dok_id))].sort(
        (a, b) => a.date.localeCompare(b.date) || a.dok_id.localeCompare(b.dok_id),
      )
    : [
        ...existingRiksdag,
        ...fresh.filter((f) => !existingRiksdag.some((x) => x.dok_id === f.dok_id)),
      ].sort((a, b) => a.date.localeCompare(b.date) || a.dok_id.localeCompare(b.dok_id));
  const evidence: Evidence[] = [...otherEvidence, ...riksdag];

  const hasPlanning = rerunAi
    ? planning.length > 0 || unjudged.some((e) => isSupporting(e) && PLANNING.has(e.kind))
    : planning.length > 0 || riksdag.some((e) => isSupporting(e) && PLANNING.has(e.kind));
  const sameEvidence =
    JSON.stringify(riksdag.map((e) => [e.dok_id, e.relevance])) ===
    JSON.stringify(existingRiksdag.map((e) => [e.dok_id, e.relevance]));

  if (!hasPlanning) {
    // Nothing that shows action. An AI verdict falls back to unassessed (and keeps its old text in
    // history); an unassessed promise only gains evidence.
    if (rerunAi) {
      return {
        evidence,
        verdict: {
          value: 'unassessed',
          reasoning: '',
          date: today,
          history: [...promise.verdict.history, asHistory(promise.verdict)],
        },
      };
    }
    return riksdag.length === 0 || sameEvidence ? null : { evidence, verdict: promise.verdict };
  }
  if (rerunAi && sameEvidence && promise.verdict.value === 'in_progress') return null;

  const decided = entries.filter((e) => e.doc.doktyp === 'bet' && e.pair.stage === 'definitive');
  const full = planning.some((e) => e.pair.label === 'match');
  const list = (xs: typeof entries) =>
    xs.map((e) => `${designationOf(e.doc)} (${e.doc.titel})`).join('; ');
  const opposed = contradicting.filter((e) => riksdag.some((r) => r.dok_id === e.doc.dok_id));
  const reasoning = [
    `${planning.length === 1 ? 'Ett dokument' : 'Dokument'} i riksdagens register visar att åtgärden pågår: ${list(planning)}.`,
    full
      ? planning.length === 1
        ? 'Dokumentet behandlar hela löftet.'
        : 'Minst ett av dokumenten behandlar hela löftet.'
      : planning.length === 1
        ? 'Dokumentet behandlar bara en del av löftet.'
        : 'Dokumenten behandlar bara delar av löftet.',
    opposed.length > 0
      ? `${opposed.length === 1 ? 'Ett dokument' : 'Dokument'} motverkar löftet: ${list(opposed)}.`
      : '',
    decided.length > 0
      ? `Riksdagen har även fattat beslut i ${list(decided)}, men ingen SFS-författning är kopplad till löftet, så det bedöms inte som uppfyllt.`
      : 'Ingen SFS-författning är kopplad till löftet, så det bedöms inte som uppfyllt.',
  ]
    .filter((t) => t !== '')
    .join(' ');

  // Same value as before: update in place. A changed value moves the earlier verdict to history.
  const sameValue = rerunAi && promise.verdict.value === 'in_progress';
  return {
    evidence,
    verdict: {
      value: 'in_progress',
      assessedBy: 'ai',
      reasoning,
      date: today,
      history: sameValue
        ? promise.verdict.history
        : [...promise.verdict.history, asHistory(promise.verdict)],
    },
  };
}
