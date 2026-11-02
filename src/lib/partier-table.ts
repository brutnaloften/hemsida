import type { AgreementOutcome, Evidence, Source } from '@/schema/promise';
import type { Term } from '@/schema/term';
import {
  agreementOutcomeCounts,
  assessedCount,
  promisesForParty,
  verdictCounts,
  type PartyPromise,
} from '@/lib/party-stats';
import type { Role } from '@/lib/terms';

const ROLE_ORDER: Role[] = ['government', 'support', 'opposition'];

type TablePromise = PartyPromise & { evidence: readonly Evidence[] };

export interface AgreementCell {
  agreementId: string;
  /** False for parties outside the agreement: show "Står inte bakom överenskommelsen". */
  stands: boolean;
  counts: Record<AgreementOutcome, number>;
  total: number;
}

export interface PartierRow {
  party: string;
  role: Role;
  promiseCount: number;
  assessed: number;
  verdicts: ReturnType<typeof verdictCounts>;
  agreements: AgreementCell[];
}

/**
 * One row per party that has promises in the term, grouped government, support, opposition and
 * in the term record's party order within a group. Roles come from the term record only.
 * Agreements are the term's `agreements` that resolve to a source; unknown ids are skipped.
 */
export function buildPartierRows(
  term: Pick<Term, 'roles' | 'agreements'>,
  promises: readonly TablePromise[],
  sources: readonly Pick<Source, 'id' | 'parties'>[],
): PartierRow[] {
  const agreements = term.agreements
    .map((id) => sources.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => s !== undefined);
  const rows: PartierRow[] = [];
  for (const [party, role] of Object.entries(term.roles) as [string, Role][]) {
    const own = promisesForParty(promises, party);
    if (own.length === 0) continue;
    rows.push({
      party,
      role,
      promiseCount: own.length,
      assessed: assessedCount(own),
      verdicts: verdictCounts(own),
      agreements: agreements.map((a) => ({
        agreementId: a.id,
        stands: (a.parties as readonly string[]).includes(party),
        ...agreementOutcomeCounts(own),
      })),
    });
  }
  // Array.prototype.sort is stable, so the term record's order holds within a role.
  return rows.sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
}

/** Roles present in the rows, in display order, for the filter chips. */
export function rolesPresent(rows: readonly PartierRow[]): Role[] {
  return ROLE_ORDER.filter((r) => rows.some((row) => row.role === r));
}
