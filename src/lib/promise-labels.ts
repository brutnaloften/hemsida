import type { PROMISE_TYPES, PARTIES, EVIDENCE_KINDS } from '@/schema/promise';

type Party = (typeof PARTIES)[number];
type PromiseType = (typeof PROMISE_TYPES)[number];
type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

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

export function partyName(code: string): string {
  return PARTY_NAMES[code as Party] ?? code;
}
