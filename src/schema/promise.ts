/**
 * Shared promise schema (data model v2, see docs/data-model.md).
 *
 * Imported by the Astro content collection (src/content.config.ts) and by the
 * tooling in tools/ (via tools/lib/schema.ts). Keep it free of Astro and
 * browser imports so plain Node can load it.
 */
import { z } from "zod";

export const PARTIES = ["S", "M", "SD", "C", "V", "KD", "L", "MP"] as const;
export const partySchema = z.enum(PARTIES);

export const ROLES = ["government", "support", "opposition"] as const;

export const PROMISE_TYPES = [
  "legislative",
  "inquiry",
  "budget",
  "outcome",
  "other_action",
  "vague",
] as const;

export const VERDICTS = [
  "not_started",
  "in_progress",
  "fulfilled",
  "partially_fulfilled",
  "unfulfilled",
  "abandoned",
  "broken",
  "not_assessable",
] as const;

/** Swedish display labels for verdict values. */
export const VERDICT_LABELS: Record<(typeof VERDICTS)[number], string> = {
  not_started: "Ej påbörjat",
  in_progress: "Pågår",
  fulfilled: "Uppfyllt",
  partially_fulfilled: "Delvis uppfyllt",
  unfulfilled: "Ej uppfyllt",
  abandoned: "Övergivet",
  broken: "Brutet",
  not_assessable: "Ej bedömbart",
};

/** Evidence kinds in pipeline order (dir -> sou/ds -> prop -> bet -> sfs); mot sits outside it. */
export const EVIDENCE_KINDS = ["dir", "sou", "ds", "prop", "bet", "sfs", "mot"] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "expected a lowercase slug");

export const verdictValueSchema = z.enum(VERDICTS);

export const evidenceSchema = z
  .object({
    kind: z.enum(EVIDENCE_KINDS),
    dok_id: z.string().min(1),
    designation: z.string().min(1),
    title: z.string().min(1),
    date: isoDate,
    url: z.url(),
    relevance: z.enum(["full", "partial"]),
    note: z.string().nullable().default(null),
    votes: z.partialRecord(partySchema, z.enum(["yes", "no", "abstain", "absent"])).optional(),
  })
  .superRefine((e, ctx) => {
    if (e.votes !== undefined && e.kind !== "bet") {
      ctx.addIssue({
        code: "custom",
        path: ["votes"],
        message: "votes are only allowed on kind bet",
      });
    }
  });

const verdictEntry = z.object({
  value: verdictValueSchema,
  reasoning: z.string().default(""),
  date: isoDate,
});

/** Reasoning is required for every verdict value except `not_started`. */
function requireReasoning(
  v: { value: string; reasoning: string },
  ctx: z.core.$RefinementCtx,
): void {
  if (v.value !== "not_started" && v.reasoning.trim() === "") {
    ctx.addIssue({
      code: "custom",
      path: ["reasoning"],
      message: "reasoning is required unless the verdict is not_started",
    });
  }
}

export const verdictSchema = verdictEntry
  .extend({ history: z.array(verdictEntry.superRefine(requireReasoning)).default([]) })
  .superRefine(requireReasoning);

export const sourceRefSchema = z.object({
  id: slug,
  page: z.number().int().positive().optional(),
  quote: z.string().optional(),
});

export const promiseSchema = z
  .object({
    id: slug,
    term: z.string().regex(/^\d{4}-\d{4}$/, "expected YYYY-YYYY"),
    title: z.string().min(1),
    description: z.string().min(1),
    source: sourceRefSchema,
    parties: z.array(partySchema).min(1),
    roles: z.partialRecord(partySchema, z.enum(ROLES)),
    type: z.enum(PROMISE_TYPES),
    area: z.string().min(1),
    committee: z.string().optional(),
    keywords: z.array(z.string()).default([]),
    verdict: verdictSchema,
    evidence: z.array(evidenceSchema).default([]),
  })
  .superRefine((p, ctx) => {
    for (const party of Object.keys(p.roles)) {
      if (!p.parties.includes(party as (typeof p.parties)[number])) {
        ctx.addIssue({
          code: "custom",
          path: ["roles", party],
          message: "role party must be listed in parties",
        });
      }
    }
  });

export const sourceSchema = z.object({
  id: slug,
  title: z.string().min(1),
  kind: z.enum(["government_agreement", "manifesto", "speech", "debate", "other"]),
  parties: z.array(partySchema).min(1),
  date: isoDate,
  url: z.url(),
  archive: z.url(),
});

export type PromiseRecord = z.infer<typeof promiseSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type Verdict = z.infer<typeof verdictSchema>;
export type Source = z.infer<typeof sourceSchema>;

/**
 * Current (v1) promise shape, still used by the content collection until
 * hemsida-bzj.3 migrates the data files to v2. Remove then.
 */
const legacySource = z.object({
  value: z.string(),
  archive: z.string(),
  broken: z.boolean().optional(),
});

export const legacyPromiseSchema = z.object({
  name: z.string(),
  description: z.string(),
  party: z.string(),
  status: z.string(),
  date: z.string(),
  sources: z.array(legacySource),
  tags: z.array(z.string()),
  updates: z
    .array(
      z.object({
        date: z.string(),
        status: z.string(),
        reasoning: z.string(),
        sources: z.array(legacySource),
        confidence: z.enum(["high", "medium"]).optional(),
      }),
    )
    .default([]),
});
