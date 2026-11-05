/**
 * Scorer interface of the scoring harness (hemsida-vzn). A scorer answers many yes/no questions about one
 * text with a probability each. Add a provider by implementing `Scorer` and registering it in `createScorer`.
 */
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
