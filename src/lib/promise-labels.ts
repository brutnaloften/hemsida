import type { PROMISE_TYPES, PARTIES, EVIDENCE_KINDS, VERDICTS } from '@/schema/promise';

type Party = (typeof PARTIES)[number];
type PromiseType = (typeof PROMISE_TYPES)[number];
type EvidenceKind = (typeof EVIDENCE_KINDS)[number];
type VerdictValue = (typeof VERDICTS)[number];

/** Full Swedish party names. */
export const PARTY_NAMES: Record<Party, string> = {
  S: 'Socialdemokraterna',
  M: 'Moderaterna',
  SD: 'Sverigedemokraterna',
  C: 'Centerpartiet',
  V: 'Vänsterpartiet',
  KD: 'Kristdemokraterna',
  L: 'Liberalerna',
  MP: 'Miljöpartiet',
};

/** Swedish labels for promise types. */
export const TYPE_LABELS: Record<PromiseType, string> = {
  legislative: 'Lagförslag',
  inquiry: 'Utredning',
  budget: 'Budget',
  outcome: 'Resultatmål',
  other_action: 'Annan åtgärd',
  vague: 'Vagt löfte',
};

/** Swedish labels for evidence document kinds. */
export const EVIDENCE_KIND_LABELS: Record<EvidenceKind, string> = {
  dir: 'Direktiv',
  sou: 'SOU',
  ds: 'Ds',
  prop: 'Proposition',
  bet: 'Betänkande',
  sfs: 'Lag (SFS)',
  mot: 'Motion',
};

/**
 * Visual treatment per verdict. Unassessed and no_evidence are deliberately
 * neutral (dashed, grey) so they never read as a finding.
 */
export const VERDICT_STYLES: Record<VerdictValue, string> = {
  unassessed: 'border-dashed border-muted-foreground/50 bg-transparent text-muted-foreground',
  // text-muted-foreground on bg-muted is 4.4:1 in light mode (below AA); zinc-700 is 9.5:1.
  no_evidence: 'border-dashed border-muted-foreground/50 bg-muted text-zinc-700 dark:text-zinc-300',
  not_assessable: 'border-transparent bg-muted text-zinc-700 dark:text-zinc-300',
  in_progress: 'border-transparent bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200',
  fulfilled: 'border-transparent bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200',
  partially_fulfilled:
    'border-transparent bg-lime-100 text-lime-900 dark:bg-lime-950 dark:text-lime-200',
  unfulfilled:
    'border-transparent bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200',
  abandoned: 'border-transparent bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  broken: 'border-transparent bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200',
};

export function partyName(code: string): string {
  return PARTY_NAMES[code as Party] ?? code;
}
