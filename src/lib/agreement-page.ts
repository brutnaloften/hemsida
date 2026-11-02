/**
 * Pure data shaping for the agreement page (`/<term>/overenskommelse/<slug>`): the agreement's
 * points grouped by area, the manifesto promises each point matched, and the manifesto promises
 * the agreement did not address. Nothing here names a specific agreement.
 */
import { AREAS } from '@/schema/areas';
import { AGREEMENT_OUTCOMES, type AgreementOutcome, type Evidence } from '@/schema/promise';
import { isAgreement } from '@/lib/timeline';

export interface PageablePromise {
  id: string;
  title: string;
  area: string;
  parties: readonly string[];
  source: { id: string };
  evidence: readonly Evidence[];
}

export interface PromiseLink {
  id: string;
  title: string;
  parties: string[];
}

export interface AgreementPoint extends PromiseLink {
  /** Manifesto promises whose agreement entry for this agreement points at this point. */
  matched: PromiseLink[];
}

export interface AreaGroup<T> {
  area: string;
  items: T[];
}

export interface AgreementPageData {
  points: AreaGroup<AgreementPoint>[];
  pointCount: number;
  /** Points no manifesto promise matched. */
  unmatchedCount: number;
  /** Manifesto promises this agreement left out, by area. */
  notAddressed: AreaGroup<PromiseLink>[];
  notAddressedCount: number;
  /** Promises with an entry for this agreement, per outcome. */
  outcomeCounts: Record<AgreementOutcome, number>;
}

const byTitle = (a: { title: string }, b: { title: string }) =>
  a.title.localeCompare(b.title, 'sv');

function groupByArea<T>(items: readonly { area: string; value: T }[]): AreaGroup<T>[] {
  const order = new Map<string, number>(AREAS.map((a, i) => [a, i]));
  const groups = new Map<string, T[]>();
  for (const { area, value } of items) {
    const list = groups.get(area) ?? [];
    list.push(value);
    groups.set(area, list);
  }
  return [...groups.entries()]
    .sort(
      ([a], [b]) =>
        (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity) || a.localeCompare(b, 'sv'),
    )
    .map(([area, list]) => ({ area, items: list }));
}

const toLink = (p: PageablePromise): PromiseLink => ({
  id: p.id,
  title: p.title,
  parties: [...p.parties],
});

/** True when the agreement has at least one point among the term's promises. */
export function hasAgreementPoints(
  agreementId: string,
  promises: readonly Pick<PageablePromise, 'source'>[],
): boolean {
  return promises.some((p) => p.source.id === agreementId);
}

export function buildAgreementPage(
  agreementId: string,
  promises: readonly PageablePromise[],
): AgreementPageData {
  const points = promises.filter((p) => p.source.id === agreementId).sort(byTitle);
  const others = promises.filter((p) => p.source.id !== agreementId).sort(byTitle);

  const matchedBy = new Map<string, PromiseLink[]>();
  const notAddressed: PageablePromise[] = [];
  const outcomeCounts = Object.fromEntries(AGREEMENT_OUTCOMES.map((o) => [o, 0])) as Record<
    AgreementOutcome,
    number
  >;
  for (const p of others) {
    const entry = p.evidence.filter(isAgreement).find((e) => e.source === agreementId);
    if (!entry) continue;
    outcomeCounts[entry.outcome]++;
    if (entry.outcome === 'not_addressed') notAddressed.push(p);
    for (const id of entry.promises) {
      const list = matchedBy.get(id) ?? [];
      list.push(toLink(p));
      matchedBy.set(id, list);
    }
  }

  const rows = points.map((p) => ({
    area: p.area,
    value: { ...toLink(p), matched: matchedBy.get(p.id) ?? [] },
  }));
  return {
    points: groupByArea(rows),
    pointCount: points.length,
    unmatchedCount: rows.filter((r) => r.value.matched.length === 0).length,
    notAddressed: groupByArea(notAddressed.map((p) => ({ area: p.area, value: toLink(p) }))),
    notAddressedCount: notAddressed.length,
    outcomeCounts,
  };
}
