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
 *  - promises that already have a verdict other than `unassessed` or Riksdag evidence are left
 *    alone, so a rerun and hand edits are safe.
 */
import type { Evidence, PromiseRecord, RiksdagEvidence } from './schema.ts';

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
    relevance: pair.label === 'match' ? 'full' : 'partial',
    note: null,
  };
}

export interface Applied {
  evidence: Evidence[];
  verdict: PromiseRecord['verdict'];
}

/** Returns null when the promise must not be touched or has no proposed pair. */
export function applyLinks(
  promise: PromiseRecord,
  pairs: readonly JudgedPair[],
  docs: ReadonlyMap<string, StoreDocument>,
  today: string,
): Applied | null {
  const hasRiksdag = promise.evidence.some((e) => e.kind !== 'agreement' && e.kind !== 'budget');
  if (promise.verdict.value !== 'unassessed' || hasRiksdag) return null;

  const byDoc = new Map<string, { pair: JudgedPair; doc: StoreDocument }>();
  for (const pair of pairs) {
    if (!pair.proposed || (pair.label !== 'match' && pair.label !== 'partial')) continue;
    // `background` = only mentions the topic or rejects motions about it: not evidence of action.
    if (pair.stage === 'background') continue;
    const doc = docs.get(pair.document_id);
    if (!doc || !['dir', 'sou', 'ds', 'prop', 'bet'].includes(doc.doktyp) || isSkrivelse(doc))
      continue;
    const seen = byDoc.get(doc.dok_id);
    if (!seen || (seen.pair.label === 'partial' && pair.label === 'match')) {
      byDoc.set(doc.dok_id, { pair, doc });
    }
  }
  if (byDoc.size === 0) return null;

  const entries = [...byDoc.values()].sort(
    (a, b) => a.doc.datum.localeCompare(b.doc.datum) || a.doc.dok_id.localeCompare(b.doc.dok_id),
  );
  const riksdag = entries.map((e) => evidenceFor(e.pair, e.doc));
  const evidence: Evidence[] = [...promise.evidence, ...riksdag];

  const planning = entries.filter((e) => PLANNING.has(e.doc.doktyp));
  if (planning.length === 0) return { evidence, verdict: promise.verdict };

  const decided = entries.filter((e) => e.doc.doktyp === 'bet' && e.pair.stage === 'definitive');
  const full = planning.some((e) => e.pair.label === 'match');
  const list = (xs: typeof entries) =>
    xs.map((e) => `${designationOf(e.doc)} (${e.doc.titel})`).join('; ');
  const reasoning = [
    `${planning.length === 1 ? 'Ett dokument' : 'Dokument'} i riksdagens register visar att åtgärden pågår: ${list(planning)}.`,
    full
      ? planning.length === 1
        ? 'Dokumentet behandlar hela löftet.'
        : 'Minst ett av dokumenten behandlar hela löftet.'
      : planning.length === 1
        ? 'Dokumentet behandlar bara en del av löftet.'
        : 'Dokumenten behandlar bara delar av löftet.',
    decided.length > 0
      ? `Riksdagen har även fattat beslut i ${list(decided)}, men ingen SFS-författning är kopplad till löftet, så det bedöms inte som uppfyllt.`
      : 'Ingen SFS-författning är kopplad till löftet, så det bedöms inte som uppfyllt.',
  ].join(' ');

  return {
    evidence,
    verdict: {
      value: 'in_progress',
      assessedBy: 'ai',
      reasoning,
      date: today,
      history: [
        ...promise.verdict.history,
        {
          value: promise.verdict.value,
          reasoning: promise.verdict.reasoning,
          date: promise.verdict.date,
        },
      ],
    },
  };
}
