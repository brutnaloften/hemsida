/**
 * Shared promise schema (data model v2, see docs/data-model.md).
 *
 * Imported by the Astro content collection (src/content.config.ts) and by the
 * tooling in tools/ (via tools/lib/schema.ts). Keep it free of Astro and
 * browser imports so plain Node can load it.
 */
import { z } from 'zod';

export const PARTIES = ['S', 'M', 'SD', 'C', 'V', 'KD', 'L', 'MP'] as const;
export const partySchema = z.enum(PARTIES);

export const ROLES = ['government', 'support', 'opposition'] as const;

export const PROMISE_TYPES = [
  'legislative',
  'inquiry',
  'budget',
  'outcome',
  'other_action',
  'vague',
] as const;

export const VERDICTS = [
  'unassessed',
  'no_evidence',
  'in_progress',
  'fulfilled',
  'partially_fulfilled',
  'unfulfilled',
  'abandoned',
  'broken',
  'not_assessable',
] as const;

/** Swedish display labels for verdict values. */
export const VERDICT_LABELS: Record<(typeof VERDICTS)[number], string> = {
  unassessed: 'Inte bedömt',
  no_evidence: 'Inga belägg funna',
  in_progress: 'Pågår',
  fulfilled: 'Uppfyllt',
  partially_fulfilled: 'Delvis uppfyllt',
  unfulfilled: 'Ej uppfyllt',
  abandoned: 'Övergivet',
  broken: 'Brutet',
  not_assessable: 'Ej bedömbart',
};

/** Evidence kinds in pipeline order (dir -> sou/ds -> prop -> bet -> sfs); mot sits outside it. */
export const EVIDENCE_KINDS = ['dir', 'sou', 'ds', 'prop', 'bet', 'sfs', 'mot'] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'expected a lowercase slug');

export const verdictValueSchema = z.enum(VERDICTS);

/**
 * How a government agreement (e.g. Tidöavtalet) treated a promise made elsewhere (e.g. a party
 * manifesto). Describes the agreement text only; it is never a verdict.
 */
export const AGREEMENT_OUTCOMES = [
  'included',
  'weakened',
  'strengthened',
  'contradicted',
  'not_addressed',
] as const;

/** Swedish display labels for agreement outcomes. */
export const AGREEMENT_OUTCOME_LABELS: Record<(typeof AGREEMENT_OUTCOMES)[number], string> = {
  included: 'Med i avtalet',
  weakened: 'Urvattnat',
  strengthened: 'Skärpt',
  contradicted: 'Motsägs',
  not_addressed: 'Saknas i avtalet',
};

const agreementEvidenceSchema = z
  .object({
    kind: z.literal('agreement'),
    /** Id of the agreement's source file (kind government_agreement). */
    source: slug,
    date: isoDate,
    /** Ids of the agreement's promises that correspond to this one. */
    promises: z.array(slug).default([]),
    outcome: z.enum(AGREEMENT_OUTCOMES),
    note: z.string().nullable().default(null),
  })
  .superRefine((e, ctx) => {
    if (e.outcome === 'not_addressed' && e.promises.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['promises'],
        message: 'promises must be empty when the outcome is not_addressed',
      });
    }
    if (e.outcome !== 'not_addressed' && e.promises.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['promises'],
        message: 'promises must list at least one promise unless the outcome is not_addressed',
      });
    }
  });

const riksdagEvidenceSchema = z
  .object({
    kind: z.enum(EVIDENCE_KINDS),
    dok_id: z.string().min(1),
    designation: z.string().min(1),
    title: z.string().min(1),
    date: isoDate,
    url: z.url(),
    relevance: z.enum(['full', 'partial']),
    note: z.string().nullable().default(null),
    votes: z.partialRecord(partySchema, z.enum(['yes', 'no', 'abstain', 'absent'])).optional(),
  })
  .superRefine((e, ctx) => {
    if (e.votes !== undefined && e.kind !== 'bet') {
      ctx.addIssue({
        code: 'custom',
        path: ['votes'],
        message: 'votes are only allowed on kind bet',
      });
    }
  });

export const evidenceSchema = z.discriminatedUnion('kind', [
  riksdagEvidenceSchema,
  agreementEvidenceSchema,
]);

const verdictEntry = z.object({
  value: verdictValueSchema,
  reasoning: z.string().default(''),
  date: isoDate,
});

/** Reasoning is required for every verdict value except `unassessed` and `no_evidence`. */
function requireReasoning(
  v: { value: string; reasoning: string },
  ctx: z.core.$RefinementCtx,
): void {
  if (v.value !== 'unassessed' && v.value !== 'no_evidence' && v.reasoning.trim() === '') {
    ctx.addIssue({
      code: 'custom',
      path: ['reasoning'],
      message: 'reasoning is required unless the verdict is unassessed or no_evidence',
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
    term: z.string().regex(/^\d{4}-\d{4}$/, 'expected YYYY-YYYY'),
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
          code: 'custom',
          path: ['roles', party],
          message: 'role party must be listed in parties',
        });
      }
    }
    const agreementSources = new Set<string>();
    p.evidence.forEach((e, i) => {
      if (e.kind !== 'agreement') return;
      if (agreementSources.has(e.source)) {
        ctx.addIssue({
          code: 'custom',
          path: ['evidence', i, 'source'],
          message: `more than one agreement entry for source ${e.source}`,
        });
      }
      agreementSources.add(e.source);
    });
  });

export const sourceSchema = z.object({
  id: slug,
  title: z.string().min(1),
  kind: z.enum(['government_agreement', 'manifesto', 'speech', 'debate', 'other']),
  parties: z.array(partySchema).min(1),
  date: isoDate,
  url: z.url(),
  archive: z.url(),
});

export type PromiseRecord = z.infer<typeof promiseSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type RiksdagEvidence = Extract<Evidence, { kind: (typeof EVIDENCE_KINDS)[number] }>;
export type AgreementEvidence = Extract<Evidence, { kind: 'agreement' }>;
export type AgreementOutcome = (typeof AGREEMENT_OUTCOMES)[number];
export type Verdict = z.infer<typeof verdictSchema>;
export type Source = z.infer<typeof sourceSchema>;
