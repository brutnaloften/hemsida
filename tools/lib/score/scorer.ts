/**
 * Scorer interface of the scoring harness (hemsida-vzn). A scorer answers many yes/no questions about one
 * text with a probability each. Add a provider by implementing `Scorer` and registering it in `createScorer`.
 */
import { query } from '@anthropic-ai/claude-agent-sdk';
import { askJev, JevError } from '../jev.ts';

export interface ScoreResult {
  /** Probability (0..1) per question id. */
  answers: Record<string, number>;
  input_tokens: number;
}

export interface Scorer {
  kind: string;
  score(state: string, questions: Record<string, string>): Promise<ScoreResult>;
}

/** The scorer rejected the request as too long; the runner splits the state in half and retries. */
export class TooLongError extends Error {
  constructor(message = 'request too long') {
    super(message);
  }
}

export function createJevScorer(token: string, model: string): Scorer {
  return {
    kind: 'jev',
    async score(state, questions) {
      const qs = Object.fromEntries(
        Object.entries(questions).map(([id, instructions]) => [
          id,
          { type: 'noul' as const, instructions },
        ]),
      );
      try {
        const res = await askJev(token, state, qs, model);
        return {
          answers: Object.fromEntries(Object.entries(res.answers).map(([k, a]) => [k, a.noul])),
          input_tokens: res.usage.input_tokens,
        };
      } catch (err) {
        if (err instanceof JevError && err.tooLong) throw new TooLongError(err.message);
        throw err;
      }
    },
  };
}

/**
 * Runs the question through a local Claude Code login (`claude login`, a Pro/Max subscription) via the
 * Claude Agent SDK, instead of a billed API key. `model` is any Agent SDK model alias or id ('haiku',
 * 'sonnet', 'claude-haiku-5-5', ...). See docs/scoring-harness.md for why: this is noticeably slower and
 * more token-hungry per request than `jev` (Haiku spends several thousand tokens "thinking" per request
 * even with `thinking: {type: 'disabled'}` — that option doesn't appear to take effect through the Agent
 * SDK today), but scored comparably on the eval set (hemsida-vzn spike results).
 */
export function createClaudeScorer(model: string): Scorer {
  return {
    kind: 'claude',
    async score(state, questions) {
      // Promise ids can exceed the Anthropic tool-schema property-name limit (64 chars, e.g.
      // "tido-utredning-utvidgade-mojligheter-aterkalla-uppehallstillstand" is 65), so the schema uses
      // short positional keys and we map back to the real ids ourselves.
      const ids = Object.entries(questions);
      const keyOf = (i: number) => `q${i}`;
      const lines = ids.map(([, q], i) => `- ${keyOf(i)}: ${q}`);
      const prompt =
        `Dokumenttext:\n\n${state}\n\n` +
        `Besvara varje fråga nedan med sannolikheten (0 till 1) att svaret är ja, baserat enbart på texten ovan.\n\n` +
        lines.join('\n');
      const schema = {
        type: 'object',
        properties: Object.fromEntries(
          ids.map((_, i) => [keyOf(i), { type: 'number', minimum: 0, maximum: 1 }]),
        ),
        required: ids.map((_, i) => keyOf(i)),
        additionalProperties: false,
      };

      for await (const message of query({
        prompt,
        options: {
          model,
          settingSources: [], // no CLAUDE.md / project settings bleeding into the scoring prompt
          allowedTools: [], // pure completion, no tool use
          maxTurns: 1,
          thinking: { type: 'disabled' },
          systemPrompt:
            'Du svarar bara med strukturerad JSON enligt schemat. Inga verktyg, inga förklaringar.',
          outputFormat: { type: 'json_schema', schema },
        },
      })) {
        if (message.type !== 'result') continue;
        if (message.subtype !== 'success') {
          if (
            message.subtype === 'error_max_turns' ||
            message.subtype === 'error_during_execution'
          ) {
            throw new TooLongError(`claude: ${message.subtype}`);
          }
          throw new Error(`claude: ${message.subtype}`);
        }
        const out = message.structured_output;
        if (!out || typeof out !== 'object') throw new Error('claude: no structured_output');
        const byKey = out as Record<string, number>;
        const answers = Object.fromEntries(ids.map(([id], i) => [id, byKey[keyOf(i)]!]));
        // `usage.input_tokens` alone drastically undercounts once prompt caching kicks in (seen as low
        // as single digits in testing) because most of the prompt lands in cache_read/cache_creation
        // instead; sum every category `modelUsage` tracks so the harness's cost/budget accounting (which
        // multiplies this by `budget.usd_per_million_tokens`) reflects the real request size.
        const usage = Object.values(message.modelUsage)[0];
        const tokens = usage
          ? usage.inputTokens +
            usage.outputTokens +
            usage.cacheReadInputTokens +
            usage.cacheCreationInputTokens
          : message.usage.input_tokens;
        return { answers, input_tokens: tokens };
      }
      throw new Error('claude: query() ended without a result message');
    },
  };
}

const words = (s: string): string[] => s.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? [];

/**
 * Deterministic offline scorer: the fraction of the question's words (4+ letters) that occur in the state.
 * For tests and `--scorer fake` smoke runs. `maxStateChars` makes it reject longer states as too long.
 */
export function createFakeScorer(
  opts: { maxStateChars?: number; charsPerToken?: number } = {},
): Scorer {
  const cpt = opts.charsPerToken ?? 2.8;
  return {
    kind: 'fake',
    async score(state, questions) {
      if (opts.maxStateChars !== undefined && state.length > opts.maxStateChars) {
        throw new TooLongError();
      }
      const haystack = new Set(words(state));
      const answers: Record<string, number> = {};
      let chars = state.length;
      for (const [id, q] of Object.entries(questions)) {
        const ws = [...new Set(words(q))];
        answers[id] = ws.length ? ws.filter((w) => haystack.has(w)).length / ws.length : 0;
        chars += q.length + id.length;
      }
      return { answers, input_tokens: Math.ceil(chars / cpt) };
    },
  };
}

export function createScorer(
  kind: string,
  model: string,
  env: Record<string, string | undefined> = process.env,
): Scorer {
  if (kind === 'fake') return createFakeScorer();
  if (kind === 'jev') {
    const token = env.JEV_TOKEN;
    if (!token) throw new Error('JEV_TOKEN is not set (pnpm score loads .env if present)');
    return createJevScorer(token, model);
  }
  if (kind === 'claude') {
    if (env.ANTHROPIC_API_KEY) {
      throw new Error(
        'ANTHROPIC_API_KEY is set; the claude scorer runs through the local subscription login ' +
          '(claude login), not a billed API key — unset it before running',
      );
    }
    return createClaudeScorer(model);
  }
  throw new Error(`unknown scorer kind: ${kind}`);
}

/** The scorer for a run. A dry run never calls it, so it needs no token: it gets a stand-in that refuses to score. */
export function scorerFor(
  kind: string,
  model: string,
  dryRun: boolean,
  env: Record<string, string | undefined> = process.env,
): Scorer {
  if (!dryRun) return createScorer(kind, model, env);
  return {
    kind,
    score: async () => {
      throw new Error('a dry run must not call the scorer');
    },
  };
}
