/**
 * Declarative linking-run config (hemsida-4np.5). One committed JSON file under `tools/link-configs/` fully
 * determines a run: judge (kind and model), prompt (versioned), which pairs to judge, how much evidence text
 * each judgement sees, acceptance thresholds and the budget. Unknown keys are errors so a typo never silently
 * falls back to a default. Mirrors `tools/lib/score/config.ts`.
 */
import { z } from 'zod';
import { evalLabelSchema } from '../../../src/schema/eval.ts';

export const CONFIDENCES = ['low', 'medium', 'high'] as const;
export const confidenceSchema = z.enum(CONFIDENCES);

export const linkConfigSchema = z.strictObject({
  /** Run name; the manifest lands in `tools/out/link-runs/<name>/`. */
  name: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/),
  judge: z.strictObject({
    kind: z.enum(['claude', 'api', 'fake']),
    model: z.string().min(1),
  }),
  /** Bump whenever `instructions` changes meaning; it is part of every cache key. */
  template_version: z.string().min(1),
  /** System instructions for the judge: label and stage definitions, answer format. */
  instructions: z.string().min(1),
  inputs: z.strictObject({
    promises: z.strictObject({
      term: z.string().min(1),
      /** Only promises whose id starts with this prefix (e.g. `val2022-`). Empty string = all. */
      id_prefix: z.string(),
    }),
    pairs: z.discriminatedUnion('kind', [
      /** The pairs of the eval file; its hand labels feed the agreement report. */
      z.strictObject({ kind: z.literal('eval-pairs'), pairs_file: z.string().min(1) }),
      /**
       * Documents in the `riksdag-candidates` files of the term (keyword hits plus score hits from
       * `link-scores.ts`). `min_relevance` keeps only candidates the scoring run rated at least that high
       * (candidates without a score are dropped when it is set); `max_per_promise` takes the best first.
       */
      z.strictObject({
        kind: z.literal('candidates'),
        min_relevance: z.number().min(0).max(1).optional(),
        max_per_promise: z.number().int().positive().optional(),
        /** Eval file whose labels feed the agreement report for the candidates it also contains. */
        pairs_file: z.string().min(1).optional(),
      }),
    ]),
  }),
  evidence: z.strictObject({
    /** The tier-1 text of a document is cut to this many (estimated) tokens. */
    max_tokens: z.number().int().min(500),
    chars_per_token: z.number().positive(),
    /** Optional folder of eval briefs (`tools/out/eval-briefs`); when a pair has one, its passages are appended. */
    briefs_dir: z.string().min(1).optional(),
  }),
  thresholds: z.strictObject({
    /** Labels that make a judgement a proposal for human review. */
    accept_labels: z.array(evalLabelSchema).min(1),
    /** A proposal needs at least this confidence. */
    min_confidence: confidenceSchema,
  }),
  budget: z.strictObject({
    max_cost_usd: z.number().positive(),
    usd_per_million_tokens: z.number().positive(),
  }),
});
export type LinkConfig = z.infer<typeof linkConfigSchema>;

export function parseLinkConfig(raw: unknown): LinkConfig {
  return linkConfigSchema.parse(raw);
}
