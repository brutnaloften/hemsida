/**
 * Splits a compound promise into one promise per commitment (policy: docs/data-model.md,
 * "Compound promises"). Pure; tools/split-promises.ts does the file I/O.
 */
import { promiseSchema, type PromiseRecord } from './schema.ts';

import { z } from 'zod/v4';

const partSchema = z.strictObject({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1),
  description: z.string().min(1),
  page: z.number().int().positive(),
  quote: z.string().min(1),
  /** Promise type of the part when it differs from the parent's (e.g. an agency assignment). */
  type: z.enum(['legislative', 'inquiry', 'budget', 'outcome', 'other_action', 'vague']).optional(),
});
export const splitPlanSchema = z.array(
  z.strictObject({
    id: z.string().min(1),
    reason: z.string(),
    parts: z.array(partSchema).min(2),
    /** Slug of the part the old page URL redirects to (default: the first). */
    redirect: z.string().optional(),
    /**
     * Which parts a promise that linked the parent should link now, by owner promise id; an owner that is
     * not listed links all parts.
     */
    links: z.record(z.string(), z.array(z.string()).min(1)).optional(),
  }),
);
export type SplitPart = z.infer<typeof partSchema>;
export type SplitPlanEntry = z.infer<typeof splitPlanSchema>[number];

export const partId = (part: SplitPart): string => `tido-${part.slug}`;

/** The new promise for one part: parent metadata, the part's own text and source, nothing assessed. */
export function buildPart(parent: PromiseRecord, part: SplitPart): PromiseRecord {
  const created = parent.verdict.history[0]?.date ?? parent.verdict.date;
  return promiseSchema.parse({
    id: partId(part),
    term: parent.term,
    title: part.title,
    description: part.description,
    source: { ...parent.source, page: part.page, quote: part.quote },
    parties: parent.parties,
    roles: parent.roles,
    type: part.type ?? parent.type,
    area: parent.area,
    committee: parent.committee,
    keywords: parent.keywords,
    verdict: { value: 'unassessed', reasoning: '', date: created, history: [] },
    evidence: [],
  });
}

/** Replaces `oldId` with `newIds` in every `promises` array of a JSON value; returns true if changed. */
export function replacePromiseId(
  value: unknown,
  oldId: string,
  newIds: readonly string[],
  /** Narrower targets for the owner of a link (promise id), when the plan names them. */
  targetsFor: (ownerId: string | undefined) => readonly string[] = () => newIds,
): boolean {
  let changed = false;
  // The owner is the nearest enclosing object with a string `id` (a promise file, or the `promise` of a candidate).
  const walk = (v: unknown, owner: string | undefined): void => {
    if (Array.isArray(v)) {
      v.forEach((x) => walk(x, owner));
      return;
    }
    if (v && typeof v === 'object') {
      const o = v as { id?: unknown; promise?: { id?: unknown } };
      // A promise file has its own id; a manifesto candidate names its promise next to its `link`.
      const id = typeof o.id === 'string' ? o.id : o.promise?.id;
      const here = typeof id === 'string' ? id : owner;
      for (const [k, child] of Object.entries(v)) {
        if (k === 'promises' && Array.isArray(child) && child.includes(oldId)) {
          const next: unknown[] = [];
          for (const x of child) {
            for (const y of x === oldId ? targetsFor(here) : [x])
              if (!next.includes(y)) next.push(y);
          }
          (v as Record<string, unknown>)[k] = next;
          changed = true;
        } else walk(child, here);
      }
    }
  };
  walk(value, undefined);
  return changed;
}

export function validatePlan(plan: readonly SplitPlanEntry[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const e of plan) {
    if (e.parts.length < 2) problems.push(`${e.id}: needs at least two parts`);
    const slugs = new Set(e.parts.map((p) => p.slug));
    if (e.redirect && !slugs.has(e.redirect))
      problems.push(`${e.id}: redirect ${e.redirect} is not a part`);
    for (const targets of Object.values(e.links ?? {}))
      for (const t of targets)
        if (!slugs.has(t)) problems.push(`${e.id}: link target ${t} is not a part`);
    for (const p of e.parts) {
      const id = partId(p);
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) problems.push(`${id}: not a slug`);
      if (seen.has(id)) problems.push(`${id}: duplicate part id`);
      seen.add(id);
    }
  }
  return problems;
}
