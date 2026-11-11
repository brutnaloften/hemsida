/**
 * Splits a compound promise into one promise per commitment (policy: docs/data-model.md,
 * "Compound promises"). Pure; tools/split-promises.ts does the file I/O.
 */
import { promiseSchema, type PromiseRecord } from './schema.ts';

export interface SplitPart {
  slug: string;
  title: string;
  description: string;
  page: number;
  quote: string;
}
export interface SplitPlanEntry {
  id: string;
  reason: string;
  parts: SplitPart[];
}

export const partId = (part: SplitPart): string => `tido-${part.slug}`;

/** A part of an inquiry sentence is an inquiry promise even when its parent was a legislative one. */
function partType(parent: PromiseRecord, part: SplitPart): PromiseRecord['type'] {
  return /^utred/.test(part.slug) ? 'inquiry' : parent.type;
}

/** The new promise for one part: parent metadata, the part's own text and source, nothing assessed. */
export function buildPart(parent: PromiseRecord, part: SplitPart): PromiseRecord {
  const created = parent.verdict.history[0]?.date ?? parent.verdict.date;
  return promiseSchema.parse({
    id: partId(part),
    term: parent.term,
    title: part.title,
    description: part.description,
    source: { ...parent.source, page: part.page, quote: part.quote },
    parties: parent.parties,
    roles: parent.roles,
    type: partType(parent, part),
    area: parent.area,
    committee: parent.committee,
    keywords: parent.keywords,
    verdict: { value: 'unassessed', reasoning: '', date: created, history: [] },
    evidence: [],
  });
}

/** Replaces `oldId` with `newIds` in every `promises` array of a JSON value; returns true if changed. */
export function replacePromiseId(
  value: unknown,
  oldId: string,
  newIds: readonly string[],
): boolean {
  let changed = false;
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    if (v && typeof v === 'object') {
      for (const [k, child] of Object.entries(v)) {
        if (k === 'promises' && Array.isArray(child) && child.includes(oldId)) {
          const next: unknown[] = [];
          for (const x of child) {
            for (const y of x === oldId ? newIds : [x]) if (!next.includes(y)) next.push(y);
          }
          (v as Record<string, unknown>)[k] = next;
          changed = true;
        } else walk(child);
      }
    }
  };
  walk(value);
  return changed;
}

export function validatePlan(plan: readonly SplitPlanEntry[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const e of plan) {
    if (e.parts.length < 2) problems.push(`${e.id}: needs at least two parts`);
    for (const p of e.parts) {
      const id = partId(p);
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) problems.push(`${id}: not a slug`);
      if (seen.has(id)) problems.push(`${id}: duplicate part id`);
      seen.add(id);
    }
  }
  return problems;
}
