/**
 * Step 8 of docs/riksdag-linking.md: turn judged promise/document pairs into `evidence[]` and a
 * verdict on a promise. Pure; tools/apply-links.ts does the file I/O.
 *
 * Rules (deliberately conservative, a model sets the verdict and no human reviews it, so the verdict is tagged `assessedBy: 'ai'`):
 *  - evidence = the pairs the judge proposed (match or partial at the configured confidence)
 *    whose stage is not `background`, skrivelser excluded, one entry per document; `match` becomes relevance `full`, `partial` becomes `partial`;
 *  - the verdict is `in_progress` when the evidence includes a dir, sou, ds or prop, otherwise
 *    the promise stays `unassessed` (a betänkande alone may only reject motions);
 *  - never `no_evidence` (the search must be exhaustive first) and never `broken` (a `contradicts`
 *    label is only reported);
 *  - SFS (only when `sfs` is passed, and only for `legislative` promises): the laws reached through the
 *    propositions in the evidence (`sfs.byProp`) become `sfs` evidence when the judge (or an override)
 *    gave them coverage full, partial or weaker (relevance `full` for full, otherwise `partial`, with
 *    the gap in `note`); a law with no judgement is not added, and neither is one without an in-force
 *    date (the schema needs a date). A law is in force when its in-force date is on or before `today`.
 *    No law in force: `in_progress`. Pending work keeps `in_progress` too: another linked proposition
 *    (budget excluded) with no law in force yet, or a linked dir/sou/ds dated after the newest
 *    proposition that has a law in force. With nothing pending: `fulfilled` only when a law judged
 *    `full` at `high` confidence is in force, no linked law is judged `weaker`, and every linked law
 *    (judged full/partial/weaker) is in force (a future or undated law on the same proposition blocks
 *    `fulfilled`, so the promise gets `partially_fulfilled` instead); `partially_fulfilled` when laws
 *    are in force and one is high-confidence full or partial/weaker. A `full` below `high` confidence
 *    alone is unconfirmed: `in_progress` with the sfs entry attached (relevance full). Follow-up:
 *    medium fulls need confirmation before they can count. Never `broken`. Overrides (tools/sfs-overrides.json)
 *    replace the judge's label for a promise/law pair before any of this, because a lone `full` is not
 *    fully reliable;
 *  - a `contradicts` pair (proposed, stage not `background`) becomes evidence with relevance
 *    `contradicts` ("Motverkar") on any eligible promise; it never counts toward the verdict, never
 *    pulls in a deciding betänkande, and a promise whose only evidence works against it stays
 *    `unassessed`;
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

/**
 * Combine the judged pairs of several link runs given in order. A promise judged in more than one run
 * (a split part that the main run also judged) takes the pairs of the LATER run only, so applying the
 * runs together gives the same result however often they are applied.
 */
export function mergeRunPairs(runs: readonly (readonly JudgedPair[])[]): Map<string, JudgedPair[]> {
  const merged = new Map<string, JudgedPair[]>();
  for (const pairs of runs) {
    const fromRun = new Map<string, JudgedPair[]>();
    for (const p of pairs) fromRun.set(p.promise_id, [...(fromRun.get(p.promise_id) ?? []), p]);
    for (const [id, list] of fromRun) merged.set(id, list);
  }
  return merged;
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
    title: doc.titel.trim(),
    date: doc.datum,
    url: doc.url,
    relevance:
      pair.label === 'match' ? 'full' : pair.label === 'contradicts' ? 'contradicts' : 'partial',
    note: null,
  };
}

export type SfsLabel = 'full' | 'partial' | 'weaker' | 'none';

export interface SfsJudgement {
  label: SfsLabel;
  confidence: 'high' | 'medium' | 'low';
  missing_sv: string;
}

export interface SfsOverride {
  label: SfsLabel;
  reason: string;
}

/** The slice of an SFS law the verdict rules need (a subset of `SfsLaw`). */
export interface SfsLawInfo {
  sfs: string;
  title: string;
  ikraft: string | null;
}

/** Inputs for the SFS rules; `judgements` is keyed `<promise_id>::<law key>` (see `sfsJudgements`). */
export interface SfsInput {
  laws: Readonly<Record<string, SfsLawInfo>>;
  /** Proposition dok_id -> law keys (`sfs-YYYY-N`). */
  byProp: Readonly<Record<string, readonly string[]>>;
  judgements: ReadonlyMap<string, SfsJudgement>;
}

/**
 * Judge results with overrides applied: an override replaces the label of its `promise::law` pair
 * (confidence becomes `high`, so a deliberate `full` counts) and also covers a pair the judge never saw.
 */
export function sfsJudgements(
  results: readonly {
    id: string;
    label: SfsLabel;
    confidence: SfsJudgement['confidence'];
    missing_sv: string;
  }[],
  overrides: Readonly<Record<string, SfsOverride>> = {},
): Map<string, SfsJudgement> {
  const out = new Map<string, SfsJudgement>();
  for (const r of results) {
    out.set(r.id, { label: r.label, confidence: r.confidence, missing_sv: r.missing_sv });
  }
  for (const [id, o] of Object.entries(overrides)) {
    const old = out.get(id);
    out.set(id, {
      label: o.label,
      confidence: 'high',
      missing_sv: o.label === 'full' ? '' : (old?.missing_sv ?? ''),
    });
  }
  return out;
}

interface SfsLinked {
  key: string;
  law: SfsLawInfo & { ikraft: string };
  judgement: SfsJudgement;
}

interface SfsOutcome {
  /** Laws to show as evidence: judged full/partial/weaker, with an in-force date. */
  laws: SfsLinked[];
  /** Linked (non-budget) propositions with no law in force yet. */
  pending: RiksdagEvidence[];
  /** Linked dir/sou/ds dated after the newest proposition that has a law in force. */
  later: RiksdagEvidence[];
  value: 'fulfilled' | 'partially_fulfilled' | 'in_progress';
}

function sfsOutcome(
  promiseId: string,
  props: readonly RiksdagEvidence[],
  planning: readonly RiksdagEvidence[],
  sfs: SfsInput,
  today: string,
): SfsOutcome {
  const seen = new Map<string, SfsLinked>();
  const pending: RiksdagEvidence[] = [];
  let newestDecided = '';
  // Judged full/partial/weaker laws that cannot count yet (no in-force date): they block `fulfilled`.
  let undated = 0;
  for (const prop of props) {
    const keys = sfs.byProp[prop.dok_id] ?? [];
    // A law in force counts for the proposition whatever the judge made of it.
    if (keys.some((k) => (sfs.laws[k]?.ikraft ?? '9999') <= today)) {
      if (prop.date > newestDecided) newestDecided = prop.date;
    } else pending.push(prop);
    for (const key of keys) {
      const law = sfs.laws[key];
      const judgement = sfs.judgements.get(`${promiseId}::${key}`);
      if (!law || !judgement || judgement.label === 'none') continue;
      if (!law.ikraft) {
        undated++;
        continue;
      }
      if (!seen.has(key)) seen.set(key, { key, law: { ...law, ikraft: law.ikraft }, judgement });
    }
  }
  const laws = [...seen.values()].sort(
    (a, b) => a.law.ikraft.localeCompare(b.law.ikraft) || a.key.localeCompare(b.key),
  );
  const inForce = laws.filter((l) => l.law.ikraft <= today);
  // An inquiry or directive newer than the newest enacted proposition is work still going on.
  const later = newestDecided ? planning.filter((e) => e.date > newestDecided) : [];
  let value: SfsOutcome['value'] = 'in_progress';
  if (inForce.length > 0 && pending.length === 0 && later.length === 0) {
    const fullHigh = inForce.some(
      (l) => l.judgement.label === 'full' && l.judgement.confidence === 'high',
    );
    const blocked =
      undated > 0 ||
      inForce.length < laws.length ||
      laws.some((l) => l.judgement.label === 'weaker');
    const partial = inForce.some((l) => l.judgement.label !== 'full');
    if (fullHigh && !blocked) value = 'fulfilled';
    // A full below high confidence alone is unconfirmed: it neither fulfils nor partly fulfils.
    else if (fullHigh || partial) value = 'partially_fulfilled';
  }
  return { laws, pending, later, value };
}

function sfsEvidence(l: SfsLinked): RiksdagEvidence {
  const [yyyy, n] = l.law.sfs.split(':');
  return {
    kind: 'sfs',
    dok_id: `sfs-${yyyy}-${n}`,
    designation: `SFS ${yyyy}:${n}`,
    title: l.law.title,
    date: l.law.ikraft,
    url: `https://svenskforfattningssamling.se/doc/${yyyy}${n}.html`,
    relevance: l.judgement.label === 'full' ? 'full' : 'partial',
    note: l.judgement.label === 'full' ? null : l.judgement.missing_sv || null,
  };
}

const sfsList = (laws: readonly SfsLinked[]) =>
  laws.map((l) => `SFS ${l.law.sfs} (${l.law.title})`).join('; ');

/** Placeholder sentences about the laws; write-reasoning replaces them with prose later. */
function sfsReasoning(o: SfsOutcome, today: string): string {
  const inForce = o.laws.filter((l) => l.law.ikraft <= today);
  const future = o.laws.filter((l) => l.law.ikraft > today);
  const out: string[] = [];
  if (inForce.length > 0) {
    out.push(
      `${inForce.length === 1 ? 'Lagen' : 'Lagarna'} ${sfsList(inForce)} trädde i kraft ${[...new Set(inForce.map((l) => l.law.ikraft))].join(', ')}.`,
    );
  }
  if (future.length > 0) {
    out.push(
      `${future.length === 1 ? 'Lagen' : 'Lagarna'} ${sfsList(future)} träder i kraft ${[...new Set(future.map((l) => l.law.ikraft))].join(', ')}.`,
    );
  }
  const missing = inForce.filter((l) => l.judgement.label !== 'full' && l.judgement.missing_sv);
  const plural = inForce.length > 1;
  if (o.value === 'fulfilled') {
    out.push(
      `${plural ? 'Lagarna genomför' : 'Lagen genomför'} hela löftet, så det bedöms som uppfyllt.`,
    );
  } else if (o.value === 'partially_fulfilled') {
    out.push(
      `${plural ? 'Lagarna genomför' : 'Lagen genomför'} bara en del av löftet${missing.length > 0 ? `: ${missing.map((l) => l.judgement.missing_sv).join(' ')}` : '.'} Det bedöms därför som delvis uppfyllt.`,
    );
  } else if (inForce.length > 0) {
    const why = [
      o.pending.length > 0
        ? `${o.pending.length === 1 ? 'En' : 'Flera'} av propositionerna (${o.pending.map((p) => p.designation).join('; ')}) har ännu ingen lag i kraft`
        : '',
      o.later.length > 0
        ? `${o.later.length === 1 ? 'Ett nyare dokument' : 'Nyare dokument'} (${o.later.map((p) => p.designation).join('; ')}) visar att arbetet pågår`
        : '',
    ].filter((t) => t !== '');
    out.push(
      why.length > 0
        ? `${why.join(' och ')}, så löftet bedöms inte som uppfyllt.`
        : `${plural ? 'Lagarna är' : 'Lagen är'} i kraft, men dokumenten visar inte att ${plural ? 'de täcker' : 'den täcker'} hela löftet, så löftet bedöms inte som uppfyllt.`,
    );
  } else {
    out.push('Ingen av lagarna är i kraft ännu, så löftet bedöms inte som uppfyllt.');
  }
  return out.join(' ');
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
  sfs?: SfsInput,
): Applied | null {
  const rerunAi = promise.verdict.assessedBy === 'ai';
  if (!rerunAi && promise.verdict.value !== 'unassessed') return null;
  // Without SFS input the rules cannot reproduce a fulfilled / partially_fulfilled verdict: keep it.
  if (!sfs && ['fulfilled', 'partially_fulfilled'].includes(promise.verdict.value)) return null;
  // With SFS input the sfs entries are recomputed from the judgements; otherwise they stay as they are.
  const useSfs = !!sfs && promise.type === 'legislative';
  const allRiksdag = promise.evidence.filter(isRiksdagEvidence);
  const existingSfs = useSfs ? allRiksdag.filter((e) => e.kind === 'sfs') : [];
  const existingRiksdag = useSfs ? allRiksdag.filter((e) => e.kind !== 'sfs') : allRiksdag;
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
  // A document working against the promise is evidence on any eligible promise, but a full/partial
  // judgement of the same document wins. It never counts toward the verdict (see hasPlanning).
  const judged = new Set(pairs.map((p) => p.document_id));
  const contradicting = [...against.values()]
    .filter((e) => !byDoc.has(e.doc.dok_id))
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
  let evidence: Evidence[] = [...otherEvidence, ...riksdag];

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

  // SFS: laws reached through the linked propositions (budget propositions and skrivelser excluded).
  let outcome: SfsOutcome | null = null;
  if (useSfs) {
    const props = riksdag.filter(
      (e) =>
        e.kind === 'prop' &&
        isSupporting(e) &&
        !(docs.has(e.dok_id) && isBudgetProp(docs.get(e.dok_id)!)),
    );
    const planning = riksdag.filter(
      (e) => ['dir', 'sou', 'ds'].includes(e.kind) && isSupporting(e),
    );
    const o = sfsOutcome(promise.id, props, planning, sfs!, today);
    if (o.laws.length > 0) outcome = o;
  }
  const sfsEntries = outcome ? outcome.laws.map(sfsEvidence) : [];
  if (useSfs) {
    evidence = [
      ...otherEvidence,
      ...[...riksdag, ...sfsEntries].sort(
        (a, b) => a.date.localeCompare(b.date) || a.dok_id.localeCompare(b.dok_id),
      ),
    ];
  }
  const sig = (xs: readonly RiksdagEvidence[]) =>
    JSON.stringify(xs.map((e) => [e.dok_id, e.relevance, e.date, e.note]));
  const sameSfs = sig(sfsEntries) === sig(existingSfs);
  const value = outcome ? outcome.value : 'in_progress';
  if (rerunAi && sameEvidence && sameSfs && promise.verdict.value === value) return null;

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
    ...(outcome
      ? [
          decided.length > 0 ? `Riksdagen har även fattat beslut i ${list(decided)}.` : '',
          sfsReasoning(outcome, today),
        ]
      : [
          decided.length > 0
            ? `Riksdagen har även fattat beslut i ${list(decided)}, men ingen SFS-författning är kopplad till löftet, så det bedöms inte som uppfyllt.`
            : 'Ingen SFS-författning är kopplad till löftet, så det bedöms inte som uppfyllt.',
        ]),
  ]
    .filter((t) => t !== '')
    .join(' ');

  // Same value as before: update in place. A changed value moves the earlier verdict to history.
  const sameValue = rerunAi && promise.verdict.value === value;
  return {
    evidence,
    verdict: {
      value,
      assessedBy: 'ai',
      reasoning,
      date: today,
      history: sameValue
        ? promise.verdict.history
        : [...promise.verdict.history, asHistory(promise.verdict)],
    },
  };
}
