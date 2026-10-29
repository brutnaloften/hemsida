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
  .strict()
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

/**
 * A budget comparison for one anslag (appropriation line): the amount before and after the
 * promise period, in mn kr nominal, as in src/data/budget. Describes the numbers only; it is never
 * a verdict. The anslag is identified by its restated code (`kod`, including the year suffix of a
 * discontinued anslag), which is only unique within one release of the ESV data, so the entry also
 * records the `release` year it was read from. `namn` is kept for readers and for the data test
 * that checks the reference still resolves.
 */
const budgetEvidenceSchema = z
  .object({
    kind: z.literal('budget'),
    anslag: z
      .object({
        kod: z.string().regex(/^(\d{7}( \d{4})?|[0-9A-Z]{6} \d{4})$/, 'expected an anslag code'),
        namn: z.string().min(1),
        /** Last year of the ESV release the code belongs to (meta.years max), e.g. 2025. */
        release: z.number().int().min(2006),
      })
      .strict(),
    /** Years compared: `from` is the baseline year, `to` the later one. */
    years: z
      .object({ from: z.number().int().min(2006), to: z.number().int().min(2006) })
      .strict()
      .refine((y) => y.from < y.to, { message: 'years.from must be before years.to' }),
    /** Amounts in mn kr, nominal (not inflation adjusted). */
    amounts: z.object({ before: z.number(), after: z.number() }).strict(),
    /** Date of the evidence, used to place it on the timeline (e.g. the budget proposition). */
    date: isoDate,
    relevance: z.enum(['full', 'partial']),
    note: z.string().nullable().default(null),
  })
  .strict();

export const evidenceSchema = z.discriminatedUnion('kind', [
  riksdagEvidenceSchema,
  agreementEvidenceSchema,
  budgetEvidenceSchema,
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

const PLANNING_KINDS: readonly string[] = ['dir', 'sou', 'ds', 'prop'];
const ISO_DATE_IN_TEXT = /\d{4}-\d{2}-\d{2}/;
const MIN_SEARCH_NOTE_LENGTH = 30;

/**
 * Evidence-to-verdict constraints for the CURRENT verdict (history entries are not checked; they
 * were judged against the evidence available at the time). Only Riksdag evidence counts;
 * `agreement` and `budget` evidence never qualify a verdict. See "Verdict" in docs/data-model.md.
 */
function checkVerdictEvidence(
  p: {
    verdict: { value: string; reasoning: string };
    evidence: Evidence[];
    committee?: string | undefined;
    keywords: string[];
  },
  ctx: z.core.$RefinementCtx,
): void {
  const { value, reasoning } = p.verdict;
  const riksdag = p.evidence.filter(isRiksdagEvidence);
  const fail = (message: string) =>
    ctx.addIssue({ code: 'custom', path: ['verdict', 'value'], message });

  if (value === 'in_progress' && !riksdag.some((e) => PLANNING_KINDS.includes(e.kind))) {
    fail(
      'verdict in_progress requires Riksdag evidence of kind dir, sou, ds or prop (agreement and budget evidence do not count)',
    );
  }
  if (value === 'fulfilled' && !riksdag.some((e) => e.kind === 'sfs')) {
    fail(
      'verdict fulfilled requires Riksdag evidence of kind sfs (agreement and budget evidence do not count)',
    );
  }
  if (value === 'broken') {
    const hasVote = riksdag.some((e) => e.kind === 'bet' && e.votes !== undefined);
    const citesDocument = riksdag.some((e) => reasoning.includes(e.designation));
    if (!hasVote && !citesDocument) {
      fail(
        'verdict broken requires a bet evidence entry with votes (a voting record), or reasoning that cites the designation of a Riksdag evidence entry documenting the reversal',
      );
    }
  }
  if (value === 'no_evidence') {
    const text = reasoning.toLowerCase();
    const terms = [...(p.committee ? [p.committee] : []), ...p.keywords]
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t !== '');
    const problems: string[] = [];
    if (!ISO_DATE_IN_TEXT.test(reasoning)) problems.push('the date of the search (YYYY-MM-DD)');
    if (terms.length > 0) {
      if (!terms.some((t) => text.includes(t))) {
        problems.push(
          'what was searched (mention the committee or at least one of the promise keywords)',
        );
      }
    } else if (reasoning.trim().length < MIN_SEARCH_NOTE_LENGTH) {
      problems.push(`what was searched (at least ${MIN_SEARCH_NOTE_LENGTH} characters)`);
    }
    if (problems.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['verdict', 'reasoning'],
        message: `verdict no_evidence requires reasoning recording the search: ${problems.join('; ')}`,
      });
    }
  }
}

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
    checkVerdictEvidence(p, ctx);
  });

export const sourceSchema = z.object({
  id: slug,
  title: z.string().min(1),
  kind: z.enum(['government_agreement', 'manifesto', 'speech', 'debate', 'other']),
  parties: z.array(partySchema).min(1),
  date: isoDate,
  url: z.url(),
  archive: z.url(),
  /** Date the original `url` was found dead (404/gone); the archive copy is then preferred. */
  urlDeadAsOf: isoDate.optional(),
});

/** True for evidence that is a Riksdag document (not agreement or budget evidence). */
export function isRiksdagEvidence(e: Evidence): e is RiksdagEvidence {
  return e.kind !== 'agreement' && e.kind !== 'budget';
}

export type PromiseRecord = z.infer<typeof promiseSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type RiksdagEvidence = Extract<Evidence, { kind: (typeof EVIDENCE_KINDS)[number] }>;
export type BudgetEvidence = Extract<Evidence, { kind: 'budget' }>;
export type AgreementEvidence = Extract<Evidence, { kind: 'agreement' }>;
export type AgreementOutcome = (typeof AGREEMENT_OUTCOMES)[number];
export type Verdict = z.infer<typeof verdictSchema>;
export type Source = z.infer<typeof sourceSchema>;
