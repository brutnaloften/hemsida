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
 * - A point can hold several votes (NU5 punkt 2 has a sakfråga and a motivfråga
 *   vote) and `voteringlista` caps at 500 rows and ignores `p`/`avser`, so
 *   member rows come from `/votering/{votering_id}.json`, one request per
 *   point, which returns exactly that vote. Its `avser` says what was voted on:
 *   "sakfrågan" is the decision, "motivfrågan" is the reasoning only (NU5 punkt
 *   4: a no there is not a vote against the decision). An unknown or mixed
 *   `avser` is reported as ambiguous instead of guessing.
 * - Without `dokId` the document id is found by paging through every bet of
 *   the riksmöte (200 per request, ~1 req/s in bulk). Pass `dokId` whenever
 *   it is known.
 *
 * Pure logic: the Riksdag client is injected.
 */

import type { z } from 'zod';
import type { MemberVote, PartyVotes, RiksdagClient } from './riksdag.ts';
import { PARTIES } from '../../src/schema/promise.ts';
import type { partySchema } from '../../src/schema/promise.ts';

export type Party = z.infer<typeof partySchema>;
export type VoteChoice = 'yes' | 'no' | 'abstain' | 'absent';
/** Shape of the schema's `votes` field. */
export type PartyVoteMap = Partial<Record<Party, VoteChoice>>;
/** What the vote was on: the decision itself or only its reasoning. */
export type VoteKind = 'decision' | 'reasoning';

export type VotesClient = Pick<
  RiksdagClient,
  'listAllDocuments' | 'getDocumentStatus' | 'getVoteMembers'
>;

export interface BetRef {
  /** Riksmöte, e.g. "2023/24". */
  rm: string;
  /** Beteckning, e.g. "NU5". */
  bet: string;
  /** Committee point number, e.g. "1". */
  punkt: string;
  /**
   * Document id, e.g. "HB01NU5". Strongly preferred: without it every bet of
   * the riksmöte is paged through to find the id.
   */
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
      /** "decision" (sakfrågan) or "reasoning" (motivfrågan: not a vote on the outcome). */
      kind: VoteKind;
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
 * `undefined`, as does a row without any members.
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

/**
 * Aggregates party rows. Rows for non-parties (the speaker, "-") are ignored,
 * and so are rows with no members at all: those are empty, not tied.
 */
export function aggregateParties(rows: PartyVotes[]): { votes: PartyVoteMap; tied: Party[] } {
  const votes: PartyVoteMap = {};
  const tied: Party[] = [];
  for (const row of rows) {
    if (!isParty(row.parti)) continue;
    const choice = partyChoice(row);
    if (choice !== undefined) votes[row.parti] = choice;
    else if (row.Ja + row.Nej + row.Avstår + row.Frånvarande > 0) tied.push(row.parti);
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

/** Member rows -> per-party rows, the shape of `gruppering=parti`. */
function toPartyRows(rows: MemberVote[]): PartyVotes[] {
  const byParty = new Map<string, PartyVotes>();
  for (const r of rows) {
    let p = byParty.get(r.parti);
    if (!p) {
      p = { parti: r.parti, Ja: 0, Nej: 0, Frånvarande: 0, Avstår: 0 };
      byParty.set(r.parti, p);
    }
    if (r.rost === 'Ja' || r.rost === 'Nej' || r.rost === 'Frånvarande' || r.rost === 'Avstår') {
      p[r.rost]++;
    }
  }
  return [...byParty.values()];
}

const KIND: Record<string, VoteKind> = { sakfrågan: 'decision', motivfrågan: 'reasoning' };

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
  ref: { rm: string; bet: string; punkt: string },
  getVoteMembers: VotesClient['getVoteMembers'],
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
  // Fetched by vote id, so rows of other votes under the same point never mix in.
  const rows = await getVoteMembers(votingId);
  if (rows.length === 0) {
    return { status: 'no-recorded-vote', punkt, reason: `vote ${votingId} has no roll-call data` };
  }
  const avser = [...new Set(rows.map((r) => r.avser))];
  const kind = avser.length === 1 ? KIND[avser[0]] : undefined;
  if (kind === undefined) {
    return {
      status: 'ambiguous',
      punkt,
      votingId,
      reason: `cannot tell what vote ${votingId} was on (avser: ${avser.join(', ') || 'none'})`,
    };
  }
  const partyRows = toPartyRows(rows);
  const { votes, tied } = aggregateParties(partyRows);
  return { status: 'ok', punkt, votingId, kind, votes, tied, totals: sumRows(partyRows) };
}

/** Party votes for one committee point of a betänkande. */
export async function getPointPartyVotes(
  client: VotesClient,
  ref: BetRef,
): Promise<PointVotesResult | BetNotFound> {
  const dokId = await resolveDokId(client, ref);
  if (dokId === null) return { status: 'not-found', reason: `no bet ${ref.bet} in ${ref.rm}` };
  const { committeeProposals } = await client.getDocumentStatus(dokId);
  return resolvePoint(committeeProposals, ref, (id) => client.getVoteMembers(id));
}

/** Party votes for every committee point of a betänkande, in point order. */
export async function getBetPartyVotes(
  client: VotesClient,
  ref: { rm: string; bet: string; dokId?: string },
): Promise<PointVotesResult[] | BetNotFound> {
  const dokId = await resolveDokId(client, ref);
  if (dokId === null) return { status: 'not-found', reason: `no bet ${ref.bet} in ${ref.rm}` };
  const { committeeProposals } = await client.getDocumentStatus(dokId);
  const results: PointVotesResult[] = [];
  for (const p of committeeProposals) {
    results.push(
      await resolvePoint(committeeProposals, { rm: ref.rm, bet: ref.bet, punkt: p.punkt }, (a) =>
        client.getVoteMembers(a),
      ),
    );
  }
  return results;
}
