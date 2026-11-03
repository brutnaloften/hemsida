/**
 * Full text of Riksdag documents for the eval labeller (hemsida-4np.16) and, later, the
 * year-over-year comparison sheet. `data.riksdagen.se/dokument/<id>.text` returns a
 * dokumentstatus-style XML whose `<html>` element holds the document as XML-escaped HTML,
 * with numeric entities (soft hyphens, non-breaking spaces) and `<span>` runs inside words.
 *
 * This module fetches it (sequentially, 1 req/s, cached on disk), turns it into plain
 * paragraphs and annotates each paragraph with its section and speaker (government,
 * committee majority, reservation or special statement by party, motion by party).
 * Pure functions are separate from the fetcher so they can be tested on fixtures.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { RIKSDAG_BASE_URL } from './riksdag.ts';

export interface RawParagraph {
  text: string;
  /** True for headings (h1-h6 or a heading paragraph class). */
  heading: boolean;
}

export type SpeakerKind =
  | 'government'
  | 'committee'
  | 'reservation'
  | 'special_statement'
  | 'motion'
  | 'inquiry'
  | 'other';

export interface Speaker {
  kind: SpeakerKind;
  /** Party codes for reservations, special statements and motions. */
  parties: string[];
  /** Swedish label for display. */
  label: string;
}

export interface Paragraph extends RawParagraph {
  index: number;
  /** Nearest preceding heading (empty before the first one). */
  section: string;
  /** Nearest preceding `Anslaget N:N ...` heading, if any. */
  anslag: string | null;
  speaker: Speaker;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  shy: '­',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#x')) return String.fromCodePoint(parseInt(body.slice(2), 16));
    if (body.startsWith('#')) return String.fromCodePoint(parseInt(body.slice(1), 10));
    return NAMED_ENTITIES[body] ?? whole;
  });
}

function cleanText(s: string): string {
  return decodeEntities(s).replace(/­/g, '').replace(/[   ]/g, ' ').replace(/\s+/g, ' ').trim();
}

const BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'tr', 'div', 'br']);
const HEADING_CLASS = /^R\d$|rubrik|^Heading/i;
const DROP_CLASS = /^(TOC\d*|Mellanrum)$/i;

/** Turn the `.text` response (or plain HTML) into paragraphs, dropping the table of contents. */
export function parseRiksdagText(raw: string): RawParagraph[] {
  let html = raw;
  const m = /<html>([\s\S]*)<\/html>/.exec(raw);
  if (m) html = decodeEntities(m[1]!);
  html = html.replace(/<(style|script)[\s\S]*?<\/\1>/gi, '');

  const out: RawParagraph[] = [];
  let buf = '';
  let heading = false;
  let drop = false;
  const flush = () => {
    const text = cleanText(buf.replace(/<[^>]*>/g, ''));
    if (text && !drop && !/^\d+\.$/.test(text)) out.push({ text, heading });
    buf = '';
  };

  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g;
  let last = 0;
  for (let t = re.exec(html); t !== null; t = re.exec(html)) {
    buf += html.slice(last, t.index);
    last = re.lastIndex;
    const name = t[2]!.toLowerCase();
    if (!BLOCK_TAGS.has(name)) {
      if (name === 'td' || name === 'th') buf += ' ';
      continue;
    }
    flush();
    if (t[1] === '/' || name === 'br') {
      heading = false;
      drop = false;
      continue;
    }
    const cls = /class="([^"]*)"/.exec(t[3]!)?.[1] ?? '';
    heading = /^h[1-6]$/.test(name) || HEADING_CLASS.test(cls);
    drop = DROP_CLASS.test(cls);
  }
  buf += html.slice(last);
  flush();
  return out;
}

const PARTY_NAMES: Record<string, string> = {
  socialdemokraterna: 'S',
  vänsterpartiet: 'V',
  centerpartiet: 'C',
  miljöpartiet: 'MP',
  'miljöpartiet de gröna': 'MP',
  sverigedemokraterna: 'SD',
  moderaterna: 'M',
  kristdemokraterna: 'KD',
  liberalerna: 'L',
};

/** Party codes inside a trailing parenthesis, e.g. "... punkt 2 (S, V)" -> S, V. */
export function trailingParties(heading: string): string[] {
  const m = /\(([A-ZÅÄÖ]{1,2}(?:\s*(?:,|och)\s*[A-ZÅÄÖ]{1,2})*)\)\s*$/.exec(heading);
  if (!m) return [];
  return m[1]!.match(/MP|SD|KD|[SVCML]/g) ?? [];
}

const DISSENT_START =
  /^(\d+\.\s*)?(Reservation|Reservationer|Särskilt yttrande|Särskilda yttranden|Avvikande mening|Avvikande meningar)\b/i;
const DISSENT_END = /^(Bilaga|Bilagor|Utskottets|Regeringens|Förslag|Beslut|Motion|Ärendet)/i;

/** Headings that end the per-anslag part of a budget document. */
const ANSLAG_END = /^(Motionerna|Utskottets|Särskilda|Reservation|Bilaga|Förslag|Beslut)/i;

const GOV_PARA = /^Regeringen (föreslår|bedömer|anser|avser|har)|^Regeringens (förslag|bedömning)/;
const COMMITTEE_PARA = /^Utskottet\b/;

function partyList(parties: string[]): string {
  return parties.length > 0 ? ` (${parties.join(', ')})` : '';
}

/**
 * Annotate paragraphs with section, anslag and speaker. `doktyp` sets the default speaker:
 * prop and dir are the government, sou/ds an inquiry, bet the committee majority.
 */
export function annotateParagraphs(raw: RawParagraph[], doktyp: string): Paragraph[] {
  const base: Speaker =
    doktyp === 'prop' || doktyp === 'dir'
      ? { kind: 'government', parties: [], label: 'Regeringen' }
      : doktyp === 'sou' || doktyp === 'ds'
        ? { kind: 'inquiry', parties: [], label: 'Utredningen' }
        : doktyp === 'bet'
          ? { kind: 'committee', parties: [], label: 'Utskottet (majoriteten)' }
          : { kind: 'other', parties: [], label: 'Okänd avsändare' };

  let section = '';
  let anslag: string | null = null;
  let dissent: Speaker | null = null;
  let motionParty: string | null = null;
  const out: Paragraph[] = [];

  raw.forEach((p, index) => {
    let speaker: Speaker;
    if (p.heading) {
      section = p.text;
      if (/^Anslaget \d+:\d+/.test(p.text)) anslag = p.text;
      else if (ANSLAG_END.test(p.text) || PARTY_NAMES[p.text.toLowerCase()]) anslag = null;
      if (DISSENT_START.test(p.text)) {
        const kind = /yttrande/i.test(p.text) ? 'special_statement' : 'reservation';
        const parties = trailingParties(p.text);
        dissent = {
          kind,
          parties,
          label: `${kind === 'reservation' ? 'Reservation' : 'Särskilt yttrande'}${partyList(parties)}`,
        };
        motionParty = null;
      } else if (dissent) {
        const parties = trailingParties(p.text);
        if (parties.length > 0) {
          dissent = {
            ...dissent,
            parties,
            label: `${dissent.kind === 'reservation' ? 'Reservation' : 'Särskilt yttrande'}${partyList(parties)}`,
          };
        } else if (DISSENT_END.test(p.text)) {
          dissent = null;
        }
      }
      const party = PARTY_NAMES[p.text.toLowerCase()];
      if (party && !dissent) motionParty = party;
      else if (!party && !dissent && !/\(.*\)\s*$/.test(p.text)) motionParty = null;
      speaker = dissent ?? { ...base };
    } else if (dissent) {
      speaker = dissent;
    } else if (motionParty && !GOV_PARA.test(p.text) && !COMMITTEE_PARA.test(p.text)) {
      speaker = { kind: 'motion', parties: [motionParty], label: `Motion (${motionParty})` };
    } else if (base.kind === 'committee' && (anslag !== null || GOV_PARA.test(p.text))) {
      // Per-anslag sections of a budget betänkande restate the government's proposal.
      speaker = { kind: 'government', parties: [], label: 'Regeringen (refererad)' };
    } else {
      speaker = { ...base };
    }
    out.push({ ...p, index, section, anslag, speaker });
  });
  return out;
}

export interface FetchTextOptions {
  cacheDir: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  minIntervalMs?: number;
  userAgent?: string;
  baseUrl?: string;
}

/**
 * Fetches `<dok_id>.text` into the cache (gitignored `tools/out/riksdag-text/`) unless
 * already there. Requests are spaced `minIntervalMs` apart (default 1000), retried on
 * 429/5xx. Returns the raw response, or null when the document has no text (404/empty).
 */
export function createTextFetcher(
  options: FetchTextOptions,
): (dokId: string) => Promise<string | null> {
  const doFetch = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const interval = options.minIntervalMs ?? 1000;
  const ua = options.userAgent ?? 'brutna-loften-tools (https://github.com/brutnaloften)';
  const base = options.baseUrl ?? RIKSDAG_BASE_URL;
  let lastStart = Number.NEGATIVE_INFINITY;

  return async (dokId) => {
    if (!/^[A-Za-z0-9_-]+$/.test(dokId)) throw new Error(`Bad dok_id: ${dokId}`);
    const file = resolve(options.cacheDir, `${dokId}.xml`);
    if (existsSync(file)) return readFileSync(file, 'utf8') || null;

    let delay = 1000;
    for (let attempt = 0; ; attempt++) {
      const wait = lastStart + interval - Date.now();
      if (wait > 0) await sleep(wait);
      lastStart = Date.now();
      let res: Response;
      try {
        res = await doFetch(`${base}/dokument/${dokId}.text`, { headers: { 'User-Agent': ua } });
      } catch (err) {
        if (attempt >= 2) throw err;
        await sleep(delay);
        delay *= 2;
        continue;
      }
      if (res.ok) {
        const text = await res.text();
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, text);
        return text.trim() === '' ? null : text;
      }
      await res.body?.cancel().catch(() => undefined);
      if (res.status === 404) return null;
      if (attempt < 2 && (res.status === 429 || res.status >= 500)) {
        await sleep(delay);
        delay *= 2;
        continue;
      }
      throw new Error(`HTTP ${res.status} for ${dokId}.text`);
    }
  };
}
