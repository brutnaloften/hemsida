/**
 * Which vote of a betänkande is "the" decision vote for a promise, and the `votes` field for it.
 *
 * A bet evidence entry carries no committee point, and a betänkande has many (the government's
 * bill, then one per motion cluster). The point that decides a promise is the one that disposes of
 * the proposition the promise's law came from: its proposal text reads "... bifaller riksdagen
 * proposition 2023/24:19 ...". Rules, deliberately conservative (report instead of guessing):
 * - the promise must have `prop` evidence, whose designations give the proposition numbers;
 * - exactly one committee point citing one of them may carry a recorded vote (acklamation points
 *   have none); zero or several is reported, never picked between;
 * - that vote must be the sakfråga ("decision"), not the motivfråga.
 * The result is the party position on the committee's proposal ("Ja" = for the committee, which
 * for a bill point means for the bill). Votes never change a verdict (docs/data-model.md).
 *
 * Pure logic: the Riksdag client is injected.
 */

import type { CommitteeProposal } from './riksdag.ts';
import { resolvePoint } from './votes.ts';
import type { PartyVoteMap, VotesClient } from './votes.ts';

/** The fields of a promise evidence entry this logic reads. */
export interface EvidenceLike {
  kind: string;
  dok_id?: string;
  designation?: string;
  votes?: unknown;
}

export type FillOutcome =
  | {
      status: 'filled';
      punkt: string;
      votingId: string;
      votes: PartyVoteMap;
      /** Parties that split evenly and are left out of `votes`. */
      tied: string[];
    }
  | { status: 'no-recorded-vote'; reason: string }
  | { status: 'ambiguous'; reason: string };

/** "Prop. 2023/24:19" -> "2023/24:19"; other designations -> null. */
export function propRef(designation: string): string | null {
  return /^Prop\.\s+(\d{4}\/\d{2}:\d+)$/.exec(designation.trim())?.[1] ?? null;
}

/** "Bet. 2023/24:NU5" -> { rm, bet }; other designations -> null. */
export function betRef(designation: string): { rm: string; bet: string } | null {
  const m = /^Bet\.\s+(\d{4}\/\d{2}):(\S+)$/.exec(designation.trim());
  return m ? { rm: m[1], bet: m[2] } : null;
}

/** Proposition numbers the proposal text refers to ("proposition 2023/24:19", "... 19 och 20"). */
export function citedPropositions(forslag: string): string[] {
  const cited: string[] = [];
  for (const m of forslag.matchAll(
    /proposition(?:en|erna)?\s+((?:\d{4}\/\d{2}:\d+(?:\s*(?:,|och)\s*)?)+)/gi,
  )) {
    cited.push(...(m[1].match(/\d{4}\/\d{2}:\d+/g) ?? []));
  }
  return cited;
}

/** Committee points whose proposal disposes of one of the propositions. */
export function pointsCitingProp(
  proposals: Pick<CommitteeProposal, 'punkt' | 'votering_id' | 'forslag'>[],
  props: string[],
) {
  return proposals.filter((p) => citedPropositions(p.forslag).some((c) => props.includes(c)));
}

/** The decision vote of `bet` for a promise whose evidence includes the given propositions. */
export async function fillBetVotes(
  client: VotesClient,
  bet: EvidenceLike,
  evidence: EvidenceLike[],
): Promise<FillOutcome> {
  const ref = betRef(bet.designation ?? '');
  if (!ref || !bet.dok_id) return { status: 'ambiguous', reason: 'unrecognised bet designation' };
  const props = evidence.flatMap((e) =>
    e.kind === 'prop' ? [propRef(e.designation ?? '')].filter((r) => r !== null) : [],
  );
  if (props.length === 0) {
    return { status: 'ambiguous', reason: 'promise has no prop evidence to pick the point by' };
  }
  const { committeeProposals } = await client.getDocumentStatus(bet.dok_id);
  const cited = pointsCitingProp(committeeProposals, props);
  if (cited.length === 0) {
    return {
      status: 'ambiguous',
      reason: `no committee point cites ${props.join(', ')} (the bet decides motions only or the text is unparsed)`,
    };
  }
  const voted = cited.filter((p) => p.votering_id !== '');
  if (voted.length === 0) {
    return {
      status: 'no-recorded-vote',
      reason: `point ${cited.map((p) => p.punkt).join(', ')} decided without a recorded vote`,
    };
  }
  if (voted.length > 1) {
    return {
      status: 'ambiguous',
      reason: `several voted points cite ${props.join(', ')}: ${voted.map((p) => p.punkt).join(', ')}`,
    };
  }
  const r = await resolvePoint(
    committeeProposals,
    { rm: ref.rm, bet: ref.bet, punkt: voted[0].punkt },
    (id) => client.getVoteMembers(id),
  );
  if (r.status === 'no-recorded-vote') return { status: 'no-recorded-vote', reason: r.reason };
  if (r.status === 'ambiguous') return { status: 'ambiguous', reason: r.reason };
  if (r.kind !== 'decision') {
    return {
      status: 'ambiguous',
      reason: `point ${r.punkt} vote is a motivfråga, not the decision`,
    };
  }
  if (Object.keys(r.votes).length === 0) {
    return { status: 'ambiguous', reason: `point ${r.punkt} has no party position` };
  }
  return { status: 'filled', punkt: r.punkt, votingId: r.votingId, votes: r.votes, tied: r.tied };
}
