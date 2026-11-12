/**
 * Coverage judge for enacted laws (hemsida-d8i.3). Linking a proposition to its laws is deterministic
 * (sfs-register.ts); this only answers how much of a commitment a law delivers: all of it (full), a
 * part (partial), a clearly weaker form (weaker) or none of it (none, e.g. another part of an omnibus
 * bill). The judge sets no verdict; its labels feed apply-links (docs/data-model.md, "Rules for setting
 * a verdict from evidence"). Pure helpers and the judge implementations; tools/judge-sfs.ts does the I/O.
 */
import { query } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { SfsLaw, SfsStore } from './sfs-register.ts';
import { sha256, stableJson } from './score/plan.ts';

export const SFS_JUDGE_TEMPLATE_VERSION = 'v4';
/** Version of results re-judged with the complete law section (`judge-sfs.ts --recheck`); same instructions as v4. */
export const SFS_RECHECK_TEMPLATE_VERSION = 'v5';
/** Per-run cap on the law section in recheck mode (the normal cap is 2500): about 20k tokens; 14 of the 21 v4 fulls fit, the rest are omnibus sections of 60k+ chars, and judge-sfs warns for each that is still cut. */
export const RECHECK_LAW_SECTION_CHARS = 60000;

export const coverageLabelSchema = z.enum(['full', 'partial', 'weaker', 'none']);
export type CoverageLabel = z.infer<typeof coverageLabelSchema>;
export const confidenceSchema = z.enum(['high', 'medium', 'low']);

export const coverageSchema = z.strictObject({
  coverage: coverageLabelSchema,
  confidence: confidenceSchema,
  /** Swedish: what the law delivers of the commitment (empty for none). */
  covered_sv: z.string(),
  /** Swedish: what of the commitment the law does not deliver (empty for full). */
  missing_sv: z.string(),
  /** English justification referring to the shown text. */
  reason: z.string().min(1),
});
export type Coverage = z.infer<typeof coverageSchema>;

export const COVERAGE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    coverage: { type: 'string', enum: coverageLabelSchema.options },
    confidence: { type: 'string', enum: confidenceSchema.options },
    covered_sv: { type: 'string' },
    missing_sv: { type: 'string' },
    reason: { type: 'string' },
  },
  required: ['coverage', 'confidence', 'covered_sv', 'missing_sv', 'reason'],
  additionalProperties: false,
} as const;

export const SFS_JUDGE_INSTRUCTIONS = `Du bedömer hur stor del av ett politiskt löfte som en antagen lag genomför. Texten du får är på svenska.

Du får: (1) ett löfte (titel, beskrivning och citat ur överenskommelsen), (2) lagen från Regeringskansliets författningsregister (rubrik, omfattning, datum för ikraftträdande), (3) utdrag ur propositionen som ledde till lagen (sammanfattning och förslag till riksdagsbeslut) och, när den går att hitta, (3b) lagens egen lagtext och författningskommentar ur propositionen (avsnitten "Förslag till lag om ..."), och ibland (4) utskottets förslag till riksdagsbeslut när riksdagen ändrade regeringens förslag. Lagen är regeringens lagförslag så som riksdagen antog det, med de ändringar som utskottet föreslog.

Välj en etikett:
- full: lagen genomför hela åtagandet så som det är formulerat, inklusive alla delar och den skärpning, det belopp eller den målgrupp som nämns. Använd inte full om en del av löftet saknas i texten du ser.
- partial: lagen genomför bara en del av åtagandet (till exempel en av flera delar, en delmängd av målgruppen eller ett första steg).
- weaker: lagen går åt samma håll men är tydligt svagare eller snävare än löftet (lägre nivå, fler undantag, möjlighet i stället för skyldighet).
- none: lagen ligger i samma proposition men rör inte det här åtagandet (typiskt för en proposition med många lagändringar).

Regler:
- Bedöm ENDAST vad just den här lagen gör, med dess rubrik och omfattning i registerposten som utgångspunkt. Propositionstexten är sammanhang, inte poäng: att propositionen som helhet genomför löftet gör inte varje lag i den till en genomförare av löftet.
- Svara none när åtgärden ligger i en annan lag i samma proposition, eller när lagen bara är en följdändring eller konsekvensändring (till exempel en hänvisning, ett sekretessstöd, en sunset-bestämmelse eller en upphävd paragraf) som inte själv genomför något av löftet.
- Svara none också när lagen ändrar många paragrafer i en lag av andra skäl än löftet (till exempel ny struktur, nya begrepp eller omnumrering) och texten inte visar att just löftets åtgärd finns i den lagen; lagens omfattning är då ett tecken på omfattande omarbetning, inte på att löftet genomförs.
- Om lagen bara gäller en del av den målgrupp, de verksamheter eller de fall som löftet omfattar (till exempel bara vissa byggnadstyper) är det partial, aldrig full.
- Svara full bara när lagen själv, enligt sin rubrik och omfattning och propositionens beskrivning av den, genomför hela åtagandet. Om undantag gör att bara en del av målgruppen eller åtgärden täcks är det partial.
- Påstå ingenting som inte står i texten du fått. Om texten inte visar att en del av löftet genomförs räknas den delen som saknad. Gissa inte.
- Lagens omfattning (vilka paragrafer som ändras) är bara ett stöd; avgörande är vad propositionen och utskottets förslag säger att lagen innebär.
- När lagens egen lagtext eller författningskommentar visas är den huvudunderlaget: bedöm utifrån vad just de paragraferna säger, inte utifrån paragrafnummer eller propositionens sammanfattning. Visas ingen sådan text för en proposition med flera lagar, var försiktig med full.
- Bedöm bara om lagen genomför åtagandet, inte om den är bra eller om den har börjat gälla.
- confidence: high när texten tydligt visar svaret, medium när det kräver en rimlig tolkning, low när texten är tunn eller oklar.
- covered_sv: en kort svensk mening om vad lagen genomför av åtagandet (tom sträng vid none).
- missing_sv: en kort svensk mening om vad av åtagandet lagen inte genomför (tom sträng vid full).
- reason: en till tre meningar på engelska som motiverar etiketten och hänvisar till texten du ser.`;

// ---- pair planning ----

/** The fields of a promise the planner reads (a structural subset of the schema). */
export interface PlannablePromise {
  id: string;
  type: string;
  title: string;
  description: string;
  source?: { quote?: string | undefined } | undefined;
  evidence: readonly { kind: string; dok_id?: string; relevance?: string }[];
}
/** A store document the planner can resolve a betänkande reference against. */
export interface PlannableDoc {
  dok_id: string;
  doktyp: string;
  rm: string;
  beteckning: string;
  titel?: string | undefined;
}

/** Budget propositions are handled slice by slice; no single law implements a promise from them. */
export const isBudgetDoc = (d: PlannableDoc): boolean =>
  d.doktyp === 'prop' && (d.beteckning === '1' || /^Budgetpropositionen/.test(d.titel ?? ''));

export interface SfsPair {
  /** `<promise_id>::<sfs-key>`, e.g. `tido-x::sfs-2025-625`. */
  id: string;
  promise_id: string;
  /** Key in the SFS store, `sfs-2025-625`. */
  sfs_key: string;
  /** Propositions linked on the promise that the law cites (store dok_ids). */
  prop_ids: string[];
  /** Deciding betänkanden of the law that exist in the Riksdag store (dok_ids). */
  bet_ids: string[];
}

/**
 * One pair per (promise, law): only legislative promises, only laws reached through a proposition that
 * is already linked as evidence (relevance full or partial, not `contradicts`). Sorted by id.
 */
export function planSfsPairs(
  promises: readonly PlannablePromise[],
  sfs: Pick<SfsStore, 'laws' | 'byProp'>,
  docs: readonly PlannableDoc[],
  opts: { idPrefix?: string; only?: string; limit?: number } = {},
): SfsPair[] {
  const betByRef = new Map(
    docs.filter((d) => d.doktyp === 'bet').map((d) => [`${d.rm}:${d.beteckning}`, d.dok_id]),
  );
  const budget = new Set(docs.filter(isBudgetDoc).map((d) => d.dok_id));
  const pairs: SfsPair[] = [];
  for (const p of promises) {
    if (p.type !== 'legislative') continue;
    if (opts.idPrefix && !p.id.startsWith(opts.idPrefix)) continue;
    if (opts.only && p.id !== opts.only) continue;
    const linked = new Set(
      p.evidence
        .filter((e) => e.kind === 'prop' && (e.relevance === 'full' || e.relevance === 'partial'))
        .map((e) => e.dok_id!)
        .filter((id) => !budget.has(id)),
    );
    const byLaw = new Map<string, Set<string>>();
    for (const propId of [...linked].sort()) {
      for (const key of sfs.byProp[propId] ?? []) {
        if (!sfs.laws[key]) continue;
        let set = byLaw.get(key);
        if (!set) byLaw.set(key, (set = new Set()));
        set.add(propId);
      }
    }
    for (const [key, propIds] of byLaw) {
      const law = sfs.laws[key]!;
      pairs.push({
        id: `${p.id}::${key}`,
        promise_id: p.id,
        sfs_key: key,
        prop_ids: [...propIds],
        bet_ids: law.bets.map((b) => betByRef.get(b)).filter((x): x is string => !!x),
      });
    }
  }
  pairs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return opts.limit !== undefined ? pairs.slice(0, opts.limit) : pairs;
}

// ---- prompt ----

export interface JudgeInput {
  promise: { title: string; description: string; quote?: string | undefined };
  law: Pick<SfsLaw, 'sfs' | 'title' | 'omfattning' | 'ikraft'>;
  /** Tier-1 text of each linked proposition the law cites, already trimmed. */
  propTexts: { designation: string; text: string }[];
  /** The deciding betänkande's proposal, only when it differs from the proposition. */
  betProposal?: { designation: string; text: string } | undefined;
  /** The law's own sections (lagtext and författningskommentar) from each cited proposition. */
  lawSections?: { designation: string; text: string }[] | undefined;
}

const MAX_OMFATTNING_CHARS = 1200;

export function buildPrompt(i: JudgeInput): string {
  const om = i.law.omfattning ?? '(saknas)';
  const parts = [
    `LÖFTE\nTitel: ${i.promise.title}\nBeskrivning: ${i.promise.description}` +
      (i.promise.quote ? `\nCitat ur överenskommelsen: ${i.promise.quote}` : ''),
    `LAG (författningsregistret)\nRubrik: ${i.law.title}\nSFS: ${i.law.sfs}\nOmfattning: ${
      om.length > MAX_OMFATTNING_CHARS ? om.slice(0, MAX_OMFATTNING_CHARS) + ' [...]' : om
    }\nIkraft: ${i.law.ikraft ?? '(saknas)'}`,
    ...i.propTexts.map((t) => `PROPOSITION ${t.designation}\n${t.text}`),
    ...(i.lawSections ?? []).map(
      (t) => `LAGENS EGEN TEXT I PROPOSITION ${t.designation}\n${t.text}`,
    ),
    ...(i.betProposal
      ? [
          `UTSKOTTETS FÖRSLAG TILL RIKSDAGSBESLUT (betänkande ${i.betProposal.designation}, ändrar regeringens förslag)\n${i.betProposal.text}`,
        ]
      : []),
  ];
  return parts.join('\n\n');
}

/** Content-addressed key: judge kind (a fake run never fills real keys), model, template version, instructions and the exact prompt text. */
export function judgeKey(
  kind: string,
  model: string,
  prompt: string,
  instructions: string,
): string {
  return sha256(
    stableJson({
      judge_kind: kind,
      model,
      template_version: SFS_JUDGE_TEMPLATE_VERSION,
      instructions_sha256: sha256(instructions),
      prompt_sha256: sha256(prompt),
    }),
  );
}

const stripLeaders = (s: string) => s.replace(/\s*\.{4,}.*$/, '').trim();

const base = (s: string): string =>
  stripLeaders(s)
    .replace(/^\d+(\.\d+)*\s*/, '')
    .replace(/\s*Prop\.\s*\d{4}\/\d{2}:\d+/gi, '')
    .replace(/^förslag(et)? till\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/**
 * Comparable form of a law title or a bill heading. Strict: the register's own `(YYYY:N)` after
 * `Lag`/`Förordning` is dropped (the bill heading has none), any amended act's number stays. Loose: every
 * `(YYYY:N)` is dropped, for headings that omit the amended act's number or name a new law without its.
 */
export const normalizeLawTitle = (title: string, loose = false): string => {
  const t = base(title).replace(/^(lag|förordning|kungörelse)\s+\(\d{4}:\d+\)\s+/, '$1 ');
  return loose ? t.replace(/\s*\(\d{4}:\d+\)/g, '').trim() : t;
};

/** A bill's lagtext or författningskommentar heading: `2.1Förslag till ...`, `10.2Förslaget till ...`, `Förslag till ...`. */
const LAW_HEADING = /^(\d+(\.\d+)*\s*)?Förslag(et)? till (lag|förordning|[a-zåäö]+lag\b)/i;
const DOT_LEADER = /\.{4,}/;
/** A bill chapter or annex heading (short, no sentence punctuation, no `§`), which ends a law's run. */
const isSectionEnd = (t: string): boolean =>
  /^Bilaga \d/.test(t) ||
  (/^\d{1,2}\s*[A-ZÅÄÖ][a-zåäö]/.test(t) && t.length < 90 && !/[.:;§]$|§/.test(t));
/** A standalone heading before an annex that reprints an inquiry's or the Council on Legislation's draft. */
const DRAFT_MARKER = /^(Betänkandets|Promemorians|Lagrådsremissens|Utkastet till) lagförslag\s*$/i;
const MIN_RUN_CHARS = 150;

/**
 * Paragraphs that belong to the table of contents: a dot-leader row, or the one or two short paragraphs
 * before it (a wrapped entry puts the leaders on its last line).
 */
function tocParagraphs(paragraphs: readonly { text: string }[]): boolean[] {
  const dot = paragraphs.map((p) => DOT_LEADER.test(p.text));
  return paragraphs.map((p, i) => {
    if (dot[i] || dot[i + 1]) return true;
    return dot[i + 2] === true && paragraphs[i + 1]!.text.length < 100 && p.text.length < 100;
  });
}

/**
 * The law's own sections of a proposition: runs that start at a `Förslag till lag om ...` heading naming
 * this law (the lagtext, and the heading again in the författningskommentar), up to the next such heading
 * or chapter. Headings may be numbered, contain a `Prop. YYYY/YY:N` page header, or wrap over several
 * paragraphs. The table of contents (also wrapped entries) never starts or belongs to a run, a run
 * containing dot leaders is dropped, and the scan ends at a standalone `Betänkandets/Promemorians/
 * Lagrådsremissens lagförslag` heading or at the first annex after the författningskommentar, because annexes
 * reprint drafts that are not the bill's text. Each run is cut at `maxCharsEach`; null when the
 * proposition has no section for the law.
 */
export function extractLawSections(
  paragraphs: readonly { text: string }[],
  lawTitle: string,
  maxCharsEach: number,
  maxRuns = 2,
): string | null {
  const toc = tocParagraphs(paragraphs);
  let end = paragraphs.length;
  let afterKommentar = false;
  for (let i = 0; i < paragraphs.length; i++) {
    if (toc[i]) continue;
    const t = paragraphs[i]!.text;
    if (/^\d+\s*Författningskommentar/i.test(t)) afterKommentar = true;
    if (DRAFT_MARKER.test(t) || (afterKommentar && /^Bilaga \d/.test(t))) {
      end = i;
      break;
    }
  }
  for (const loose of [false, true]) {
    const want = normalizeLawTitle(lawTitle, loose);
    const runs: string[] = [];
    for (let i = 0; i < end && runs.length < maxRuns; i++) {
      const t = paragraphs[i]!.text;
      if (toc[i] || !LAW_HEADING.test(t)) continue;
      // A heading may wrap over the next few short paragraphs.
      let head = t;
      let next = i + 1;
      let matched = normalizeLawTitle(head, loose) === want;
      for (let k = 0; k < 4 && !matched && next < end; k++) {
        const u = paragraphs[next]!.text;
        if (
          toc[next] ||
          u.length > 100 ||
          LAW_HEADING.test(u) ||
          isSectionEnd(u) ||
          /^Härigenom/.test(u)
        )
          break;
        head += ' ' + u;
        next++;
        matched = normalizeLawTitle(head, loose) === want;
      }
      if (!matched) continue;
      const body: string[] = [t];
      let leaders = false;
      for (let j = i + 1; j < end; j++) {
        const u = paragraphs[j]!.text;
        if (LAW_HEADING.test(u) || isSectionEnd(u)) break;
        if (DOT_LEADER.test(u)) leaders = true;
        body.push(u);
      }
      const text = body.join('\n');
      if (leaders || text.length < MIN_RUN_CHARS) continue;
      runs.push(
        text.length <= maxCharsEach ? text : text.slice(0, maxCharsEach) + '\n[... avkortat ...]',
      );
    }
    if (runs.length) return runs.join('\n\n');
  }
  return null;
}

/** Tier-1 sections to a text, the proposal sections first, cut at `maxChars`. */
export function renderTier1(
  sections: readonly { heading: string; text: string }[],
  maxChars: number,
): string {
  const proposal = (h: string) => /förslag till riksdagsbeslut|lagförslag/i.test(h);
  const ordered = [
    ...sections.filter((s) => proposal(s.heading)),
    ...sections.filter((s) => !proposal(s.heading)),
  ];
  const text = ordered.map((s) => (s.heading ? `## ${s.heading}\n${s.text}` : s.text)).join('\n\n');
  return text.length <= maxChars ? text : text.slice(0, maxChars) + '\n[... avkortat ...]';
}

/**
 * The part of a betänkande that states the committee's proposal, but only when it changes the
 * government's bill ("med de ändringar som följer av ..."); null otherwise.
 */
export function changedProposal(
  sections: readonly { heading: string; text: string }[],
  maxChars: number,
): string | null {
  const full = sections.map((s) => s.text).join('\n\n');
  const at = full.search(/Utskottets förslag till riksdagsbeslut/i);
  if (at < 0) return null;
  const passage = full.slice(at);
  const hasChange = /med (de |den )?ändring(ar)? som (följer av|framgår av)|med följande ändring/i;
  if (!hasChange.test(passage)) return null;
  return passage.slice(0, maxChars);
}

// ---- judges ----

export interface JudgeResult {
  coverage: Coverage;
  tokens: number;
  cost_usd?: number;
}
export interface CoverageJudge {
  kind: string;
  judge(prompt: string, instructions: string): Promise<JudgeResult>;
}

export class JudgeError extends Error {
  status: number | null | undefined;
  constructor(message: string, status?: number | null) {
    super(message);
    this.name = 'JudgeError';
    this.status = status;
  }
}
export function isTransientJudgeError(err: unknown): boolean {
  const s = err instanceof JudgeError ? err.status : undefined;
  return typeof s === 'number' && (s === 429 || s === 529 || s >= 500);
}

/** The parts of an Agent SDK result message the judge reads (structural, so tests need no SDK). */
export interface ClaudeMessage {
  subtype: string;
  is_error: boolean;
  api_error_status?: number | null;
  result?: string;
  errors?: string[];
  structured_output?: unknown;
  modelUsage: Record<
    string,
    {
      inputTokens: number;
      outputTokens: number;
      cacheReadInputTokens: number;
      cacheCreationInputTokens: number;
      costUSD?: number;
    }
  >;
  usage: { input_tokens: number };
}

export function parseClaudeCoverage(message: ClaudeMessage): JudgeResult {
  if (message.subtype !== 'success' || message.is_error) {
    const detail = message.result ?? message.errors?.join('; ') ?? 'no detail';
    throw new JudgeError(
      `claude: ${message.subtype} (status ${message.api_error_status ?? '-'}): ${detail}`,
      message.api_error_status,
    );
  }
  const parsed = coverageSchema.safeParse(message.structured_output);
  if (!parsed.success) {
    throw new Error(`claude: structured_output does not match the schema: ${parsed.error.message}`);
  }
  const usages = Object.values(message.modelUsage);
  const tokens = usages.length
    ? usages.reduce(
        (s, u) =>
          s + u.inputTokens + u.outputTokens + u.cacheReadInputTokens + u.cacheCreationInputTokens,
        0,
      )
    : message.usage.input_tokens;
  const costs = usages.map((u) => u.costUSD);
  const cost_usd =
    costs.length && costs.every((c) => typeof c === 'number')
      ? (costs as number[]).reduce((a, b) => a + b, 0)
      : undefined;
  return { coverage: parsed.data, tokens, ...(cost_usd === undefined ? {} : { cost_usd }) };
}

/** Agent SDK on the local Claude Code login (a subscription), not a billed API key. */
export function createClaudeCoverageJudge(model: string): CoverageJudge {
  return {
    kind: 'claude',
    async judge(prompt, instructions) {
      for await (const message of query({
        prompt,
        options: {
          model,
          settingSources: [],
          tools: [],
          maxTurns: 3, // structured output occasionally needs a second turn (error_max_turns at 1)
          thinking: { type: 'disabled' },
          systemPrompt: instructions,
          outputFormat: { type: 'json_schema', schema: COVERAGE_JSON_SCHEMA },
        },
      })) {
        if (message.type !== 'result') continue;
        return parseClaudeCoverage(message as unknown as ClaudeMessage);
      }
      throw new Error('claude: query() ended without a result message');
    },
  };
}

/** Deterministic offline judge for tests and smoke runs: 'none' unless the law title shares words with the promise. */
export function createFakeCoverageJudge(): CoverageJudge {
  const words = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\p{N}]{5,}/gu) ?? []);
  return {
    kind: 'fake',
    async judge(prompt) {
      const law = /Rubrik: (.*)/.exec(prompt)?.[1] ?? '';
      const promise = /Titel: (.*)/.exec(prompt)?.[1] ?? '';
      const promiseWords = words(promise);
      const shared = [...words(law)].filter((w) => promiseWords.has(w)).length;
      const label: CoverageLabel = shared >= 2 ? 'full' : shared === 1 ? 'partial' : 'none';
      return {
        coverage: {
          coverage: label,
          confidence: 'low',
          covered_sv: label === 'none' ? '' : 'fake',
          missing_sv: label === 'full' ? '' : 'fake',
          reason: `fake judge: ${shared} shared title word(s)`,
        },
        tokens: Math.ceil(prompt.length / 3),
      };
    },
  };
}

export function createCoverageJudge(
  kind: string,
  model: string,
  env: Record<string, string | undefined> = process.env,
): CoverageJudge {
  if (kind === 'fake') return createFakeCoverageJudge();
  if (kind === 'claude') {
    if (env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN) {
      throw new Error(
        'ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN is set; the judge runs through the local subscription login (claude login), so unset it before running',
      );
    }
    return createClaudeCoverageJudge(model);
  }
  throw new Error(`unknown judge kind: ${kind}`);
}

// ---- cache and run ----

export interface CoverageCache {
  has(key: string): boolean;
  get(key: string): { coverage: Coverage; tokens: number } | undefined;
  put(key: string, entry: { coverage: Coverage; tokens: number }): void;
}
export function createMemoryCoverageCache(): CoverageCache {
  const m = new Map<string, { coverage: Coverage; tokens: number }>();
  return { has: (k) => m.has(k), get: (k) => m.get(k), put: (k, e) => void m.set(k, e) };
}

export interface SfsRequest {
  pair: SfsPair;
  key: string;
  prompt: string;
  estimated_cost_usd: number;
}
export interface RunSummary {
  /** `incomplete`: finished, but some requests were skipped on transient errors. */
  status: 'complete' | 'incomplete' | 'budget_exceeded' | 'failed';
  error?: string;
  total: number;
  cached: number;
  sent: number;
  skipped: number;
  cost_usd: number;
  tokens: number;
}

/** Flat price used to estimate a request before it is sent (input at Sonnet pricing plus a small output, scaled by 1.5 after the pilot: SDK overhead made real cost about 1.5x the raw estimate). */
export const estimateCostUsd = (prompt: string, instructions: string): number =>
  1.5 * (((prompt.length + instructions.length) / 3) * (3 / 1e6) + 400 * (15 / 1e6));

/** Runs the uncached requests with a concurrency limit and a hard cost guard; completed ones are cached. */
export async function runRequests(
  requests: readonly SfsRequest[],
  opts: {
    judge: CoverageJudge;
    instructions: string;
    cache: CoverageCache;
    concurrency?: number;
    /** Cap for this call; the CLI passes the run's cap minus what earlier calls under the same name spent. */
    maxCostUsd: number;
    onProgress?: (done: number, total: number) => void;
    /** Called after each completed request with this call's running spend, so a crash loses nothing. */
    onSpend?: (costUsd: number) => void;
  },
): Promise<RunSummary> {
  const todo = requests.filter((r) => !opts.cache.has(r.key));
  const s: RunSummary = {
    status: 'complete',
    total: requests.length,
    cached: requests.length - todo.length,
    sent: 0,
    skipped: 0,
    cost_usd: 0,
    tokens: 0,
  };
  let next = 0;
  let inflight = 0;
  let stopped = false;
  async function worker(): Promise<void> {
    while (!stopped && next < todo.length) {
      const req = todo[next++]!;
      if (s.cost_usd + inflight + req.estimated_cost_usd > opts.maxCostUsd) {
        stopped = true;
        s.status = 'budget_exceeded';
        s.error = `budget guard: spent $${s.cost_usd.toFixed(4)}, next request estimated $${req.estimated_cost_usd.toFixed(4)}, cap $${opts.maxCostUsd}; completed requests are cached, re-run to resume`;
        return;
      }
      inflight += req.estimated_cost_usd;
      try {
        const res = await opts.judge.judge(req.prompt, opts.instructions);
        opts.cache.put(req.key, { coverage: res.coverage, tokens: res.tokens });
        s.sent++;
        s.tokens += res.tokens;
        s.cost_usd += res.cost_usd ?? req.estimated_cost_usd;
        opts.onSpend?.(s.cost_usd);
        opts.onProgress?.(s.cached + s.sent, s.total);
      } catch (err) {
        if (isTransientJudgeError(err)) {
          s.skipped++;
          continue;
        }
        stopped = true;
        if (s.status === 'complete') {
          s.status = 'failed';
          s.error = err instanceof Error ? err.message : String(err);
        }
      } finally {
        inflight -= req.estimated_cost_usd;
      }
    }
  }
  const n = Math.max(1, Math.min(opts.concurrency ?? 4, todo.length || 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  if (s.skipped > 0 && s.status === 'complete') {
    s.status = 'incomplete';
    s.error = `${s.skipped} request(s) skipped on transient API errors; re-run to retry them`;
  }
  return s;
}

export interface SfsResult {
  id: string;
  promise_id: string;
  sfs: string;
  sfs_dok_id: string;
  label: CoverageLabel;
  confidence: z.infer<typeof confidenceSchema>;
  covered_sv: string;
  missing_sv: string;
  reason: string;
  /** Template version of the prompt that produced this judgement. */
  template_version: string;
}

/** Results of every request that has a cached judgement, in pair order. */
export function collectResults(
  requests: readonly SfsRequest[],
  cache: CoverageCache,
  laws: Record<string, SfsLaw>,
  templateVersion: string = SFS_JUDGE_TEMPLATE_VERSION,
): { results: SfsResult[]; missing: number } {
  const results: SfsResult[] = [];
  let missing = 0;
  for (const r of requests) {
    const hit = cache.get(r.key);
    if (!hit) {
      missing++;
      continue;
    }
    results.push({
      id: r.pair.id,
      promise_id: r.pair.promise_id,
      sfs: laws[r.pair.sfs_key]!.sfs,
      sfs_dok_id: r.pair.sfs_key,
      label: hit.coverage.coverage,
      confidence: hit.coverage.confidence,
      covered_sv: hit.coverage.covered_sv,
      missing_sv: hit.coverage.missing_sv,
      reason: hit.coverage.reason,
      template_version: templateVersion,
    });
  }
  return { results, missing };
}

/**
 * Re-judging after a template change: pairs the earlier run labelled in `rerunLabels` (or never judged)
 * are sent again. An earlier label outside `rerunLabels` is kept only when its result already carries the
 * current template version (same input). A none or weaker label from another template version is
 * re-judged too: a changed template changes the input and can move labels up as well as down.
 * `kept` carries each kept result with its own template version.
 */
export function splitByEarlierRun(
  pairs: readonly SfsPair[],
  earlier: readonly SfsResult[],
  rerunLabels: ReadonlySet<string>,
  currentVersion: string = SFS_JUDGE_TEMPLATE_VERSION,
): { rerun: SfsPair[]; kept: SfsResult[] } {
  const byId = new Map(earlier.map((r) => [r.id, r]));
  const rerun: SfsPair[] = [];
  const kept: SfsResult[] = [];
  for (const p of pairs) {
    const old = byId.get(p.id);
    if (old && !rerunLabels.has(old.label) && old.template_version === currentVersion)
      kept.push(old);
    else rerun.push(p);
  }
  return { rerun, kept };
}

/**
 * Recheck mode: only the pairs the earlier run labelled `full` (any confidence) are judged again, with the
 * complete law section. Everything else keeps its earlier result untouched. Pairs the earlier run never
 * judged are neither rejudged nor kept (`unjudged`): a recheck refines a run, it does not extend it.
 * A full that already carries `recheckVersion` is kept (same input).
 */
export function splitForRecheck(
  pairs: readonly SfsPair[],
  earlier: readonly SfsResult[],
  recheckVersion: string = SFS_RECHECK_TEMPLATE_VERSION,
): { rerun: SfsPair[]; kept: SfsResult[]; unjudged: SfsPair[] } {
  const byId = new Map(earlier.map((r) => [r.id, r]));
  const rerun: SfsPair[] = [];
  const kept: SfsResult[] = [];
  const unjudged: SfsPair[] = [];
  for (const p of pairs) {
    const old = byId.get(p.id);
    if (!old) unjudged.push(p);
    else if (old.label === 'full' && old.template_version !== recheckVersion) rerun.push(p);
    else kept.push(old);
  }
  return { rerun, kept, unjudged };
}

/** Earlier results with the file-level template version as default; a version on the result itself wins (files from a recheck are mixed). */
export function resultsWithFileVersion(
  fileVersion: string,
  results: readonly Record<string, unknown>[],
): SfsResult[] {
  return results.map((r) => ({ template_version: fileVersion, ...r })) as unknown as SfsResult[];
}
