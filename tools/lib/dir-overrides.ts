/**
 * Hand-confirmed directives for inquiry promises (`tools/dir-overrides.json`, `hemsida-4m4a`).
 *
 * The inquiry rule in `apply-links.ts` needs a `dir` judged at `high` confidence. A directive that
 * the judge rated `medium` but that was read by hand against the promise gets an entry here, which
 * `applyLinks` treats as a `high` judgement with the recorded relevance (the same idea as
 * `tools/sfs-overrides.json` for laws). Static data in git, so a rerun reproduces the verdicts and
 * CI can check the file without a network, a cache or a model (`dir-overrides.test.ts`).
 */
import { z } from 'zod/v4';

export const dirOverrideSchema = z.object({
  /** Promise id (the file name without `.json`). */
  promise_id: z.string().min(1),
  /** Term folder of the promise under `src/data/` (default 2022-2026). */
  term: z
    .string()
    .regex(/^\d{4}-\d{4}$/)
    .default('2022-2026'),
  /** Display designation of the directive on that promise, e.g. `Dir. 2023:98`. */
  designation: z.string().regex(/^Dir\. \d{4}(\/\d{2})?:\d+$/),
  /** Confirmed relevance: `match` (the directive sets up the whole inquiry) or `partial`. */
  relevance: z.enum(['match', 'partial']),
  /** Why the directive is (or is only partly) the inquiry the promise asks for; English, read from the directive text. */
  reason: z.string().min(1),
  /** When the entry was recorded (YYYY-MM-DD). */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export const dirOverridesSchema = z.array(dirOverrideSchema);
export type DirOverride = z.infer<typeof dirOverrideSchema>;

/** Overrides for one promise and one directive, or undefined. */
export function findDirOverride(
  overrides: readonly DirOverride[],
  promiseId: string,
  designation: string,
): DirOverride | undefined {
  return overrides.find((o) => o.promise_id === promiseId && o.designation === designation);
}
