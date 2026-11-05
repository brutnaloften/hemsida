/**
 * Pure, deterministic planning for a scoring run (hemsida-vzn): documents -> chunks, promises -> question
 * batches, one `Request` per (chunk, batch) with a content-hash key. No I/O, no network: the same inputs
 * always give a byte-identical plan, and tokens and cost are estimated before anything is sent.
 *
 * Batch size depends on the largest chunk of the whole run, not on each chunk, so batch boundaries are the
 * same for every chunk and adding a promise only changes the last batch (the cache stays valid for the rest).
 */
import { createHash } from 'node:crypto';
import { chunkParagraphs } from '../jev.ts';
import type { ScoreConfig } from './config.ts';

export interface PlanDocument {
  id: string;
  title: string;
  paragraphs: string[];
}
export interface PlanPromise {
  id: string;
  title: string;
  text: string;
}
export interface Request {
  key: string;
  document_id: string;
  chunk_index: number;
  batch_index: number;
  state: string;
  /** Promise id -> rendered question text. */
  questions: Record<string, string>;
  estimated_input_tokens: number;
  estimated_cost_usd: number;
}
export interface Plan {
  plan_hash: string;
  documents: number;
  promises: number;
  chunks: number;
  batches_per_chunk: number;
  requests: Request[];
  estimated_input_tokens: number;
  estimated_cost_usd: number;
}

/** Characters each question adds beyond its text and id (JSON framing, type field). */
const QUESTION_OVERHEAD_CHARS = 20;

export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}
export const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

export function renderQuestion(template: string, p: PlanPromise): string {
  return template.replace('{title}', () => p.title).replace('{text}', () => p.text);
}

export function renderState(doc: PlanDocument, chunk: string): string {
  return `Dokument: ${doc.title}\n\n${chunk}`;
}

export function requestKey(
  config: Pick<ScoreConfig, 'scorer' | 'question'>,
  state: string,
  questions: Record<string, string>,
): string {
  return sha256(
    stableJson({
      scorer: config.scorer,
      template_version: config.question.template_version,
      state,
      questions,
    }),
  );
}

export function estimateTokens(chars: number, charsPerToken: number): number {
  return Math.ceil(chars / charsPerToken);
}

const questionChars = (id: string, q: string): number =>
  id.length + q.length + QUESTION_OVERHEAD_CHARS;
const byId = (a: { id: string }, b: { id: string }): number =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

export function buildPlan(
  config: ScoreConfig,
  documents: readonly PlanDocument[],
  promises: readonly PlanPromise[],
): Plan {
  const { limits, budget } = config;
  const cpt = limits.chars_per_token;
  const price = budget.usd_per_million_tokens / 1e6;

  const docs = [...documents].sort(byId);
  const sortedPromises = [...promises].sort(byId);
  const rendered = sortedPromises.map(
    (p) => [p.id, renderQuestion(config.question.template, p)] as const,
  );
  const longest = rendered.reduce((m, [id, q]) => Math.max(m, questionChars(id, q)), 0);

  const chunked = docs.map((d) => ({
    doc: d,
    states: chunkParagraphs(d.paragraphs, config.chunk.max_chars).map((c) => renderState(d, c)),
  }));
  const maxStateChars = chunked.reduce(
    (m, c) => c.states.reduce((mm, s) => Math.max(mm, s.length), m),
    0,
  );
  if (estimateTokens(maxStateChars + longest, cpt) > limits.max_state_plus_question_tokens) {
    throw new Error(
      `largest chunk plus longest question exceeds max_state_plus_question_tokens ` +
        `(${limits.max_state_plus_question_tokens}); lower chunk.max_chars`,
    );
  }
  const batchChars = Math.floor(limits.max_request_tokens * cpt) - maxStateChars;
  if (rendered.length && longest > batchChars) {
    throw new Error(
      'no room for a single question under max_request_tokens; lower chunk.max_chars',
    );
  }

  const batches: Array<Array<readonly [string, string]>> = [];
  let cur: Array<readonly [string, string]> = [];
  let curChars = 0;
  for (const entry of rendered) {
    const c = questionChars(entry[0], entry[1]);
    if (cur.length && curChars + c > batchChars) {
      batches.push(cur);
      cur = [];
      curChars = 0;
    }
    cur.push(entry);
    curChars += c;
  }
  if (cur.length) batches.push(cur);

  const requests: Request[] = [];
  let chunks = 0;
  for (const { doc, states } of chunked) {
    for (const [chunkIndex, state] of states.entries()) {
      chunks++;
      for (const [batchIndex, batch] of batches.entries()) {
        const questions = Object.fromEntries(batch);
        const tokens = estimateTokens(
          state.length + batch.reduce((a, [id, q]) => a + questionChars(id, q), 0),
          cpt,
        );
        requests.push({
          key: requestKey(config, state, questions),
          document_id: doc.id,
          chunk_index: chunkIndex,
          batch_index: batchIndex,
          state,
          questions,
          estimated_input_tokens: tokens,
          estimated_cost_usd: tokens * price,
        });
      }
    }
  }
  const estimated_input_tokens = requests.reduce((a, r) => a + r.estimated_input_tokens, 0);
  return {
    plan_hash: sha256(stableJson(requests.map((r) => r.key))),
    documents: docs.length,
    promises: sortedPromises.length,
    chunks,
    batches_per_chunk: batches.length,
    requests,
    estimated_input_tokens,
    estimated_cost_usd: estimated_input_tokens * price,
  };
}
