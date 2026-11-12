/**
 * Shared promise schema (data model v2, see docs/data-model.md).
 *
 * Imported by the Astro content collection (src/content.config.ts) and by the
 * tooling in tools/ (via tools/lib/schema.ts). Keep it free of Astro and
 * browser imports so plain Node can load it.
 */
import { z } from 'zod';
import { AREAS } from './areas.ts';

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

/** How a party voted on a betänkande. */
export const VOTE_VALUES = ['yes', 'no', 'abstain', 'absent'] as const;
export type VoteValue = (typeof VOTE_VALUES)[number];

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

/**
 * Swedish outcome phrases, completed with the agreement's name by agreementOutcomeLabel
 * ("Med i Tidöavtalet", "Motsägs av Tidöavtalet"). The preposition differs per outcome.
 */
export const AGREEMENT_OUTCOME_PHRASES: Record<AgreementOutcome, string> = {
  included: 'Med i',
  weakened: 'Urvattnat i',
  strengthened: 'Skärpt i',
  contradicted: 'Motsägs av',
  not_addressed: 'Saknas i',
};

/** The name used for an agreement in badges and headers: shortTitle, falling back to title. */
export function agreementName(source: { shortTitle?: string; title: string }): string {
  return source.shortTitle ?? source.title;
}

/** Badge label for an outcome in a given agreement, e.g. "Saknas i Tidöavtalet". */
export function agreementOutcomeLabel(
  outcome: AgreementOutcome,
  source: { shortTitle?: string; title: string },
): string {
  return `${AGREEMENT_OUTCOME_PHRASES[outcome]} ${agreementName(source)}`;
}

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

/**
 * A prose budget intention found in a bet/prop text (e.g. "För 2026 avsätts 1 000 000 000 kronor
 * för ..."). Third evidence tier next to the binding anslag ceiling (budget evidence) and the
 * actual outcome (ESV utfall): it states what someone said they would spend, binds nothing and
 * never qualifies a verdict.
 */
export const evidenceFigureSchema = z
  .object({
    year: z.number().int().min(2006),
    /** Amount in mn kr, nominal, like budget evidence. */
    amount: z.number(),
    /** What the money is for, in the document's own Swedish wording. */
    scope: z.string().min(1),
    tier: z.literal('intention'),
    speaker: z
      .object({
        role: z.enum(['government', 'committee', 'reservation']),
        party: partySchema.optional(),
      })
      .strict(),
    quote: z.string().min(1),
  })
  .strict();

const riksdagEvidenceSchema = z
  .object({
    kind: z.enum(EVIDENCE_KINDS),
    dok_id: z.string().min(1),
    designation: z.string().min(1),
    title: z.string().min(1),
    date: isoDate,
    url: z.url(),
    /**
     * `contradicts` marks a document that works against the promise ("Motverkar"). It is shown in
     * the timeline but never counts toward a verdict (see checkVerdictEvidence).
     */
    relevance: z.enum(['full', 'partial', 'contradicts']),
    note: z.string().nullable().default(null),
    votes: z.partialRecord(partySchema, z.enum(VOTE_VALUES)).optional(),
    figures: z.array(evidenceFigureSchema).optional(),
  })
  .superRefine((e, ctx) => {
    if (e.figures !== undefined && e.kind !== 'bet' && e.kind !== 'prop') {
      ctx.addIssue({
        code: 'custom',
        path: ['figures'],
        message: 'figures are only allowed on kind bet or prop',
      });
    }
    if (e.votes !== undefined && e.kind !== 'bet') {
      ctx.addIssue({
        code: 'custom',
        path: ['votes'],
        message: 'votes are only allowed on kind bet',
      });
    }
    if (e.kind === 'sfs') {
      const m = /^sfs-(\d{4})-(\d+)$/.exec(e.dok_id);
      if (!m) {
        ctx.addIssue({
          code: 'custom',
          path: ['dok_id'],
          message: 'an sfs dok_id must look like sfs-<YYYY>-<N>, e.g. sfs-2025-625',
        });
      } else if (e.designation !== `SFS ${m[1]}:${m[2]}`) {
        ctx.addIssue({
          code: 'custom',
          path: ['designation'],
          message: `an sfs designation must be 'SFS ${m[1]}:${m[2]}' to match its dok_id`,
        });
      }
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

/** Who set a verdict. Absent means the origin is not recorded (older verdicts and `unassessed`). */
export const ASSESSED_BY = ['ai', 'human'] as const;

const verdictEntry = z.object({
  value: verdictValueSchema,
  /** `ai` marks a verdict set by a model; the site shows an AI tag with a warning next to it. */
  assessedBy: z.enum(ASSESSED_BY).optional(),
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
    type: string;
    verdict: { value: string; reasoning: string; date: string };
    evidence: Evidence[];
    committee?: string | undefined;
    keywords: string[];
  },
  ctx: z.core.$RefinementCtx,
): void {
  const { value, reasoning } = p.verdict;
  // A document that works against the promise never qualifies a verdict.
  const riksdag = p.evidence.filter(isRiksdagEvidence).filter((e) => e.relevance !== 'contradicts');
  const fail = (message: string) =>
    ctx.addIssue({ code: 'custom', path: ['verdict', 'value'], message });

  if (value === 'in_progress' && !riksdag.some((e) => PLANNING_KINDS.includes(e.kind))) {
    fail(
      'verdict in_progress requires Riksdag evidence of kind dir, sou, ds or prop (agreement and budget evidence do not count)',
    );
  }
  if (value === 'fulfilled' || value === 'partially_fulfilled') {
    if (p.type === 'inquiry') {
      // An inquiry promise is met once the government has appointed the inquiry: the directive is the
      // evidence, a later SOU is only shown. No law is needed (or expected) for it.
      if (!riksdag.some((e) => e.kind === 'dir')) {
        fail(
          `verdict ${value} on an inquiry promise requires Riksdag evidence of kind dir (the inquiry directive; agreement and budget evidence do not count)`,
        );
      }
    } else if (!riksdag.some((e) => e.kind === 'sfs')) {
      // An issued law is enough, including one whose in-force date (the sfs date) is still ahead:
      // the government's part is done once the law is adopted. Agreement and budget evidence do not count.
      fail(
        `verdict ${value} requires Riksdag evidence of kind sfs (an issued law, in force or not yet; agreement and budget evidence do not count)`,
      );
    }
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
    area: z.enum(AREAS),
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

export const sourceSchema = z
  .object({
    id: slug,
    title: z.string().min(1),
    /** Short name for badges and column headers, e.g. "Tidöavtalet". Required for government agreements. */
    shortTitle: z.string().min(1).optional(),
    kind: z.enum(['government_agreement', 'manifesto', 'speech', 'debate', 'other']),
    parties: z.array(partySchema).min(1),
    date: isoDate,
    url: z.url(),
    archive: z.url(),
    /** Date the original `url` was found dead (404/gone); the archive copy is then preferred. */
    urlDeadAsOf: isoDate.optional(),
  })
  .superRefine((s, ctx) => {
    if (s.kind === 'government_agreement' && s.shortTitle === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['shortTitle'],
        message: 'shortTitle is required for kind government_agreement',
      });
    }
  });

/** True for evidence that is a Riksdag document (not agreement or budget evidence). */
export function isRiksdagEvidence(e: Evidence): e is RiksdagEvidence {
  return e.kind !== 'agreement' && e.kind !== 'budget';
}

export type PromiseRecord = z.infer<typeof promiseSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type RiksdagEvidence = Extract<Evidence, { kind: (typeof EVIDENCE_KINDS)[number] }>;
export type EvidenceFigure = z.infer<typeof evidenceFigureSchema>;
export type BudgetEvidence = Extract<Evidence, { kind: 'budget' }>;
export type AgreementEvidence = Extract<Evidence, { kind: 'agreement' }>;
export type AgreementOutcome = (typeof AGREEMENT_OUTCOMES)[number];
export type Verdict = z.infer<typeof verdictSchema>;
export type Source = z.infer<typeof sourceSchema>;
