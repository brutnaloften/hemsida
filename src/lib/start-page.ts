/**
 * View model for the Start page: key numbers, roles, agreements and party cards for one term.
 *
 * Pure functions over the term record, the sources and the term's promises, so the three
 * scenarios (an agreement, none, a differently named one) can be tested without Astro. Nothing
 * here names an agreement or a party role; it all comes from the data passed in.
 */
import type { AgreementOutcome, Evidence, PromiseRecord } from '@/schema/promise';
import { agreementName, ROLES } from '@/schema/promise';
import type { Term } from '@/schema/term';
import { agreementOutcomeCounts, agreementPointStats, assessedCount } from '@/lib/party-stats';
import { isAgreement, isRiksdag } from '@/lib/timeline';
import { manifestoOnly, outcomeCountsText } from '@/lib/manifesto';

type Role = (typeof ROLES)[number];

export interface SourceInfo {
  id: string;
  title: string;
  shortTitle?: string | undefined;
  kind: string;
  parties: readonly string[];
  date: string;
}

export type StartPromise = Pick<PromiseRecord, 'source' | 'parties' | 'verdict' | 'evidence'>;

export const ROLE_GROUP_LABELS: Record<Role, string> = {
  government: 'Regering',
  support: 'Stödparti',
  opposition: 'Opposition',
};

export interface AgreementInfo {
  id: string;
  name: string;
  date: string;
  /** Number of points: promises whose own source is the agreement. */
  points: number;
  parties: readonly string[];
}

export interface PartyCardData {
  party: string;
  role: Role;
  /** The party's manifesto promises ("vallöften"). */
  promises: number;
  assessed: number;
  /** Per agreement the party stands behind: its points in the agreement and how many are assessed. */
  agreementPoints: { agreement: AgreementInfo; points: number; assessed: number }[];
  /** Per agreement the party stands behind: its manifesto promises split by outcome. */
  agreementSplits: {
    agreement: AgreementInfo;
    counts: Record<AgreementOutcome, number>;
    total: number;
  }[];
}

export interface StartModel {
  /** Hero numbers count every promise in the term: manifesto, agreement points and pledges. */
  keyNumbers: { promises: number; parties: number; assessed: number; riksdagDocuments: number };
  roleGroups: { role: Role; label: string; parties: string[] }[];
  agreements: AgreementInfo[];
  cardGroups: { role: Role; label: string; cards: PartyCardData[] }[];
}

/** Count phrases for the agreement split line; wording shared with the Partier table. */
export function agreementSplitText(counts: Record<AgreementOutcome, number>): string {
  return outcomeCountsText(counts);
}

/** "14 oktober 2022" from an ISO date. */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`));
}

/** Election year of a term id: its first year ("2022-2026" -> "2022"). */
export function electionYear(termId: string): string {
  return termId.split('-')[0] ?? termId;
}

export function buildStartModel(
  term: Pick<Term, 'roles' | 'agreements'>,
  sources: readonly SourceInfo[],
  promises: readonly StartPromise[],
): StartModel {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const agreements: AgreementInfo[] = term.agreements.map((id) => {
    const s = byId.get(id);
    if (!s) throw new Error(`Term lists agreement "${id}" but no such source exists`);
    return {
      id,
      name: agreementName(s),
      date: s.date,
      points: promises.filter((p) => p.source.id === id).length,
      parties: s.parties,
    };
  });
  // Party counts are manifesto promises only (as on the Partier table); the hero counts all.
  const own = manifestoOnly(promises, sources);

  const riksdagDocs = new Set<string>();
  for (const p of promises) {
    for (const e of p.evidence) {
      if (isRiksdag(e)) riksdagDocs.add(`${e.kind}:${e.designation}`);
    }
  }

  const partiesInTerm = Object.keys(term.roles);
  const cardGroups = ROLES.map((role) => ({
    role,
    label: ROLE_GROUP_LABELS[role],
    cards: partiesInTerm
      .filter((party) => term.roles[party as keyof Term['roles']] === role)
      .map((party): PartyCardData => {
        const mine = own.filter((p) => (p.parties as readonly string[]).includes(party));
        return {
          party,
          role,
          promises: mine.length,
          assessed: assessedCount(mine),
          agreementPoints: agreements
            .filter((a) => a.parties.includes(party))
            .map((agreement) => ({
              agreement,
              ...agreementPointStats(promises, agreement.id, party),
            })),
          agreementSplits: agreements
            .filter((a) => a.parties.includes(party))
            .map((agreement) => {
              const forAgreement = mine.map((p) => ({
                evidence: p.evidence.filter(
                  (e: Evidence) => isAgreement(e) && e.source === agreement.id,
                ),
              }));
              return { agreement, ...agreementOutcomeCounts(forAgreement) };
            }),
        };
      }),
  })).filter((g) => g.cards.length > 0);

  return {
    keyNumbers: {
      promises: promises.length,
      parties: partiesInTerm.length,
      assessed: assessedCount(promises),
      riksdagDocuments: riksdagDocs.size,
    },
    roleGroups: cardGroups.map((g) => ({
      role: g.role,
      label: g.label,
      parties: g.cards.map((c) => c.party),
    })),
    agreements,
    cardGroups,
  };
}
