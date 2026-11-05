/**
 * Declarative scoring-run config (hemsida-vzn). One committed JSON file under `tools/score-configs/` fully
 * determines a run: scorer, question wording (versioned), inputs, chunk and request limits and the budget.
 * Unknown keys are errors so a typo never silently falls back to a default.
 */
import { z } from 'zod';

export const scoreConfigSchema = z.strictObject({
  /** Run name; the manifest lands in `tools/out/runs/<name>/`. */
  name: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/),
  scorer: z.strictObject({
    kind: z.enum(['jev', 'fake']),
    model: z.string().min(1),
  }),
  question: z.strictObject({
    /** Bump whenever `template` changes meaning; it is part of every cache key. */
    template_version: z.string().min(1),
    /** Swedish yes/no question with `{title}` and `{text}` placeholders for the promise. */
    template: z.string().refine((t) => t.includes('{title}') && t.includes('{text}'), {
      message: 'template needs both {title} and {text}',
    }),
  }),
  inputs: z.strictObject({
    promises: z.strictObject({
      term: z.string().min(1),
      /** Only promises whose id starts with this prefix (e.g. `tido-`). Empty string = all. */
      id_prefix: z.string(),
    }),
    documents: z.discriminatedUnion('kind', [
      /** The distinct documents of an eval pairs file; the same file supplies the labels for the report. */
      z.strictObject({ kind: z.literal('eval-pairs'), pairs_file: z.string().min(1) }),
      /** Explicit Riksdag document ids from the text cache (titles default to the id). */
      z.strictObject({
        kind: z.literal('ids'),
        ids: z.array(z.string().min(1)).min(1),
        pairs_file: z.string().min(1).optional(),
      }),
    ]),
  }),
  chunk: z.strictObject({ max_chars: z.number().int().min(2000) }),
  limits: z.strictObject({
    max_request_tokens: z.number().int().positive(),
    max_state_plus_question_tokens: z.number().int().positive(),
    chars_per_token: z.number().positive(),
  }),
  budget: z.strictObject({
    max_cost_usd: z.number().positive(),
    usd_per_million_tokens: z.number().positive(),
  }),
});
export type ScoreConfig = z.infer<typeof scoreConfigSchema>;

export function parseScoreConfig(raw: unknown): ScoreConfig {
  return scoreConfigSchema.parse(raw);
}
