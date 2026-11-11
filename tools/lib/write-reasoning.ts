/**
 * Plain-language reasoning for model-set verdicts. apply-links writes a mechanical placeholder (a list
 * of designations); this step replaces it with two or three Swedish sentences a lay reader can follow.
 * The documents themselves are listed in the evidence timeline next to the reasoning, so the text
 * describes them in words ("en proposition i mars 2026") and never repeats designations. Pure helpers;
 * tools/write-reasoning.ts does the model calls and file I/O.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';

export const REASONING_TEMPLATE_VERSION = 'v1';

export const REASONING_INSTRUCTIONS = `Du skriver motiveringen till en bedömning på en svensk granskningssajt som följer upp politiska löften. Läsaren är en vanlig medborgare utan förkunskaper.

Du får ett löfte och de dokument från riksdagens register som hör till det: typ, datum, titel, hur mycket av löftet dokumentet täcker (hela eller delar) och en kort, engelsk anteckning om vad dokumentet innehåller. Bedömningen är redan satt (pågår: åtgärden är under beredning eller beslutad, men ingen författning är kopplad till löftet). Din uppgift är bara att motivera den.

Skriv två eller tre korta meningar på klarspråk:
1. Vad som hänt hittills, i tidsordning och med egna ord (till exempel "Regeringen lade i mars 2026 fram ett förslag om ..."; "Riksdagen beslutade i maj 2025 att ...").
2. Vad som täcks och vad som återstår eller saknas, om dokumenten bara täcker en del av löftet.

Regler:
- Nämn inga dokumentbeteckningar, dokument-id, SOU- eller propositionsnummer. Beskriv dokumenten med ord och datum; de listas i tidslinjen bredvid.
- Påstå inget som dokumenten och anteckningarna inte visar. Skriv inte att något är genomfört eller i kraft om det inte framgår. Gissa inte.
- Skriv inga varningar och inga reservationer om att fler dokument kan finnas.
- Skriv inte "AI" och inte "bedömningen". Inga rubriker, inga punktlistor, ingen värdering av om löftet är bra eller dåligt.
- Högst 450 tecken.`;

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
  relevance: 'full' | 'partial';
  /** The judge's English note on what the document says (may be empty). */
  note: string;
}

const KIND_SV: Record<string, string> = {
  dir: 'kommittédirektiv',
  sou: 'statlig utredning (SOU)',
  ds: 'departementspromemoria (Ds)',
  prop: 'proposition',
  bet: 'riksdagens betänkande (beslut)',
};

export function buildReasoningPrompt(
  promise: { title: string; description: string },
  items: readonly ReasoningItem[],
): string {
  const docs = items
    .map(
      (i, n) =>
        `${n + 1}. ${KIND_SV[i.kind] ?? i.kind}, ${i.date}: "${i.title}". Täcker ${i.relevance === 'full' ? 'hela löftet' : 'en del av löftet'}. Anteckning: ${i.note || '(saknas)'}`,
    )
    .join('\n');
  return `Löfte: ${promise.title}\n${promise.description}\n\nDokument:\n${docs}`;
}

export function reasoningKey(model: string, prompt: string): string {
  return createHash('sha256')
    .update(JSON.stringify([model, REASONING_TEMPLATE_VERSION, REASONING_INSTRUCTIONS, prompt]))
    .digest('hex');
}

/** Rejects text that name-drops documents or breaks the rules the prompt sets. */
export function reasoningProblems(text: string, designations: readonly string[]): string[] {
  const problems: string[] = [];
  for (const d of designations) if (text.includes(d)) problems.push(`names ${d}`);
  if (/\b(Prop\.|Bet\.|SOU|Dir\.|Ds)\s?\d{4}/.test(text)) problems.push('names a designation');
  if (/\bAI\b|AI-modell/.test(text)) problems.push('mentions AI');
  if (/fler dokument|kan finnas/i.test(text)) problems.push('adds a completeness caveat');
  if (text.length > 600) problems.push('too long');
  return problems;
}
