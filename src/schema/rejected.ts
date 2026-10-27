/**
 * Rejected match candidates (data model v2, see docs/data-model.md).
 *
 * One file per term, `src/data/<term>/rejected-candidates.json`, holding a
 * JSON array of (promise_id, dok_id) pairs that the matcher proposed and
 * review rejected. The matcher skips these pairs on later runs.
 */
import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

export const rejectedCandidateSchema = z.object({
  /** Promise id (filename without `.json`). */
  promise_id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'expected a lowercase slug'),
  /** Riksdag document ID, the same key evidence uses. */
  dok_id: z.string().min(1),
  /** Why the document was rejected. */
  reason: z.string().min(1).optional(),
  /** Date of the rejection. */
  rejected_at: isoDate.optional(),
});

export type RejectedCandidate = z.infer<typeof rejectedCandidateSchema>;

export function rejectedKey(promiseId: string, dokId: string): string {
  return `${promiseId}:${dokId}`;
}

export const rejectedCandidatesFileSchema = z
  .array(rejectedCandidateSchema)
  .superRefine((rows, ctx) => {
    const seen = new Set<string>();
    rows.forEach((row, i) => {
      const key = rejectedKey(row.promise_id, row.dok_id);
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: [i],
          message: `duplicate pair (${row.promise_id}, ${row.dok_id})`,
        });
      }
      seen.add(key);
    });
  });

/** Set of lookup keys for the matcher to skip already-rejected pairs. */
export function rejectedKeys(rows: RejectedCandidate[]): Set<string> {
  return new Set(rows.map((r) => rejectedKey(r.promise_id, r.dok_id)));
}
