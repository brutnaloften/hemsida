/**
 * Typed client for the Riksdag open data API (data.riksdagen.se).
 *
 * Endpoints, parameters and quirks are documented in docs/riksdag-api.md. The
 * API's JSON-from-XML conversion is lossy, so every response is parsed with
 * Zod and normalised to one shape:
 * - numbers arrive as strings, missing values as "" or null -> always strings
 * - lists flip between object (one item), array and absent -> always arrays
 * - http:// and protocol-relative URLs -> https://
 *
 * Requests are sequential and throttled (default 1 per second). `fetch` and
 * `sleep` are injectable so tests never touch the network.
 */

import { z } from 'zod';

export const RIKSDAG_BASE_URL = 'https://data.riksdagen.se';
/** Hard server-side cap on `sz` for dokumentlista (larger values return 200). */
export const MAX_PAGE_SIZE = 200;

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

/** String-ish scalar -> string; null/undefined/"" -> "". */
const str = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v) => (v == null ? '' : String(v)));

/** Integer-ish string ("196", "", null) -> number (0 when empty). */
const int = str.transform((v) => {
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? 0 : n;
});

/** Absent / null / single object / array -> array. */
function many<T extends z.ZodType>(item: T) {
  return z
    .union([z.array(item), item, z.null()])
    .optional()
    .transform((v): z.output<T>[] => (v == null ? [] : Array.isArray(v) ? v : [v]));
}

/** Page size clamped to 1..200; undefined or non-finite falls back to 200. */
function pageSize(sz: number | undefined): number {
  if (sz === undefined || !Number.isFinite(sz)) return MAX_PAGE_SIZE;
  return Math.min(Math.max(Math.trunc(sz), 1), MAX_PAGE_SIZE);
}

/** `http://x`, `//x` -> `https://x`; "" stays "". */
export function normaliseUrl(url: string): string {
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('http://')) return `https://${url.slice('http://'.length)}`;
  return url;
}

const url = str.transform(normaliseUrl);

/** Vote ids are lowercase in dokumentstatus and uppercase in voteringlista. */
export function sameVoteId(a: string, b: string): boolean {
  return a !== '' && a.toLowerCase() === b.toLowerCase();
}

/**
 * The `rm` (riksmöte) format differs per document type: a plain calendar year
 * for dir/sou/ds/sfs (the calendar year `startYear`), `YYYY/YY` for everything
 * else. `startYear` is the calendar year the riksmöte starts in
 * (2023 -> "2023" for dir, "2023/24" for prop).
 */
export function formatRm(doktyp: string, startYear: number): string {
  if (YEAR_RM_TYPES.has(doktyp)) return String(startYear);
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`;
}

const YEAR_RM_TYPES = new Set(['dir', 'sou', 'ds', 'sfs']);

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const riksdagDocumentSchema = z.object({
  dok_id: str,
  doktyp: str,
  subtyp: str,
  rm: str,
  beteckning: str,
  nummer: str,
  datum: str,
  publicerad: str,
  titel: str,
  organ: str,
  status: str,
  dokument_url_html: url,
  dokumentstatus_url_xml: url,
});
export type RiksdagDocument = z.infer<typeof riksdagDocumentSchema>;

const dokumentlistaSchema = z.object({
  dokumentlista: z.object({
    '@traffar': int,
    '@sida': int,
    '@sidor': int,
    dokument: many(riksdagDocumentSchema),
  }),
});

export interface DocumentPage {
  total: number;
  page: number;
  pages: number;
  documents: RiksdagDocument[];
}

export const riksdagReferenceSchema = z.object({
  referenstyp: str,
  ref_dok_id: str,
  ref_dok_typ: str,
  ref_dok_subtyp: str,
  ref_dok_rm: str,
  ref_dok_bet: str,
  ref_dok_titel: str,
});
export type RiksdagReference = z.infer<typeof riksdagReferenceSchema>;

export const committeeProposalSchema = z.object({
  punkt: str,
  rubrik: str,
  beslutstyp: str,
  votering_id: str,
  vinnare: str,
});
export type CommitteeProposal = z.infer<typeof committeeProposalSchema>;

const activitySchema = z.object({
  kod: str,
  namn: str,
  datum: str,
  status: str,
  ordning: str,
});
export type RiksdagActivity = z.infer<typeof activitySchema>;

const noteSchema = z.object({ kod: str, text: str });
export type RiksdagNote = z.infer<typeof noteSchema>;

// `dokument.html` (up to ~1 MB) is deliberately not in the schema: Zod strips it.
const dokumentstatusSchema = z.object({
  dokumentstatus: z.object({
    dokument: riksdagDocumentSchema,
    dokreferens: z.object({ referens: many(riksdagReferenceSchema) }).nullish(),
    dokutskottsforslag: z.object({ utskottsforslag: many(committeeProposalSchema) }).nullish(),
    dokaktivitet: z.object({ aktivitet: many(activitySchema) }).nullish(),
    dokuppgift: z.object({ uppgift: many(noteSchema) }).nullish(),
  }),
});

export interface DocumentStatus {
  document: RiksdagDocument;
  references: RiksdagReference[];
  committeeProposals: CommitteeProposal[];
  activities: RiksdagActivity[];
  notes: RiksdagNote[];
}

export const partyVotesSchema = z.object({
  parti: str,
  Ja: int,
  Nej: int,
  Frånvarande: int,
  Avstår: int,
});
export type PartyVotes = z.infer<typeof partyVotesSchema>;

export const voteTotalsSchema = z.object({
  votering_id: str,
  Ja: int,
  Nej: int,
  Frånvarande: int,
  Avstår: int,
});
export type VoteTotals = z.infer<typeof voteTotalsSchema>;

const voteringlistaPartiSchema = z.object({
  voteringlista: z.object({ votering: many(partyVotesSchema) }),
});
const voteringlistaTotalsSchema = z.object({
  voteringlista: z.object({ votering: many(voteTotalsSchema) }),
});

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class RiksdagHttpError extends Error {
  readonly status: number;
  readonly requestUrl: string;

  constructor(status: number, requestUrl: string) {
    super(`Riksdag API returned HTTP ${status} for ${requestUrl}`);
    this.name = 'RiksdagHttpError';
    this.status = status;
    this.requestUrl = requestUrl;
  }
}

export interface RiksdagClientOptions {
  fetch?: typeof fetch;
  /** Overridable for tests. */
  sleep?: (ms: number) => Promise<void>;
  baseUrl?: string;
  /** Minimum time between request starts. Default 1000. */
  minIntervalMs?: number;
  /** Retries on HTTP 429/5xx and network errors, with doubling backoff. Default 2. */
  retries?: number;
  userAgent?: string;
  now?: () => number;
}

export interface ListDocumentsParams {
  /** One or several document types, e.g. "prop" or ["prop", "bet"]. */
  doktyp?: string | string[];
  /** Riksmöte(n), in the per-type format (see {@link formatRm}). Several are unioned. */
  rm?: string | string[];
  /** Full-text search. */
  sok?: string;
  /** Date range on `datum`, YYYY-MM-DD. */
  from?: string;
  tom?: string;
  /** Committee filter. Sent as `org`; the docs' `organ` param does not filter. */
  org?: string;
  sort?: 'rel' | 'datum';
  sortorder?: 'asc' | 'desc';
  /** Page size, clamped to 1..200. Default 200. */
  sz?: number;
  /** 1-based page number. */
  p?: number;
}

export interface RiksdagClient {
  listDocuments(params: ListDocumentsParams): Promise<DocumentPage>;
  /** Pages through every hit. Restrict by rm/from/tom: whole types are huge. */
  listAllDocuments(params: Omit<ListDocumentsParams, 'p'>): AsyncGenerator<RiksdagDocument>;
  getDocumentStatus(dokId: string): Promise<DocumentStatus>;
  /** Party totals for one point of a betänkande. */
  getPartyVotes(args: { rm: string; bet: string; punkt: string }): Promise<PartyVotes[]>;
  /** One totals row per vote of a betänkande. */
  getVoteTotals(args: { rm: string; bet: string }): Promise<VoteTotals[]>;
}

export function createRiksdagClient(options: RiksdagClientOptions = {}): RiksdagClient {
  const doFetch = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = options.now ?? Date.now;
  const baseUrl = options.baseUrl ?? RIKSDAG_BASE_URL;
  const minInterval = options.minIntervalMs ?? 1000;
  const retries = options.retries ?? 2;
  const userAgent = options.userAgent ?? 'brutna-loften-tools (https://github.com/brutnaloften)';

  // Promise chain so concurrent callers are serialised and spaced out.
  let queue: Promise<unknown> = Promise.resolve();
  let lastStart = Number.NEGATIVE_INFINITY;

  async function throttledGet(requestUrl: string): Promise<unknown> {
    let delay = 1000;
    for (let attempt = 0; ; attempt++) {
      const wait = lastStart + minInterval - now();
      if (wait > 0) await sleep(wait);
      lastStart = now();
      try {
        const res = await doFetch(requestUrl, {
          headers: { 'User-Agent': userAgent, Accept: 'application/json' },
        });
        if (res.ok) return await res.json();
        await res.body?.cancel().catch(() => undefined);
        if (attempt < retries && (res.status === 429 || res.status >= 500)) {
          await sleep(delay);
          delay *= 2;
          continue;
        }
        throw new RiksdagHttpError(res.status, requestUrl);
      } catch (err) {
        if (err instanceof RiksdagHttpError || attempt >= retries) throw err;
        await sleep(delay);
        delay *= 2;
      }
    }
  }

  function get<S extends z.ZodType>(path: string, query: URLSearchParams, schema: S) {
    const requestUrl = `${baseUrl}${path}${query.size > 0 ? `?${query}` : ''}`;
    const run = queue.then(() => throttledGet(requestUrl));
    queue = run.catch(() => undefined);
    return run.then((json) => {
      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
        throw new Error(`Unexpected Riksdag response for ${requestUrl}: ${issues.join('; ')}`);
      }
      return parsed.data as z.output<S>;
    });
  }

  function buildListQuery(params: ListDocumentsParams): URLSearchParams {
    const q = new URLSearchParams();
    const list = (v?: string | string[]) => (v === undefined ? [] : [v].flat());
    if (params.doktyp !== undefined) q.set('doktyp', list(params.doktyp).join(','));
    for (const rm of list(params.rm)) q.append('rm', rm);
    for (const key of ['sok', 'from', 'tom', 'org', 'sort', 'sortorder'] as const) {
      const v = params[key];
      if (v !== undefined) q.set(key, v);
    }
    q.set('sz', String(pageSize(params.sz)));
    q.set('p', String(params.p ?? 1));
    q.set('utformat', 'json');
    return q;
  }

  async function listDocuments(params: ListDocumentsParams): Promise<DocumentPage> {
    const { dokumentlista: l } = await get(
      '/dokumentlista/',
      buildListQuery(params),
      dokumentlistaSchema,
    );
    return { total: l['@traffar'], page: l['@sida'], pages: l['@sidor'], documents: l.dokument };
  }

  return {
    listDocuments,

    async *listAllDocuments(params) {
      let page = 1;
      for (;;) {
        const result = await listDocuments({ ...params, p: page });
        yield* result.documents;
        if (page >= result.pages) return;
        page++;
      }
    },

    async getDocumentStatus(dokId) {
      const q = new URLSearchParams();
      const { dokumentstatus: s } = await get(
        `/dokumentstatus/${encodeURIComponent(dokId)}.json`,
        q,
        dokumentstatusSchema,
      );
      return {
        document: s.dokument,
        references: s.dokreferens?.referens ?? [],
        committeeProposals: s.dokutskottsforslag?.utskottsforslag ?? [],
        activities: s.dokaktivitet?.aktivitet ?? [],
        notes: s.dokuppgift?.uppgift ?? [],
      };
    },

    async getPartyVotes({ rm, bet, punkt }) {
      const q = new URLSearchParams({ rm, bet, punkt, gruppering: 'parti', utformat: 'json' });
      q.set('sz', String(MAX_PAGE_SIZE));
      const r = await get('/voteringlista/', q, voteringlistaPartiSchema);
      return r.voteringlista.votering;
    },

    async getVoteTotals({ rm, bet }) {
      const q = new URLSearchParams({ rm, bet, gruppering: 'votering_id', utformat: 'json' });
      q.set('sz', String(MAX_PAGE_SIZE));
      const r = await get('/voteringlista/', q, voteringlistaTotalsSchema);
      return r.voteringlista.votering;
    },
  };
}
