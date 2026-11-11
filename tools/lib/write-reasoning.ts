/**
 * Plain-language reasoning for model-set verdicts. apply-links writes a mechanical placeholder (a list
 * of designations); this step replaces it with two or three Swedish sentences a lay reader can follow.
 * The documents themselves are listed in the evidence timeline next to the reasoning, so the text
 * describes them in words ("en proposition i mars 2026") and never repeats designations. Pure helpers;
 * tools/write-reasoning.ts does the model calls and file I/O.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';

export const REASONING_TEMPLATE_VERSION = 'v3';

export const REASONING_INSTRUCTIONS = `Du skriver motiveringen till en bedömning på en svensk granskningssajt som följer upp politiska löften. Läsaren är en vanlig medborgare utan förkunskaper.

Du får ett löfte och de dokument från riksdagens register som hör till det: typ, datum, titel, hur mycket av löftet dokumentet täcker (hela eller delar) och en kort, engelsk anteckning om vad dokumentet innehåller. Bedömningen är redan satt (pågår: åtgärden är under beredning eller beslutad, men ingen författning är kopplad till löftet). Din uppgift är bara att motivera den.

Skriv två eller tre korta meningar på klarspråk:
1. Vad som hänt hittills, i tidsordning och med egna ord (till exempel "Regeringen lade i mars 2026 fram ett förslag om ..."; "Riksdagen beslutade i maj 2025 att ...").
2. Vad som täcks och vad som återstår eller saknas, om dokumenten bara täcker en del av löftet.

Regler:
- Nämn inga dokumentbeteckningar, dokument-id, SOU- eller propositionsnummer. Beskriv dokumenten med ord och datum; de listas i tidslinjen bredvid.
- Du ser bara de dokument som har kopplats till löftet, inte alla dokument som finns. Att ett beslut, en lag eller ett förslag inte nämns betyder alltså inte att det saknas. Skriv därför aldrig att något "inte har beslutats", "inte antagits", "ännu inte lagts fram" eller att "inga beslut" finns. Skriv inte heller att riksdagen "ska ta ställning", "ska behandla" eller "väntar på beslut" och inte att något är "på väg": du vet inte vad som hänt efter de angivna dokumenten. Du får skriva att just de angivna dokumenten visar förslag men inget beslut ("dokumenten visar förslag, inget beslut"), men aldrig att inget beslut finns. Beskriv bara vad de angivna dokumenten visar och vilka delar av löftet de täcker; om delar av löftet inte nämns i dokumenten, skriv att dokumenten inte tar upp dem ("nämns inte i dokumenten").
- Påstå inget som dokumenten och anteckningarna inte visar. Skriv inte att något är genomfört eller i kraft om det inte framgår. Gissa inte.
- Skriv inga varningar och inga reservationer om att fler dokument kan finnas.
- Skriv inte "AI" och inte "bedömningen". Inga rubriker, inga punktlistor, ingen värdering av om löftet är bra eller dåligt.
- Högst 450 tecken.`;

/**
 * Added to the instructions only for a promise with a document that works against it
 * (relevance `contradicts`, "Motverkar"), so the cached texts of every other promise stay valid.
 * Worded to pass reasoningProblems: it steers away from "inte"/"ej" constructions.
 */
export const AGAINST_INSTRUCTIONS = `

Ett eller flera dokument är markerade "Motverkar löftet". Det betyder att dokumentet föreslår eller beslutar något som går åt motsatt håll eller försvårar det som löftet gäller. Det räknas inte som ett steg framåt och påverkar inte bedömningen. Beskriv det i en egen mening med orden "motverkar löftet" eller "går åt motsatt håll", med datum och vad dokumentet föreslår (till exempel "Ett förslag i november 2025 motverkar löftet genom att ..."). Använd de andra dokumenten för vad som hänt hittills. Skriv aldrig att löftet är brutet eller svikit. Max 550 tecken i så fall.`;

/**
 * Added for a promise whose verdict rests on a law (SFS entry). The text for plain in_progress
 * promises without a law is unchanged, so their cached texts stay valid. The date of an SFS entry is
 * the day the law enters into force.
 */
const LAW_INSTRUCTIONS: Record<string, string> = {
  fulfilled: `

Bedömningen är i det här fallet satt till uppfyllt: en lag (SFS) har beslutats och trätt i kraft och genomför löftet i sin helhet. Det går före beskrivningen av bedömningen ovan. Beskriv vad lagen innebär och skriv att lagen trädde i kraft på det angivna datumet ("Lagen som genomför löftet trädde i kraft den 1 juli 2026"). Nämn inget lagnummer.`,
  partially_fulfilled: `

Bedömningen är i det här fallet satt till delvis uppfyllt: en lag (SFS) har trätt i kraft men genomför bara en del av löftet eller en svagare variant av det. Det går före beskrivningen av bedömningen ovan. Beskriv vad lagen innebär och när den trädde i kraft, och med hjälp av anteckningen vad den täcker och vad den inte täcker av det som löftet gäller. Nämn inget lagnummer.`,
  in_progress: `

En lag (SFS) som hör till löftet är beslutad men har ännu inte trätt i kraft. Skriv att lagen är beslutad och att den träder i kraft på det angivna datumet. Skriv inte att den gäller eller har trätt i kraft. Nämn inget lagnummer.`,
};

/**
 * The system prompt for a promise: the base instructions plus the extra rules when needed. A law in
 * force (SFS date on or before `today`) is what makes fulfilled / partially_fulfilled; a law that is
 * decided but not yet in force adds a note to in_progress.
 */
export function reasoningInstructions(
  items: readonly ReasoningItem[],
  verdict: string = 'in_progress',
  today: string = todayIso(),
): string {
  let out = REASONING_INSTRUCTIONS;
  if (items.some((i) => i.relevance === 'contradicts')) out += AGAINST_INSTRUCTIONS;
  const laws = items.filter((i) => i.kind === 'sfs');
  if (verdict === 'fulfilled' || verdict === 'partially_fulfilled') {
    out += LAW_INSTRUCTIONS[verdict];
  } else if (laws.some((i) => i.date > today)) {
    out += LAW_INSTRUCTIONS.in_progress;
  }
  return out;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export const reasoningSchema = z.strictObject({ reasoning: z.string().min(20).max(700) });
export const REASONING_JSON_SCHEMA = {
  type: 'object',
  properties: { reasoning: { type: 'string' } },
  required: ['reasoning'],
  additionalProperties: false,
} as const;

export interface ReasoningItem {
  kind: string;
  date: string;
  title: string;
  relevance: 'full' | 'partial' | 'contradicts';
  /** How far along the document is: a betänkande is only a decision when `definitive`. */
  stage?: 'definitive' | 'preparatory' | 'background';
  /** The judge's English note on what the document says (may be empty). */
  note: string;
}

const KIND_SV: Record<string, string> = {
  dir: 'kommittédirektiv',
  sou: 'statlig utredning (SOU)',
  ds: 'departementspromemoria (Ds)',
  prop: 'proposition',
  bet: 'riksdagens betänkande (beslut)',
  sfs: 'lag (SFS)',
};

const RELEVANCE_SV = {
  full: 'Täcker hela löftet',
  partial: 'Täcker en del av löftet',
  contradicts: 'Motverkar löftet',
} as const;

function kindLabel(i: ReasoningItem): string {
  if (i.kind === 'bet') {
    return i.stage === 'definitive' ? 'riksdagens betänkande (beslut)' : 'riksdagens betänkande';
  }
  return KIND_SV[i.kind] ?? i.kind;
}

/** The date of a law is its in-force date, so it is labelled as such; other dates are plain. */
function dateLabel(i: ReasoningItem, today: string): string {
  if (i.kind !== 'sfs') return i.date;
  return `${i.date <= today ? 'trädde i kraft' : 'träder i kraft'} ${i.date}`;
}

/** True when an SFS item is already in force on `today`. */
export function hasLawInForce(
  items: readonly ReasoningItem[],
  today: string = todayIso(),
): boolean {
  return items.some((i) => i.kind === 'sfs' && i.date <= today);
}

export function buildReasoningPrompt(
  promise: { title: string; description: string },
  items: readonly ReasoningItem[],
  today: string = todayIso(),
): string {
  const docs = items
    .map(
      (i, n) =>
        `${n + 1}. ${kindLabel(i)}, ${dateLabel(i, today)}: "${i.title}". ${RELEVANCE_SV[i.relevance]}. Anteckning: ${i.note || '(saknas)'}`,
    )
    .join('\n');
  return `Löfte: ${promise.title}\n${promise.description}\n\nDokument:\n${docs}`;
}

export function reasoningKey(
  model: string,
  prompt: string,
  instructions: string = REASONING_INSTRUCTIONS,
): string {
  return createHash('sha256')
    .update(JSON.stringify([model, REASONING_TEMPLATE_VERSION, instructions, prompt]))
    .digest('hex');
}

const NOT_DECIDED_CLAIM =
  /(inte|ännu inte|aldrig)\s+(har\s+)?(ännu\s+)?(beslutat|beslutats|antagit|antagits|fattat|lagts fram|lagt fram|biträtt|biföllit|biföllits|genomförts|genomfört)|inga\s+(beslut|förslag|författningar)|saknar\s+(beslut|förslag)|(inte|ej)\s+(ännu\s+)?(klart|beslutad|antagen)|\bingen\s+(lag|författning)\s+(har|finns)|ska\s+(ännu\s+)?(ta\s+ställning|behandla[sr]?|besluta[sr]?|prövas|avgöras)|väntar\s+(ännu\s+)?på|inväntar|\bhar\s+ännu\s+inte|\bännu\s+inte\s+(klart|avgjort)|återstår\s+(att\s+)?(besluta|fatta|anta)|\b(kvar|är)\s+(att\s+)?(besluta|behandla)/i;
/** What an investigation was told to do ("utredaren ska ta ställning till") is not a pending decision. */
const MANDATE_CLAUSE =
  /(^|[,;]\s+)((?:men|och)\s+)?((?:utredning(?:en|arna)?|utredare(?:n)?|utredarna|kommitté(?:n|erna)?|uppdraget|direktivet)\s+ska\s+(?:ännu\s+)?(?:ta\s+ställning|behandla|besluta)\b)/gi;
const NO_DECISION_NOUN = /\b(inte|ej)\s+(något|ett)\s+beslut|\binget\s+beslut/i;

const IN_FORCE_CLAIM =
  /\btr[äa]dde\s+i\s+kraft|\bhar\s+trätt\s+i\s+kraft|\bgäller\s+sedan|\bär\s+i\s+kraft|\bi\s+kraft\s+sedan/i;

/**
 * Rejects text that name-drops documents or breaks the rules the prompt sets. `lawInForce` says that
 * an SFS item with an in-force date on or before today is among the evidence; only then may the text
 * say that something is or became in force.
 */
export function reasoningProblems(
  text: string,
  designations: readonly string[],
  lawInForce = false,
): string[] {
  const problems: string[] = [];
  for (const d of designations) if (text.includes(d)) problems.push(`names ${d}`);
  if (/\b(Prop\.|Bet\.|SOU|Dir\.|Ds)\s?\d{4}/.test(text)) problems.push('names a designation');
  if (/\bSFS\s?\d{4}:\d+/.test(text)) problems.push('names an SFS designation');
  if (!lawInForce && IN_FORCE_CLAIM.test(text)) problems.push('claims a law is in force');
  if (/\bAI\b|AI-modell/.test(text)) problems.push('mentions AI');
  if (/fler dokument|kan finnas/i.test(text)) problems.push('adds a completeness caveat');
  // The model only sees linked documents, so it cannot know that nothing else was decided or proposed.
  // A sentence that is explicitly about the listed documents may say they show no decision.
  const aboutListedDocuments = /\bdokument(en|et)?\b/i;
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const claim = sentence.replace(MANDATE_CLAUSE, '$1');
    if (NOT_DECIDED_CLAIM.test(claim)) {
      problems.push('claims something was not decided or proposed');
      break;
    }
    if (NO_DECISION_NOUN.test(sentence) && !aboutListedDocuments.test(sentence)) {
      problems.push('claims there is no decision');
      break;
    }
  }
  if (text.length > 600) problems.push('too long');
  return problems;
}
