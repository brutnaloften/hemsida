/**
 * Judge interface of the linker (hemsida-4np.5). A judge reads one promise and the evidence text of one
 * document and answers with a relevance label, a document stage, a confidence and a reason. Add a provider by
 * implementing `Judge` and registering it in `createJudge`. Nothing here sets a verdict: judgements are
 * proposals for human review.
 */
import { query } from '@anthropic-ai/claude-agent-sdk';
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { evalLabelSchema, evalStageSchema } from '../../../src/schema/eval.ts';
import { createClient, isTransientApiError } from '../claude.ts';
import type { ClaudeResult } from '../score/scorer.ts';
import { confidenceSchema } from './config.ts';

export const judgementSchema = z.strictObject({
  label: evalLabelSchema,
  stage: evalStageSchema,
  confidence: confidenceSchema,
  reason: z.string().min(1),
});
export type Judgement = z.infer<typeof judgementSchema>;

/** The same shape as JSON schema for the structured-output options of the claude and api judges. */
export const JUDGEMENT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    label: { type: 'string', enum: evalLabelSchema.options },
    stage: { type: 'string', enum: evalStageSchema.options },
    confidence: { type: 'string', enum: confidenceSchema.options },
    reason: { type: 'string' },
  },
  required: ['label', 'stage', 'confidence', 'reason'],
  additionalProperties: false,
} as const;

export interface JudgeInput {
  instructions: string;
  promise: { title: string; text: string };
  /** The document's evidence text (header, tier-1 sections, optional brief passages). */
  evidence: string;
}
export interface JudgeResult {
  judgement: Judgement;
  /** All tokens of the call (input, output and cache), for the estimate-based guard and reporting. */
  tokens: number;
  /** Cost the provider reported (Agent SDK costUSD); absent when it does not, then the flat price applies. */
  cost_usd?: number;
}

/** An error from a judge call carrying the HTTP status when known, so the runner can tell transient ones. */
export class JudgeError extends Error {
  status: number | null | undefined;
  constructor(message: string, status?: number | null) {
    super(message);
    this.name = 'JudgeError';
    this.status = status;
  }
}

/** Rate limits, overload and server errors: skip the request and go on, a re-run retries it. */
export function isTransientJudgeError(err: unknown): boolean {
  if (isTransientApiError(err)) return true;
  if (err instanceof JudgeError && typeof err.status === 'number') {
    return err.status === 429 || err.status === 529 || err.status >= 500;
  }
  return false;
}
export interface Judge {
  kind: string;
  judge(input: JudgeInput): Promise<JudgeResult>;
}

export const promiseBlock = (p: JudgeInput['promise']): string =>
  `Promise\nTitle: ${p.title}\n${p.text}`;
export const evidenceBlock = (evidence: string): string => `Document evidence:\n\n${evidence}`;

/** The parts of an Agent SDK result the claude judge reads (structural, so tests need no SDK). */
export type ClaudeJudgeResult = Pick<
  ClaudeResult,
  | 'subtype'
  | 'is_error'
  | 'api_error_status'
  | 'result'
  | 'errors'
  | 'structured_output'
  | 'modelUsage'
  | 'usage'
>;

export function parseClaudeJudgement(message: ClaudeJudgeResult): JudgeResult {
  if (message.subtype !== 'success' || message.is_error) {
    const detail = message.result ?? message.errors?.join('; ') ?? 'no detail';
    throw new JudgeError(
      `claude: ${message.subtype} (status ${message.api_error_status ?? '-'}): ${detail}`,
      message.api_error_status,
    );
  }
  const parsed = judgementSchema.safeParse(message.structured_output);
  if (!parsed.success) {
    throw new Error(`claude: structured_output does not match the schema: ${parsed.error.message}`);
  }
  // Sum every token category: with prompt caching `usage.input_tokens` alone undercounts (see scorer.ts).
  const usages = Object.values(message.modelUsage);
  const tokens = usages.length
    ? usages.reduce(
        (s, u) =>
          s + u.inputTokens + u.outputTokens + u.cacheReadInputTokens + u.cacheCreationInputTokens,
        0,
      )
    : message.usage.input_tokens;
  const costs = usages.map((u) => (u as { costUSD?: unknown }).costUSD);
  const cost_usd =
    costs.length && costs.every((c) => typeof c === 'number')
      ? (costs as number[]).reduce((a, b) => a + b, 0)
      : undefined;
  return { judgement: parsed.data, tokens, ...(cost_usd === undefined ? {} : { cost_usd }) };
}

/**
 * Runs the judgement through a local Claude Code login (`claude login`, a Pro/Max subscription) via the Agent
 * SDK, not a billed API key. `model` is any Agent SDK alias or id ('haiku', 'sonnet', 'opus', ...).
 */
export function createClaudeJudge(model: string): Judge {
  return {
    kind: 'claude',
    async judge(input) {
      const prompt = `${promiseBlock(input.promise)}\n\n${evidenceBlock(input.evidence)}`;
      for await (const message of query({
        prompt,
        options: {
          model,
          settingSources: [], // no CLAUDE.md / project settings bleeding into the prompt
          tools: [],
          maxTurns: 1,
          thinking: { type: 'disabled' },
          systemPrompt: input.instructions,
          outputFormat: { type: 'json_schema', schema: JUDGEMENT_JSON_SCHEMA },
        },
      })) {
        if (message.type !== 'result') continue;
        return parseClaudeJudgement(message);
      }
      throw new Error('claude: query() ended without a result message');
    },
  };
}

/** Pull the judgement out of a Messages API response that was forced to call the `judgement` tool. */
export function parseApiJudgement(message: {
  content: Array<{ type: string; name?: string; input?: unknown }>;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  };
}): JudgeResult {
  const block = message.content.find((b) => b.type === 'tool_use' && b.name === 'judgement');
  const parsed = judgementSchema.safeParse(block?.input);
  if (!parsed.success) {
    throw new Error(`api: no valid judgement in the response: ${parsed.error.message}`);
  }
  const u = message.usage;
  return {
    judgement: parsed.data,
    tokens:
      u.input_tokens +
      u.output_tokens +
      (u.cache_read_input_tokens ?? 0) +
      (u.cache_creation_input_tokens ?? 0),
  };
}

/**
 * Billed Messages API (needs ANTHROPIC_API_KEY). The promise goes in its own cached block ahead of the
 * document evidence, so judging many documents against one promise reuses the prompt prefix.
 */
export function createApiJudge(model: string, client?: Anthropic): Judge {
  return {
    kind: 'api',
    async judge(input) {
      const response = await (client ??= createClient()).messages.create({
        model,
        max_tokens: 1024,
        system: input.instructions,
        tools: [
          {
            name: 'judgement',
            description: 'Record the judgement of this promise/document pair.',
            input_schema: JUDGEMENT_JSON_SCHEMA as unknown as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: 'tool', name: 'judgement' },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: promiseBlock(input.promise),
                cache_control: { type: 'ephemeral' },
              },
              { type: 'text', text: evidenceBlock(input.evidence) },
            ],
          },
        ],
      });
      return parseApiJudgement(response);
    },
  };
}

const words = (s: string): string[] => s.toLowerCase().match(/[\p{L}\p{N}]{5,}/gu) ?? [];

/**
 * Deterministic offline judge for tests and `--judge fake` smoke runs: relevance from the share of the
 * promise's words (5+ letters) found in the evidence, stage from the document type in the evidence header.
 */
export function createFakeJudge(charsPerToken = 3): Judge {
  return {
    kind: 'fake',
    async judge(input) {
      const ws = [...new Set(words(`${input.promise.title} ${input.promise.text}`))];
      const have = new Set(words(input.evidence));
      const share = ws.length ? ws.filter((w) => have.has(w)).length / ws.length : 0;
      const doktyp = /^Typ: (\S+)/m.exec(input.evidence)?.[1] ?? '';
      const stage = doktyp === 'bet' ? 'definitive' : doktyp ? 'preparatory' : 'background';
      const label = share >= 0.5 ? 'match' : share >= 0.25 ? 'partial' : 'no_match';
      const chars = input.instructions.length + input.evidence.length + input.promise.text.length;
      return {
        judgement: {
          label,
          stage,
          confidence: share >= 0.5 || share < 0.1 ? 'high' : 'medium',
          reason: `fake judge: ${Math.round(share * 100)}% of the promise words occur in the evidence`,
        },
        tokens: Math.ceil(chars / charsPerToken),
      };
    },
  };
}

export function createJudge(
  kind: string,
  model: string,
  env: Record<string, string | undefined> = process.env,
): Judge {
  if (kind === 'fake') return createFakeJudge();
  if (kind === 'claude') {
    if (env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN) {
      throw new Error(
        'ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN is set; the claude judge runs through the local subscription login ' +
          '(claude login), not a billed API key — unset it before running (or use the api judge on purpose)',
      );
    }
    return createClaudeJudge(model);
  }
  if (kind === 'api') {
    if (!env.ANTHROPIC_API_KEY)
      throw new Error('the api judge needs ANTHROPIC_API_KEY (billed per token)');
    return createApiJudge(model);
  }
  throw new Error(`unknown judge kind: ${kind}`);
}

/** The judge for a run. A dry run never calls it, so it needs no credentials: it gets a stand-in. */
export function judgeFor(
  kind: string,
  model: string,
  dryRun: boolean,
  env: Record<string, string | undefined> = process.env,
): Judge {
  if (!dryRun) return createJudge(kind, model, env);
  return {
    kind,
    judge: async () => {
      throw new Error('a dry run must not call the judge');
    },
  };
}
