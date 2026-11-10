/**
 * View model for the party page: the party's manifesto promises ("vallöften"), mid-term pledges
 * outside a manifesto ("Övriga utfästelser") and, per agreement the term lists and the party
 * stands behind, how the manifesto promises fared in it. Pure functions over the term record, the
 * sources and the term's promises; nothing here names an agreement or a party role.
 */
import { AREAS } from '@/schema/areas';
import { agreementName } from '@/schema/promise';
import type { AgreementOutcome, Evidence, PromiseRecord } from '@/schema/promise';
import type { Term } from '@/schema/term';
import { agreementOutcomeCounts } from '@/lib/party-stats';
import { manifestoOnly } from '@/lib/manifesto';
import { isAgreement } from '@/lib/timeline';

export interface PartySource {
  id: string;
  title: string;
  shortTitle?: string | undefined;
  kind: string;
  parties: readonly string[];
  date: string;
  url: string;
  archive: string;
  urlDeadAsOf?: string | undefined;
}

export type PartyPagePromise = Pick<PromiseRecord, 'source' | 'parties' | 'verdict' | 'evidence'>;

export interface PartyAgreement {
  source: PartySource;
  name: string;
  counts: Record<AgreementOutcome, number>;
  /** Manifesto promises with an entry for this agreement. */
  total: number;
}

export interface PartyPageModel<T extends PartyPagePromise> {
  /** The party's own manifesto promises. */
  manifesto: T[];
  /** Mid-term pledges: the party's promises that are neither manifesto nor agreement points. */
  other: T[];
  /** The party's manifesto source(s) in the term, for the header link. */
  manifestoSources: PartySource[];
  /** Agreements of the term that the party stands behind (empty when none). */
  agreements: PartyAgreement[];
}

/** Latest outcome for one agreement source, if the promise has an entry for it. */
export function agreementEntry(
  evidence: readonly Evidence[],
  agreementId: string,
): AgreementOutcome | undefined {
  const entries = evidence.filter(isAgreement).filter((e) => e.source === agreementId);
  if (entries.length === 0) return undefined;
  return entries.reduce((a, b) => (b.date > a.date ? b : a)).outcome;
}

export function buildPartyModel<T extends PartyPagePromise>(
  term: Pick<Term, 'agreements'>,
  party: string,
  sources: readonly PartySource[],
  promises: readonly T[],
): PartyPageModel<T> {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const agreementIds = new Set(term.agreements);
  const mine = promises.filter((p) => (p.parties as readonly string[]).includes(party));
  // Agreement points live on the agreement, not on the party page.
  const own = mine.filter((p) => !agreementIds.has(p.source.id));
  const manifesto = manifestoOnly(own, sources);
  const manifestoSet = new Set(manifesto);
  const other = own.filter((p) => !manifestoSet.has(p));

  const agreements = term.agreements.flatMap((id): PartyAgreement[] => {
    const source = byId.get(id);
    // Unknown ids are skipped, as on the Partier table.
    if (!source || !source.parties.includes(party)) return [];
    const forAgreement = manifesto.map((p) => ({
      evidence: p.evidence.filter((e) => isAgreement(e) && e.source === id),
    }));
    return [{ source, name: agreementName(source), ...agreementOutcomeCounts(forAgreement) }];
  });

  const manifestoSources = [...new Set(manifesto.map((p) => p.source.id))]
    .map((id) => byId.get(id))
    .filter((s): s is PartySource => s !== undefined);

  return { manifesto, other, manifestoSources, agreements };
}

export interface PartyRow {
  id: string;
  title: string;
  area: string;
  href: string;
  verdict: PromiseRecord['verdict']['value'];
  assessedBy?: 'ai' | 'human';
  /** Page in the source document. */
  page?: number;
  /** Outcome in the (first) agreement the party stands behind. */
  outcome?: AgreementOutcome;
  /** Mid-term pledge ("Övriga utfästelser"). */
  other: boolean;
}

export interface PartyFilter {
  q: string;
  verdicts: readonly PartyRow['verdict'][];
  outcomes: readonly AgreementOutcome[];
  area: string;
}

export function filterPartyRows(rows: readonly PartyRow[], f: PartyFilter): PartyRow[] {
  const q = f.q.trim().toLocaleLowerCase('sv');
  return rows.filter(
    (r) =>
      (q === '' || r.title.toLocaleLowerCase('sv').includes(q)) &&
      (f.verdicts.length === 0 || f.verdicts.includes(r.verdict)) &&
      (f.outcomes.length === 0 || (r.outcome !== undefined && f.outcomes.includes(r.outcome))) &&
      (f.area === '' || r.area === f.area),
  );
}

export interface RowGroup {
  /** Area name, or null for the "Övriga utfästelser" group. */
  area: string | null;
  rows: PartyRow[];
}

/** Groups in AREAS order, rows sorted by title; mid-term pledges form a last group. */
export function groupRows(rows: readonly PartyRow[]): RowGroup[] {
  const sorted = [...rows].sort((a, b) => a.title.localeCompare(b.title, 'sv'));
  const groups: RowGroup[] = AREAS.map((area) => ({
    area: area as string | null,
    rows: sorted.filter((r) => !r.other && r.area === area),
  }));
  groups.push({ area: null, rows: sorted.filter((r) => r.other) });
  return groups.filter((g) => g.rows.length > 0);
}

/** Cut groups after `limit` rows in total (the group containing the limit is cut in place). */
export function limitGroups(groups: readonly RowGroup[], limit: number): RowGroup[] {
  const out: RowGroup[] = [];
  let left = limit;
  for (const g of groups) {
    if (left <= 0) break;
    out.push({ area: g.area, rows: g.rows.slice(0, left) });
    left -= g.rows.length;
  }
  return out;
}
