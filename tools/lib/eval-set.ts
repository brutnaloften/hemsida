/**
 * Deterministic stratified sampling of promise/document pairs for the hand-labelled
 * matcher eval set. Strata are document type (dir, sou/ds, prop, bet) times candidate
 * score band (low = likely negatives, mid, high). Picks go round-robin over strata;
 * within a stratum, pairs whose promise and policy area are least used so far win, so the
 * set spreads over areas and does not repeat a promise. Ties break by a seeded shuffle.
 */
import type { CandidateDocument, CandidateFile } from './riksdag-candidates.ts';
import type { EvalPair, EvalStage } from '../../src/schema/eval.ts';

export interface EvalPromise {
  id: string;
  title: string;
  description: string;
  area?: string;
  committee?: string;
  source: { quote?: string };
}

export interface Pool {
  promise: EvalPromise;
  doc: CandidateDocument;
}

/** mulberry32: small seeded PRNG so the sample is reproducible. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function scoreBand(score: number): 'low' | 'mid' | 'high' {
  return score <= 1 ? 'low' : score <= 3 ? 'mid' : 'high';
}

export function stratumOf(doc: CandidateDocument): string {
  const type = doc.doktyp === 'ds' ? 'sou' : doc.doktyp;
  return `${type}|${scoreBand(doc.score)}`;
}

export function buildPool(
  promises: Map<string, EvalPromise>,
  files: CandidateFile[],
  allowedTypes: readonly string[],
): Pool[] {
  const pool: Pool[] = [];
  for (const f of files) {
    const promise = promises.get(f.promise_id);
    if (!promise) continue;
    for (const doc of f.candidates) {
      if (allowedTypes.includes(doc.doktyp)) pool.push({ promise, doc });
    }
  }
  return pool;
}

export function samplePairs(pool: Pool[], count: number, seed: number): Pool[] {
  const rand = rng(seed);
  // Sort first so the result does not depend on input order.
  const sorted = [...pool].sort((a, b) =>
    `${a.promise.id}::${a.doc.dok_id}`.localeCompare(`${b.promise.id}::${b.doc.dok_id}`),
  );
  const strata = new Map<string, Pool[]>();
  for (const p of shuffle(sorted, rand)) {
    const k = stratumOf(p.doc);
    strata.set(k, [...(strata.get(k) ?? []), p]);
  }
  const keys = [...strata.keys()].sort();
  const usedPromise = new Map<string, number>();
  const usedArea = new Map<string, number>();
  const usedDoc = new Set<string>();
  const areaOf = (p: Pool) => p.promise.area ?? p.promise.committee ?? '';
  const picked: Pool[] = [];

  while (picked.length < count) {
    let progressed = false;
    for (const k of keys) {
      if (picked.length >= count) break;
      const list = strata.get(k)!;
      let best = -1;
      let bestCost = Infinity;
      for (let i = 0; i < list.length; i++) {
        const p = list[i]!;
        if (usedDoc.has(p.doc.dok_id)) continue;
        const cost = (usedPromise.get(p.promise.id) ?? 0) * 100 + (usedArea.get(areaOf(p)) ?? 0);
        if (cost < bestCost) {
          best = i;
          bestCost = cost;
        }
      }
      if (best < 0) continue;
      const p = list.splice(best, 1)[0]!;
      picked.push(p);
      usedDoc.add(p.doc.dok_id);
      usedPromise.set(p.promise.id, (usedPromise.get(p.promise.id) ?? 0) + 1);
      usedArea.set(areaOf(p), (usedArea.get(areaOf(p)) ?? 0) + 1);
      progressed = true;
    }
    if (!progressed) break;
  }
  return picked;
}

export function toEvalPair({ promise, doc }: Pool): EvalPair {
  const snippet = [
    `${doc.doktyp.toUpperCase()} ${doc.rm} ${doc.beteckning}`.trim(),
    doc.datum,
    doc.organ ? `utskott/organ ${doc.organ}` : '',
    `träffade sökningarna: ${doc.found_by.join(', ')}`,
  ]
    .filter(Boolean)
    .join(' | ');
  return {
    id: `${promise.id}::${doc.dok_id}`,
    promise_id: promise.id,
    promise_title: promise.title,
    promise_text: promise.description,
    promise_quote: promise.source.quote ?? '',
    document_id: doc.dok_id,
    document_title: doc.titel,
    document_type: doc.doktyp,
    snippet,
    url: doc.url,
    search_score: doc.score,
    label: null,
  };
}

/** Keep labels already entered when the set is regenerated: pairs in both keep label and note. */
export function mergeLabels(fresh: EvalPair[], existing: EvalPair[]): EvalPair[] {
  const old = new Map(existing.map((p) => [p.id, p]));
  return fresh.map((p) => {
    const prev = old.get(p.id);
    return prev?.label ? { ...p, label: prev.label, stage: prev.stage, note: prev.note } : p;
  });
}

/** Ids of labelled pairs in `existing` that a regenerated set would drop. */
export function droppedLabelled(
  fresh: readonly { id: string }[],
  existing: readonly { id: string; label: unknown }[],
): string[] {
  const keep = new Set(fresh.map((p) => p.id));
  return existing.filter((p) => p.label && !keep.has(p.id)).map((p) => p.id);
}

/**
 * Navigation through the pairs for the labeller, testable without a TTY. `back` steps
 * through the visited pairs (labelled or not), `advance` moves to the next pair that
 * still needs a label (every pair with `redo`). `current` is null when finished.
 */
export class Navigator {
  current: number | null;
  private history: number[] = [];
  private readonly pairs: readonly { label: unknown }[];
  private readonly redo: boolean;
  private readonly only: ReadonlySet<number> | undefined;

  /** `only` restricts the walk to those pair indexes. */
  constructor(pairs: readonly { label: unknown }[], redo: boolean, only?: ReadonlySet<number>) {
    this.pairs = pairs;
    this.redo = redo;
    this.only = only;
    this.current = this.firstFrom(0);
  }

  private firstFrom(start: number): number | null {
    for (let i = start; i < this.pairs.length; i++) {
      if (this.only && !this.only.has(i)) continue;
      if (this.redo || !this.pairs[i]!.label) return i;
    }
    return null;
  }

  advance(): void {
    if (this.current === null) return;
    this.history.push(this.current);
    this.current = this.firstFrom(this.current + 1);
  }

  /** Returns false when there is nothing to go back to. */
  back(): boolean {
    const prev = this.history.pop();
    if (prev === undefined) return false;
    this.current = prev;
    return true;
  }
}

export interface StageAgreement {
  /** Pairs with both a hand stage and a model stage. */
  compared: number;
  agree: number;
  /** Counts of `hand -> model` disagreements, e.g. `preparatory -> definitive`. */
  confusions: Record<string, number>;
}

/** Agreement between hand stages and one model's blind stages (pairs lacking either are ignored). */
export function stageAgreement(
  pairs: readonly Pick<EvalPair, 'id' | 'stage'>[],
  labels: Record<string, Record<string, { stage?: EvalStage }>>,
  model: string,
): StageAgreement {
  const out: StageAgreement = { compared: 0, agree: 0, confusions: {} };
  for (const p of pairs) {
    const m = labels[p.id]?.[model]?.stage;
    if (!p.stage || !m) continue;
    out.compared++;
    if (p.stage === m) out.agree++;
    else {
      const k = `${p.stage} -> ${m}`;
      out.confusions[k] = (out.confusions[k] ?? 0) + 1;
    }
  }
  return out;
}
