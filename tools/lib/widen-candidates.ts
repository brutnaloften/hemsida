/**
 * Widened candidate search over the local Riksdag store: for promises the API keyword search found
 * nothing useful for, rank every stored document by how many of the promise's distinctive terms
 * (keywords, title and description words, hand-written synonyms) its title and snippet contain.
 * Pure logic, no network; see tools/widen-candidates.ts for the CLI.
 */
import type { StoredDocument } from './riksdag-ingest.ts';

const STOPWORDS = new Set(
  (
    'och att som för med den det ett inte från vara ska sig samt eller också mer bättre ' +
    'alla fler finns genom mellan under efter inom utan sina deras detta dessa vilka vilket ' +
    'införa införs ändra göra göras ta bort ökad ökade nya ny nytt sverige svenska svensk'
  ).split(' '),
);

/** Prefix length used as a cheap stem, so "skolval" matches "skolvalet" and "skolvalsreform". */
export const STEM_LENGTH = 6;

export function stemsOf(text: string): string[] {
  const words = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 5 && !STOPWORDS.has(w));
  return [...new Set(words.map((w) => w.slice(0, STEM_LENGTH)))];
}

/** Added to the score of a document whose title contains a hand-written term as a phrase. */
export const PHRASE_BONUS = 1000;

export interface WidenPromise {
  id: string;
  title: string;
  description: string;
  keywords: string[];
  extra: string[];
}

export interface WidenHit {
  doc: StoredDocument;
  score: number;
  matched: string[];
}

/** Inverse document frequency of every stem over the stored documents (title plus snippet). */
export function buildIdf(docs: StoredDocument[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const d of docs) {
    for (const s of new Set(stemsOf(`${d.titel} ${d.text}`))) df.set(s, (df.get(s) ?? 0) + 1);
  }
  const idf = new Map<string, number>();
  for (const [s, n] of df) idf.set(s, Math.log(docs.length / n));
  return idf;
}

/** A term strong enough to count as a phrase: several words, or one long (so specific) word. */
function isPhrase(term: string): boolean {
  return /\s/.test(term.trim()) || term.trim().length >= 11;
}

/**
 * Rank documents for one promise. A title hit counts three times a snippet hit, hand-written
 * `extra` terms count double, and a document needs at least two distinct matched terms (or one
 * extra term in its title) so a single shared common word never qualifies. A title that contains a
 * whole hand-written phrase gets a large bonus (see isPhrase).
 */
export function widenSearch(
  promise: WidenPromise,
  docs: StoredDocument[],
  idf: Map<string, number>,
  skip: Set<string>,
  limit: number,
): WidenHit[] {
  const extraStems = new Set(promise.extra.flatMap(stemsOf));
  const terms = new Set([
    ...stemsOf(promise.keywords.join(' ')),
    ...stemsOf(`${promise.title} ${promise.description}`),
    ...extraStems,
  ]);
  const hits: WidenHit[] = [];
  for (const doc of docs) {
    if (skip.has(doc.dok_id)) continue;
    const title = stemsOf(doc.titel);
    const body = new Set(stemsOf(doc.text));
    let score = 0;
    const matched: string[] = [];
    let extraInTitle = false;
    for (const t of terms) {
      const w = (idf.get(t) ?? 0) * (extraStems.has(t) ? 2 : 1);
      if (title.includes(t)) {
        score += 3 * w;
        matched.push(t);
        if (extraStems.has(t)) extraInTitle = true;
      } else if (body.has(t)) {
        score += w;
        matched.push(t);
      }
    }
    // A title that contains a whole hand-written term outranks any pile of body hits on common words.
    const lowerTitle = doc.titel.toLowerCase();
    if (promise.extra.some((e) => isPhrase(e) && lowerTitle.includes(e.toLowerCase()))) {
      score += PHRASE_BONUS;
      extraInTitle = true;
    }
    if (matched.length >= 2 || extraInTitle) hits.push({ doc, score, matched });
  }
  hits.sort((a, b) => b.score - a.score || b.doc.datum.localeCompare(a.doc.datum));
  return hits.slice(0, limit);
}
