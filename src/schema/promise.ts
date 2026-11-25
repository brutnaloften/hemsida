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
  'expired',
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
  expired: 'Löpt ut',
};

/**
 * Evidence kinds in pipeline order (dir -> sou/ds -> prop -> bet -> sfs); mot sits outside it. `skr`
 * is a regeringens skrivelse (the Riksdag files it under prop, but it proposes nothing); it only
 * qualifies `fulfilled` on an `other_action` promise (see checkVerdictEvidence).
 */
export const EVIDENCE_KINDS = ['dir', 'sou', 'ds', 'prop', 'bet', 'sfs', 'mot', 'skr'] as const;

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
        role: z.enum(['government', 'committee', 'reservation', 'statement']),
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
    /** Which committee point `votes` are from, so a vote can be traced and labelled. */
    vote_point: z
      .object({ punkt: z.string().min(1), rubrik: z.string(), votering_id: z.string().min(1) })
      .strict()
      .optional(),
    figures: z.array(evidenceFigureSchema).optional(),
  })
  .superRefine((e, ctx) => {
    if (e.vote_point !== undefined && e.votes === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['vote_point'],
        message: 'vote_point is only allowed together with votes',
      });
    }
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

export const BUDGET_TIERS = ['ceiling', 'outcome'] as const;

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
    /**
     * Which budget tier the amounts are: `ceiling` (the voted appropriation, `budget` plus
     * `andrad`) or `outcome` (ESV `utfall`). Optional for backward compatibility; an entry without
     * a tier never qualifies a verdict. See "Budget verdict rule" in docs/data-model.md.
     */
    tier: z.enum(BUDGET_TIERS).optional(),
    /** Swedish note on the baseline when it is not the 2022 outcome (one-offs, discontinued anslag). */
    baselineNote: z.string().min(1).optional(),
    /** Date of the evidence, used to place it on the timeline (e.g. the budget proposition). */
    date: isoDate,
    relevance: z.enum(['full', 'partial']),
    note: z.string().nullable().default(null),
  })
  .strict();

const periodKey = z
  .string()
  .regex(/^\d{4}(-Q[1-4]|-(0[1-9]|1[0-2]))?$/, 'expected YYYY, YYYY-Qn or YYYY-MM');
const periodFormat = (k: string) =>
  k.length === 4 ? 'year' : k.includes('Q') ? 'quarter' : 'month';

const periodValue = z
  .object({
    /** Period key as in the series file's `values`: "2022", "2022-Q1" or "2022-03". */
    period: periodKey,
    v: z.number(),
  })
  .strict();

/** What the promise asks of the series; `none` when it states no measurable direction or level. */
export const statisticTargetSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('threshold'),
      op: z.enum(['gte', 'lte']),
      value: z.number(),
      /** Year the promise sets for the level, when it sets one. */
      byYear: z.number().int().optional(),
    })
    .strict(),
  z.object({ type: z.literal('direction'), op: z.enum(['up', 'down']) }).strict(),
  z.object({ type: z.literal('none') }).strict(),
]);

/**
 * A measured outcome from an official statistics series (src/data/<term>/statistics/<id>.json, see
 * statisticSeriesSchema). Describes numbers only; it never sets `broken` or `unfulfilled` and a series that
 * moves against the promise never qualifies a verdict. There is no tier: a statistic is by
 * definition a measured result. See "Statistic evidence" in docs/data-model.md.
 */
const statisticEvidenceSchema = z
  .object({
    kind: z.literal('statistic'),
    /** Id of a series file in the same term; a data test checks it exists. */
    series: slug,
    /** Normally the last full year before the term (2022). */
    baseline: periodValue,
    /** The latest period at the series' `fetched_at`. */
    latest: periodValue,
    target: statisticTargetSchema,
    /** `partial` when the series is a proxy or covers only part of the promise. */
    relevance: z.enum(['full', 'partial']),
    /** Swedish note on the baseline when it is not the last full year before the term. */
    baselineNote: z.string().min(1).optional(),
    /**
     * Swedish note giving the inflation-adjusted change. Required (by the data test) for a series
     * with a `priceBasis`, because the comparison itself is nominal.
     */
    inflationNote: z.string().min(1).optional(),
    /** Release date of the latest period, used to place it on the timeline. */
    date: isoDate,
    note: z.string().nullable().default(null),
  })
  .strict()
  .refine((e) => periodFormat(e.baseline.period) === periodFormat(e.latest.period), {
    path: ['latest', 'period'],
    message: 'baseline and latest must use the same period format',
  })
  .refine((e) => e.baseline.period < e.latest.period, {
    path: ['latest', 'period'],
    message: 'latest.period must be after baseline.period',
  });

export const evidenceSchema = z.discriminatedUnion('kind', [
  riksdagEvidenceSchema,
  agreementEvidenceSchema,
  budgetEvidenceSchema,
  statisticEvidenceSchema,
]);

/** The direction a statistic target asks for, or undefined when it states none. */
function targetDirection(t: StatisticEvidence['target']): 'up' | 'down' | undefined {
  if (t.type === 'direction') return t.op;
  if (t.type === 'threshold') return t.op === 'gte' ? 'up' : 'down';
  return undefined;
}

/** True when the series moved from baseline to latest in the direction the promise asks for. */
export function statisticMoved(e: StatisticEvidence): boolean {
  const dir = targetDirection(e.target);
  if (dir === undefined) return false;
  return dir === 'up' ? e.latest.v > e.baseline.v : e.latest.v < e.baseline.v;
}

/** True when the target is reached at `latest` (threshold level, or direction with a move). */
export function statisticTargetMet(e: StatisticEvidence): boolean {
  const t = e.target;
  if (t.type === 'threshold') return t.op === 'gte' ? e.latest.v >= t.value : e.latest.v <= t.value;
  if (t.type === 'direction') return statisticMoved(e);
  return false;
}

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

/**
 * `expired` is set only by the term-end sweep, which is a model run: it must say so with
 * `assessedBy: 'ai'`. It needs reasoning (general rule above) and no evidence.
 */
function requireAiForExpired(
  v: { value: string; assessedBy?: string | undefined },
  ctx: z.core.$RefinementCtx,
): void {
  if (v.value === 'expired' && v.assessedBy !== 'ai') {
    ctx.addIssue({
      code: 'custom',
      path: ['assessedBy'],
      message: "verdict expired is set by the term-end sweep and requires assessedBy: 'ai'",
    });
  }
}

export const verdictSchema = verdictEntry
  .extend({
    history: z
      .array(verdictEntry.superRefine(requireReasoning).superRefine(requireAiForExpired))
      .default([]),
  })
  .superRefine(requireReasoning)
  .superRefine(requireAiForExpired);

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
 * were judged against the evidence available at the time). Only Riksdag evidence counts, and a
 * `contradicts` entry never qualifies a verdict, with one exception: the party's own contrary motion
 * for `broken` on an opposition-only budget promise; `agreement` evidence never qualifies; `budget` evidence only through the budget verdict rule; `statistic` evidence only through the statistic verdict rule. See "Verdict" in docs/data-model.md.
 */
function checkVerdictEvidence(
  p: {
    type: string;
    parties: string[];
    roles: Partial<Record<string, string>>;
    term: string;
    verdict: { value: string; reasoning: string; date: string };
    evidence: Evidence[];
    committee?: string | undefined;
    keywords: string[];
  },
  ctx: z.core.$RefinementCtx,
): void {
  const { value, reasoning } = p.verdict;
  // A document that works against the promise never qualifies a verdict (the one exception, an
  // opposition party's own contrary motion for `broken`, is checked separately below).
  const riksdag = p.evidence.filter(isRiksdagEvidence).filter((e) => e.relevance !== 'contradicts');
  const fail = (message: string) =>
    ctx.addIssue({ code: 'custom', path: ['verdict', 'value'], message });

  // Budget verdict rule (hemsida-dl5.6): for a `budget` promise made by at least one party in
  // government or support, a budget entry with a tier plus an anchoring prop/bet can stand in for
  // the law (outcome tier) or for the planning document (any tier). Opposition-only promises are
  // never judged on ESV data: it measures the government's budget, not that party's act.
  const budgetJudgeable =
    p.type === 'budget' &&
    Object.values(p.roles).some((r) => r === 'government' || r === 'support');
  const tiered = budgetJudgeable
    ? p.evidence.filter((e): e is BudgetEvidence => e.kind === 'budget' && e.tier !== undefined)
    : [];
  const anchored = riksdag.some((e) => e.kind === 'prop' || e.kind === 'bet');
  // Statistic verdict rule (hemsida-50r.2): for a promise with a government or support party, a
  // statistic plus action evidence (prop, bet or sfs) can qualify partially_fulfilled and
  // fulfilled. A statistic shows the result, not the cause, so the action evidence is required
  // too. Opposition-only promises are never judged on statistics, and a series that moved
  // against the promise qualifies nothing.
  const statisticJudgeable = Object.values(p.roles).some(
    (r) => r === 'government' || r === 'support',
  );
  const statistics = statisticJudgeable
    ? p.evidence.filter((e): e is StatisticEvidence => e.kind === 'statistic')
    : [];
  const termEnd = Number(p.term.slice(5));
  const acted = riksdag.some((e) => e.kind === 'prop' || e.kind === 'bet' || e.kind === 'sfs');
  // Both verdicts need the series to have moved in the promised direction; fulfilled also needs
  // the target reached. A series that moved against the promise qualifies nothing.
  const statisticPartial = acted && statistics.some((e) => statisticMoved(e));
  const statisticFull =
    acted &&
    statistics.some(
      (e) =>
        e.relevance === 'full' &&
        statisticMoved(e) &&
        statisticTargetMet(e) &&
        // a level promised for a year after the term cannot be settled before that year
        !(
          e.target.type === 'threshold' &&
          e.target.byYear !== undefined &&
          e.target.byYear > termEnd
        ),
    );
  const budgetOutcome = anchored && tiered.some((e) => e.tier === 'outcome');
  // An opposition-only budget promise is judged on the party's own act: a motion (its budget
  // alternative) that proposes the money. `fulfilled` needs a motion judged to cover all of it.
  const oppositionOnlyBudget =
    p.type === 'budget' &&
    p.parties.length > 0 &&
    p.parties.every((x) => p.roles[x] === 'opposition');
  const ownAct = oppositionOnlyBudget ? riksdag.filter((e) => e.kind === 'mot') : [];

  if (
    value === 'in_progress' &&
    !riksdag.some((e) => PLANNING_KINDS.includes(e.kind)) &&
    !(anchored && tiered.length > 0) &&
    ownAct.length === 0
  ) {
    fail(
      'verdict in_progress requires Riksdag evidence of kind dir, sou, ds or prop (agreement and budget evidence do not count; a budget promise may instead use a tiered budget entry plus a prop or bet, or, if opposition-only, a mot entry)',
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
    } else if (p.type === 'outcome') {
      // An outcome promise is judged on a measured result: a statistic plus action evidence. A law
      // alone says nothing about the result, and a series moving against the promise qualifies nothing.
      if (!(value === 'partially_fulfilled' ? statisticPartial : statisticFull)) {
        fail(
          value === 'fulfilled'
            ? 'verdict fulfilled on an outcome promise requires a statistic entry with relevance full that moved in the promised direction and reaches its target (a threshold level by a year within the term), plus a prop, bet or sfs entry; only for a promise with a government or support party'
            : 'verdict partially_fulfilled on an outcome promise requires a statistic entry that moved in the promised direction, plus a prop, bet or sfs entry; only for a promise with a government or support party',
        );
      }
    } else if (
      !riksdag.some((e) => e.kind === 'sfs') &&
      // An other_action promise asks for an act that is not a law: a treaty accession approved by a
      // Riksdag betänkande, or a national strategy delivered as a regeringsskrivelse. When that
      // document is the act promised, a bet or skr entry judged `full` makes it fulfilled. Never
      // partially_fulfilled, and no other promise type gets this route.
      !(
        p.type === 'other_action' &&
        value === 'fulfilled' &&
        riksdag.some((e) => (e.kind === 'bet' || e.kind === 'skr') && e.relevance === 'full')
      ) &&
      !(value === 'partially_fulfilled'
        ? ownAct.length > 0
        : ownAct.some((e) => e.relevance === 'full')) &&
      !(
        budgetOutcome &&
        // fulfilled needs an outcome entry that covers the whole promise, partial needs any outcome entry
        (value === 'partially_fulfilled' ||
          tiered.some((e) => e.tier === 'outcome' && e.relevance === 'full'))
      )
    ) {
      // An issued law is enough, including one whose in-force date (the sfs date) is still ahead:
      // the government's part is done once the law is adopted. Agreement and budget evidence do not count.
      fail(
        `verdict ${value} requires Riksdag evidence of kind sfs (an issued law, in force or not yet; agreement and budget evidence do not count), or, for an other_action promise, a bet or skr entry with relevance full that is the act promised (fulfilled only), or, for a budget promise by a government or support party, an outcome-tier budget entry plus a prop or bet, or, for an opposition-only budget promise, a mot entry (the party's own motion)${value === 'fulfilled' ? ' (fulfilled: the outcome or mot entry must have relevance full)' : ''}`,
      );
    }
  }
  if (value === 'broken' && oppositionOnlyBudget) {
    // The party's own act against its own promise: its motion rejects or cuts the targeted money.
    // A vote or a cited document does not stand in for it (docs/data-model.md, "Opposition promises").
    const contrary = p.evidence
      .filter(isRiksdagEvidence)
      .filter((e) => e.kind === 'mot' && e.relevance === 'contradicts');
    if (contrary.length === 0) {
      fail(
        "verdict broken on an opposition-only budget promise requires a mot entry with relevance contradicts (the party's own motion rejecting the targeted funding)",
      );
    } else if (!contrary.some((e) => reasoning.includes(e.designation))) {
      fail(
        'verdict broken on an opposition-only budget promise requires reasoning that cites the designation of the contradicting mot entry',
      );
    }
  } else if (value === 'broken') {
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
    p.evidence.forEach((e, i) => {
      if (e.kind === 'statistic' && p.type !== 'outcome') {
        ctx.addIssue({
          code: 'custom',
          path: ['evidence', i, 'kind'],
          message: 'statistic evidence is only allowed on an outcome promise',
        });
      }
    });
    checkVerdictEvidence(p, ctx);
  });

export const SERIES_SOURCES = [
  'scb',
  'bra',
  'migrationsverket',
  'skolverket',
  'socialstyrelsen',
  'energimyndigheten',
  'trafikanalys',
  'polisen',
  'other',
] as const;

/**
 * One official statistics series, `src/data/<term>/statistics/<id>.json`, written by an ingest
 * tool. `selection` keeps the exact query so a reader can re-run it. `values` is keyed by period
 * ("2022", "2022-Q1"). A price series sets `priceBasis` (the values are nominal or real); evidence
 * on it must then carry an `inflationNote`.
 */
export const statisticSeriesSchema = z
  .object({
    id: slug,
    source: z.enum(SERIES_SOURCES),
    table: z.string().min(1),
    selection: z.record(z.string(), z.string()),
    label: z.string().min(1),
    unit: z.string().min(1),
    frequency: z.enum(['year', 'quarter', 'month']),
    fetched_at: isoDate,
    priceBasis: z.enum(['nominal', 'real']).optional(),
    values: z.record(periodKey, z.number()),
  })
  .strict()
  .refine(
    (s) =>
      s.priceBasis !== undefined ||
      !/(?<![\p{L}\d])(kr|kronor|öre|sek)\s*(\/|per)\s*(l|liter|litre|kwh|mwh|kg|m3|m³)(?![\p{L}\d])/iu.test(
        s.unit,
      ),
    {
      path: ['priceBasis'],
      message: 'a price series (unit in kr or öre per unit) must set priceBasis',
    },
  )
  .refine((s) => Object.keys(s.values).every((k) => periodFormat(k) === s.frequency), {
    path: ['values'],
    message: 'every period key must match the series frequency (year, quarter or month)',
  })
  .refine((s) => Object.keys(s.values).length > 0, {
    path: ['values'],
    message: 'a series needs at least one value',
  });

export type StatisticSeries = z.infer<typeof statisticSeriesSchema>;

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

/** True for evidence that is a Riksdag document (not agreement, budget or statistic evidence). */
export function isRiksdagEvidence(e: Evidence): e is RiksdagEvidence {
  return e.kind !== 'agreement' && e.kind !== 'budget' && e.kind !== 'statistic';
}

export type PromiseRecord = z.infer<typeof promiseSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type RiksdagEvidence = Extract<Evidence, { kind: (typeof EVIDENCE_KINDS)[number] }>;
export type EvidenceFigure = z.infer<typeof evidenceFigureSchema>;
export type BudgetEvidence = Extract<Evidence, { kind: 'budget' }>;
export type StatisticEvidence = Extract<Evidence, { kind: 'statistic' }>;
export type AgreementEvidence = Extract<Evidence, { kind: 'agreement' }>;
export type AgreementOutcome = (typeof AGREEMENT_OUTCOMES)[number];
export type Verdict = z.infer<typeof verdictSchema>;
export type Source = z.infer<typeof sourceSchema>;
