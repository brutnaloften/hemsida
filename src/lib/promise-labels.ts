import type { PROMISE_TYPES, PARTIES, EVIDENCE_KINDS, VERDICTS } from '@/schema/promise';

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

/** One-sentence Swedish explanation per verdict value, shown on om-metoden. */
export const VERDICT_DESCRIPTIONS: Record<(typeof VERDICTS)[number], string> = {
  unassessed: 'Löftet har inte bedömts ännu. Det betyder inte att det är uppfyllt eller brutet.',
  no_evidence:
    'Vi har sökt i riksdagens dokument och inte hittat något som visar att arbetet har påbörjats. Motiveringen anger när och vad vi sökte efter.',
  in_progress:
    'Arbetet pågår, till exempel i form av en utredning, ett förslag eller en proposition, men ingen beslutad lag finns ännu.',
  fulfilled:
    'Löftet har genomförts som det formulerades. En beslutad lag räknas, även om den träder i kraft först senare. För löften om en utredning räcker det att utredningen har tillsatts genom ett direktiv; ett senare betänkande visas som underlag men ändrar inte bedömningen.',
  partially_fulfilled:
    'Löftet har genomförts, men i väsentligt snävare eller svagare form än utlovat, eller bara till vissa delar. En beslutad lag räknas, även om den träder i kraft först senare.',
  unfulfilled: 'Mandatperioden gick ut utan att löftet hade genomförts.',
  abandoned: 'De partier som gav löftet har uttryckligen släppt det.',
  broken: 'Partierna har gjort tvärtemot löftet eller röstat emot det.',
  not_assessable: 'Löftet är för vagt för att kunna bedömas.',
};
