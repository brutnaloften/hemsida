/**
 * Pure helpers for the promise page: the "Vad har hänt?" timeline steps, the sidebar links and the
 * vote table. No Astro or React imports so they can be unit-tested with fixtures.
 */
import {
  PARTIES,
  agreementName,
  isRiksdagEvidence,
  type AgreementEvidence,
  type BudgetEvidence,
  type Evidence,
  type PromiseRecord,
  type RiksdagEvidence,
  type Source,
  type VoteValue,
} from '@/schema/promise';

/** Riksdag pipeline stages in order. `sou` and `ds` share one stage; `mot` sits outside it. */
export const PIPELINE_STAGES = ['dir', 'utredning', 'prop', 'bet', 'sfs'] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export function stageOf(kind: RiksdagEvidence['kind']): PipelineStage | 'mot' {
  if (kind === 'sou' || kind === 'ds') return 'utredning';
  return kind;
}

/** Shown for a pipeline stage with no linked document. States absence of a link, nothing more. */
export const MISSING_LABELS: Record<PipelineStage, string> = {
  dir: 'Inget direktiv kopplat ännu',
  utredning: 'Ingen utredning (SOU/Ds) kopplad ännu',
  prop: 'Ingen proposition kopplad ännu',
  bet: 'Inget betänkande kopplat ännu',
  sfs: 'Ingen lag (SFS) kopplad ännu',
};

export type TimelineStep =
  | {
      type: 'promise';
      /** E.g. "Vallöfte" or "Utfäst i Tidöavtalet". */
      label: string;
      date: string | undefined;
      sourceTitle: string | undefined;
      page: number | undefined;
    }
  | { type: 'agreement'; evidence: AgreementEvidence }
  | { type: 'document'; stage: PipelineStage | 'mot'; evidence: RiksdagEvidence }
  | { type: 'budget'; evidence: BudgetEvidence }
  | { type: 'missing'; stage: PipelineStage; label: string };

function promiseLabel(source: Source | undefined): string {
  if (!source) return 'Utfäst';
  if (source.kind === 'manifesto') return 'Vallöfte';
  if (source.kind === 'government_agreement') return `Utfäst i ${agreementName(source)}`;
  return 'Utfäst';
}

const byDate = (a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date);

/**
 * Builds the timeline: the promise itself, the agreement entry when present, then the Riksdag
 * pipeline in stage order (a dashed "missing" step for every stage without a document), then
 * motions and budget entries by date. Never invents steps from the verdict.
 */
export function buildTimelineSteps(
  promise: Pick<PromiseRecord, 'source' | 'evidence'>,
  source: Source | undefined,
): TimelineStep[] {
  const steps: TimelineStep[] = [
    {
      type: 'promise',
      label: promiseLabel(source),
      date: source?.date,
      sourceTitle: source?.title,
      page: promise.source.page,
    },
  ];
  const agreements = promise.evidence
    .filter((e): e is AgreementEvidence => e.kind === 'agreement')
    .sort(byDate);
  for (const evidence of agreements) steps.push({ type: 'agreement', evidence });

  const docs = promise.evidence.filter(isRiksdagEvidence).sort(byDate);
  for (const stage of PIPELINE_STAGES) {
    const inStage = docs.filter((d) => stageOf(d.kind) === stage);
    if (inStage.length === 0) steps.push({ type: 'missing', stage, label: MISSING_LABELS[stage] });
    for (const evidence of inStage) steps.push({ type: 'document', stage, evidence });
  }

  const tail: { date: string; step: TimelineStep }[] = [
    ...docs
      .filter((d) => d.kind === 'mot')
      .map((evidence) => ({
        date: evidence.date,
        step: { type: 'document', stage: 'mot', evidence } as TimelineStep,
      })),
    ...promise.evidence
      .filter((e): e is BudgetEvidence => e.kind === 'budget')
      .map((evidence) => ({
        date: evidence.date,
        step: { type: 'budget', evidence } as TimelineStep,
      })),
  ].sort(byDate);
  for (const t of tail) steps.push(t.step);
  return steps;
}

const REPO = 'https://github.com/brutnaloften/hemsida';

/** Prefilled GitHub issue for "Föreslå en källa". */
export function suggestSourceUrl(promise: Pick<PromiseRecord, 'id' | 'title'>): string {
  const params = new URLSearchParams({
    title: `Källa till löftet: ${promise.title}`,
    body: `Löfte: ${promise.id}\n\nLänk till dokument (riksdagen.se eller data.riksdagen.se):\n\nVarför hör det till löftet:\n`,
  });
  return `${REPO}/issues/new?${params.toString()}`;
}

/** GitHub history of the promise file: every assessment change is a commit there. */
export function historyUrl(term: string | undefined, id: string): string | undefined {
  return term ? `${REPO}/commits/main/src/data/${term}/promises/${id}.json` : undefined;
}

interface Linkable {
  id: string;
  title: string;
  parties: readonly string[];
  evidence: readonly Evidence[];
}

/**
 * Promises of other parties that the agreement links to the same agreement point as this promise
 * (e.g. two parties' manifesto promises that both fed into one Tidöavtalet point). `reverse` maps
 * an agreement point id to the promises linking to it (see buildReverseIndex). Only promises with
 * at least one party this promise lacks count. Empty means the page omits the block.
 */
export function relatedFromOtherParties<T extends Linkable>(
  promise: T,
  reverse: ReadonlyMap<string, readonly T[]>,
): T[] {
  const found = new Map<string, T>();
  for (const e of promise.evidence) {
    if (e.kind !== 'agreement') continue;
    for (const point of e.promises) {
      for (const p of reverse.get(point) ?? []) found.set(p.id, p);
    }
  }
  found.delete(promise.id);
  return [...found.values()]
    .filter((p) => p.parties.some((party) => !promise.parties.includes(party)))
    .sort((a, b) => a.title.localeCompare(b.title, 'sv'));
}

export const VOTE_LABELS: Record<VoteValue, string> = {
  yes: 'Ja',
  no: 'Nej',
  abstain: 'Avstår',
  absent: 'Frånvarande',
};

/** Vote rows in fixed party order; parties without a recorded vote are left out. */
export function voteRows(votes: Partial<Record<(typeof PARTIES)[number], VoteValue>>): {
  party: (typeof PARTIES)[number];
  vote: VoteValue;
  label: string;
}[] {
  return PARTIES.flatMap((party) => {
    const vote = votes[party];
    return vote ? [{ party, vote, label: VOTE_LABELS[vote] }] : [];
  });
}
