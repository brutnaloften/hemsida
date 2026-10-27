/**
 * Party-level votes for a betänkande point, in the shape of the `votes` field
 * on a `bet` evidence item (src/schema/promise.ts): party -> yes/no/abstain/absent.
 *
 * Quirks handled (docs/riksdag-api.md):
 * - Votes do not map 1:1 to committee points: a betänkande can have several
 *   votes, and some are not listed under any point. The vote belonging to a
 *   point is the `votering_id` on its `utskottsforslag`.
 * - Points decided by acklamation have no recorded vote (empty id). Some
 *   acklamation points still carry an id with real roll-call data, so an id,
 *   not `beslutstyp`, decides.
 * - Vote ids are lowercase in dokumentstatus and uppercase in voteringlista.
 * - `voteringlista` by party is filtered on `punkt`, not on vote id. If the
 *   point's party rows do not add up to the point's own vote total, the point
 *   mixes several votes and the result is reported as ambiguous instead of
 *   guessing.
 *
 * Pure logic: the Riksdag client is injected.
 */

import type { z } from 'zod';
import { sameVoteId } from './riksdag.ts';
import type { PartyVotes, RiksdagClient, VoteTotals } from './riksdag.ts';
import { PARTIES } from '../../src/schema/promise.ts';
import type { partySchema } from '../../src/schema/promise.ts';

export type Party = z.infer<typeof partySchema>;
export type VoteChoice = 'yes' | 'no' | 'abstain' | 'absent';
/** Shape of the schema's `votes` field. */
export type PartyVoteMap = Partial<Record<Party, VoteChoice>>;

export type VotesClient = Pick<
  RiksdagClient,
  'listAllDocuments' | 'getDocumentStatus' | 'getPartyVotes' | 'getVoteTotals'
>;

export interface BetRef {
  /** Riksmöte, e.g. "2023/24". */
  rm: string;
  /** Beteckning, e.g. "NU5". */
  bet: string;
  /** Committee point number, e.g. "1". */
  punkt: string;
  /** Skip the lookup of the document id when already known (e.g. "HB01NU5"). */
  dokId?: string;
}

export interface VoteCounts {
  yes: number;
  no: number;
  abstain: number;
  absent: number;
}

export type PointVotesResult =
  | {
      status: 'ok';
      punkt: string;
      votingId: string;
      /** Ready for the schema's `votes` field. */
      votes: PartyVoteMap;
      /** Parties whose members split evenly between top choices; left out of `votes`. */
      tied: Party[];
      /** Vote totals over all members, for context. */
      totals: VoteCounts;
    }
  | { status: 'no-recorded-vote'; punkt: string; reason: string }
  | { status: 'ambiguous'; punkt: string; votingId: string; reason: string };

export interface BetNotFound {
  status: 'not-found';
  reason: string;
}

function isParty(value: string): value is Party {
  return (PARTIES as readonly string[]).includes(value);
}

/**
 * A party's position is the choice most of its members made. Absent counts
 * only when nobody voted yes/no/abstain. A tie between top choices gives
 * `undefined`.
 */
export function partyChoice(row: PartyVotes): VoteChoice | undefined {
  const counts: Array<[VoteChoice, number]> = [
    ['yes', row.Ja],
    ['no', row.Nej],
    ['abstain', row.Avstår],
  ];
  const max = Math.max(...counts.map(([, n]) => n));
  if (max === 0) return row.Frånvarande > 0 ? 'absent' : undefined;
  const top = counts.filter(([, n]) => n === max);
  return top.length === 1 ? top[0][0] : undefined;
}

/** Aggregates party rows. Rows for non-parties (the speaker, "-") are ignored. */
export function aggregateParties(rows: PartyVotes[]): { votes: PartyVoteMap; tied: Party[] } {
  const votes: PartyVoteMap = {};
  const tied: Party[] = [];
  for (const row of rows) {
    if (!isParty(row.parti)) continue;
    const choice = partyChoice(row);
    if (choice === undefined) tied.push(row.parti);
    else votes[row.parti] = choice;
  }
  return { votes, tied };
}

function sumRows(rows: PartyVotes[]): VoteCounts {
  const t = { yes: 0, no: 0, abstain: 0, absent: 0 };
  for (const r of rows) {
    t.yes += r.Ja;
    t.no += r.Nej;
    t.abstain += r.Avstår;
    t.absent += r.Frånvarande;
  }
  return t;
}

async function resolveDokId(
  client: VotesClient,
  ref: { rm: string; bet: string; dokId?: string },
): Promise<string | null> {
  if (ref.dokId) return ref.dokId;
  for await (const doc of client.listAllDocuments({ doktyp: 'bet', rm: ref.rm })) {
    if (doc.beteckning === ref.bet) return doc.dok_id;
  }
  return null;
}

async function resolvePoint(
  proposals: Array<{ punkt: string; votering_id: string }>,
  totals: VoteTotals[],
  ref: { rm: string; bet: string; punkt: string },
  getPartyVotes: VotesClient['getPartyVotes'],
): Promise<PointVotesResult> {
  const { rm, bet, punkt } = ref;
  const proposal = proposals.find((p) => p.punkt === punkt);
  if (!proposal) {
    return { status: 'no-recorded-vote', punkt, reason: `no point ${punkt} in ${bet} ${rm}` };
  }
  const votingId = proposal.votering_id;
  if (votingId === '') {
    return { status: 'no-recorded-vote', punkt, reason: 'decided without a recorded vote' };
  }
  const own = totals.find((t) => sameVoteId(t.votering_id, votingId));
  if (!own) {
    return { status: 'no-recorded-vote', punkt, reason: `vote ${votingId} has no roll-call data` };
  }
  const rows = await getPartyVotes({ rm, bet, punkt });
  const sum = sumRows(rows);
  const same =
    sum.yes === own.Ja &&
    sum.no === own.Nej &&
    sum.abstain === own.Avstår &&
    sum.absent === own.Frånvarande;
  if (!same) {
    return {
      status: 'ambiguous',
      punkt,
      votingId,
      reason: `party rows for punkt ${punkt} do not match the totals of vote ${votingId}; the point has several votes`,
    };
  }
  const { votes, tied } = aggregateParties(rows);
  return { status: 'ok', punkt, votingId, votes, tied, totals: sum };
}

/** Party votes for one committee point of a betänkande. */
export async function getPointPartyVotes(
  client: VotesClient,
  ref: BetRef,
): Promise<PointVotesResult | BetNotFound> {
  const dokId = await resolveDokId(client, ref);
  if (dokId === null) return { status: 'not-found', reason: `no bet ${ref.bet} in ${ref.rm}` };
  const { committeeProposals } = await client.getDocumentStatus(dokId);
  const proposal = committeeProposals.find((p) => p.punkt === ref.punkt);
  // Skip the vote requests when there is nothing to look up.
  const totals = proposal?.votering_id
    ? await client.getVoteTotals({ rm: ref.rm, bet: ref.bet })
    : [];
  return resolvePoint(committeeProposals, totals, ref, (a) => client.getPartyVotes(a));
}

/** Party votes for every committee point of a betänkande, in point order. */
export async function getBetPartyVotes(
  client: VotesClient,
  ref: { rm: string; bet: string; dokId?: string },
): Promise<PointVotesResult[] | BetNotFound> {
  const dokId = await resolveDokId(client, ref);
  if (dokId === null) return { status: 'not-found', reason: `no bet ${ref.bet} in ${ref.rm}` };
  const { committeeProposals } = await client.getDocumentStatus(dokId);
  const totals = committeeProposals.some((p) => p.votering_id)
    ? await client.getVoteTotals({ rm: ref.rm, bet: ref.bet })
    : [];
  const results: PointVotesResult[] = [];
  for (const p of committeeProposals) {
    results.push(
      await resolvePoint(
        committeeProposals,
        totals,
        { rm: ref.rm, bet: ref.bet, punkt: p.punkt },
        (a) => client.getPartyVotes(a),
      ),
    );
  }
  return results;
}
