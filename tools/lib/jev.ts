/**
 * Minimal client for TypeSafe's System One model Jev (hemsida-4np.12). One request holds one `state` (the
 * text) and many named questions; a yes/no question (`noul`) answers with the probability of yes.
 * Docs: https://docs.typesafe.ai/api. Limits: 64k tokens per request, 32k for state plus the longest question.
 */
const URL = 'https://api.typesafe.ai/v1/systemone';

export interface NoulQuestion {
  type: 'noul';
  instructions: string;
}

export interface JevResponse {
  model: string;
  answers: Record<string, { type: 'noul'; noul: number }>;
  usage: { input_tokens: number; output_tokens: number };
}

export async function askJev(
  token: string,
  state: string,
  questions: Record<string, NoulQuestion>,
  model = 'jev-latest',
): Promise<JevResponse> {
  let delay = 1000;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, state, questions }),
    });
    if (res.ok) return (await res.json()) as JevResponse;
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
      continue;
    }
    throw new JevError(res.status, (await res.text()).slice(0, 300));
  }
}

export class JevError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(status: number, body: string) {
    super(`Jev ${status}: ${body}`);
    this.status = status;
    this.body = body;
  }
  get tooLong(): boolean {
    return this.status === 400 && this.body.includes('max_tokens_exceeded');
  }
}

/** Split paragraphs into chunks of at most `maxChars` characters, never inside a paragraph. */
export function chunkParagraphs(paragraphs: readonly string[], maxChars: number): string[] {
  const chunks: string[] = [];
  let cur = '';
  for (const p of paragraphs) {
    const piece = p.length > maxChars ? p.slice(0, maxChars) : p;
    if (cur && cur.length + piece.length + 1 > maxChars) {
      chunks.push(cur);
      cur = '';
    }
    cur += (cur ? '\n' : '') + piece;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/** Area under the ROC curve: the chance a random positive scores above a random negative (ties count half). */
export function auc(positives: readonly number[], negatives: readonly number[]): number {
  if (!positives.length || !negatives.length) return Number.NaN;
  let wins = 0;
  for (const p of positives) for (const n of negatives) wins += p > n ? 1 : p === n ? 0.5 : 0;
  return wins / (positives.length * negatives.length);
}
