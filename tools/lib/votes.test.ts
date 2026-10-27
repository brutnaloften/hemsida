import { describe, expect, it } from 'vitest';
import type { MemberVote, PartyVotes } from './riksdag.ts';
import { aggregateParties, getBetPartyVotes, getPointPartyVotes, partyChoice } from './votes.ts';
import type { VotesClient } from './votes.ts';

const row = (parti: string, Ja = 0, Nej = 0, Frånvarande = 0, Avstår = 0): PartyVotes => ({
  parti,
  Ja,
  Nej,
  Frånvarande,
  Avstår,
});

/** n members of a party with the same vote. */
const members = (
  votering_id: string,
  avser: string,
  parti: string,
  rost: string,
  n: number,
): MemberVote[] => Array.from({ length: n }, () => ({ votering_id, parti, rost, avser }));

const P1 = '2c198cdf-3a9c-4318-a678-e6aff5c2c68a';
const P2 = '46b018b4-3f64-4613-883c-f160032658be';
const P4 = '86CD7737-A18E-4E06-B804-336656E8B507';
const PWEIRD = '11111111-0000-4000-8000-000000000000';
const P1_UP = P1.toUpperCase();

/**
 * Member rows per vote id, as `/votering/{id}.json` returns them: only that
 * vote's rows, never the other votes under the same point.
 */
const voteRows: Record<string, MemberVote[]> = {
  [P1]: [
    ...members(P1_UP, 'sakfrågan', '-', 'Ja', 1),
    ...members(P1_UP, 'sakfrågan', 'C', 'Nej', 21),
    ...members(P1_UP, 'sakfrågan', 'KD', 'Ja', 16),
    ...members(P1_UP, 'sakfrågan', 'M', 'Ja', 59),
    ...members(P1_UP, 'sakfrågan', 'S', 'Nej', 93),
    ...members(P1_UP, 'sakfrågan', 'V', 'Nej', 20),
    ...members(P1_UP, 'sakfrågan', 'SD', 'Ja', 72),
    ...members(P1_UP, 'sakfrågan', 'L', 'Ja', 13),
    ...members(P1_UP, 'sakfrågan', 'MP', 'Nej', 15),
    ...members(P1_UP, 'sakfrågan', 'V', 'Frånvarande', 39),
  ],
  // A point with two votes: a sakfråga vote (349 members). The point's other vote, the
  // motivfråga, has 349 more rows in voteringlista, which is why that
  // endpoint (500 rows max) cannot resolve this point.
  [P2]: [
    ...members(P2.toUpperCase(), 'sakfrågan', '-', 'Ja', 1),
    ...members(P2.toUpperCase(), 'sakfrågan', 'M', 'Ja', 59),
    ...members(P2.toUpperCase(), 'sakfrågan', 'SD', 'Ja', 63),
    ...members(P2.toUpperCase(), 'sakfrågan', 'KD', 'Ja', 16),
    ...members(P2.toUpperCase(), 'sakfrågan', 'L', 'Ja', 13),
    ...members(P2.toUpperCase(), 'sakfrågan', 'S', 'Nej', 93),
    ...members(P2.toUpperCase(), 'sakfrågan', 'C', 'Nej', 21),
    ...members(P2.toUpperCase(), 'sakfrågan', 'MP', 'Avstår', 15),
    ...members(P2.toUpperCase(), 'sakfrågan', 'V', 'Avstår', 20),
    ...members(P2.toUpperCase(), 'sakfrågan', 'S', 'Frånvarande', 48),
  ],
  // Motivfråga only, as in NU5 punkt 4.
  [P4]: [
    ...members(P4, 'motivfrågan', 'M', 'Ja', 59),
    ...members(P4, 'motivfrågan', 'V', 'Nej', 20),
    ...members(P4, 'motivfrågan', 'S', 'Avstår', 90),
  ],
  [PWEIRD]: members(PWEIRD, 'något annat', 'M', 'Ja', 5),
};

function fakeClient(overrides: Partial<VotesClient> = {}) {
  const calls: string[] = [];
  const vote = (punkt: string, beslutstyp: string, votering_id: string) => ({
    punkt,
    rubrik: '',
    beslutstyp,
    votering_id,
    vinnare: '',
  });
  const client: VotesClient = {
    async *listAllDocuments() {
      yield { dok_id: 'HB01NU4', beteckning: 'NU4' } as never;
      yield { dok_id: 'HB01NU5', beteckning: 'NU5' } as never;
    },
    async getDocumentStatus(id) {
      calls.push(`status ${id}`);
      return {
        committeeProposals: [
          vote('1', 'röstning', P1),
          vote('2', 'röstning', P2),
          vote('3', 'acklamation', ''),
          vote('4', 'acklamation', P4),
          vote('5', 'röstning', PWEIRD),
          vote('7', 'röstning', '99999999-0000-4000-8000-000000000000'),
        ],
      } as never;
    },
    async getVoteMembers(votingId) {
      calls.push(`members ${votingId}`);
      return voteRows[votingId] ?? [];
    },
    ...overrides,
  };
  return { client, calls };
}

describe('partyChoice', () => {
  it('picks the majority and treats absent only as a fallback', () => {
    expect(partyChoice(row('S', 3, 90))).toBe('no');
    expect(partyChoice(row('S', 0, 0, 5))).toBe('absent');
    expect(partyChoice(row('S', 1, 0, 50))).toBe('yes');
    expect(partyChoice(row('S', 0, 0, 0, 4))).toBe('abstain');
  });
  it('returns undefined for ties and empty rows', () => {
    expect(partyChoice(row('S', 2, 2))).toBeUndefined();
    expect(partyChoice(row('S'))).toBeUndefined();
  });
});

describe('aggregateParties', () => {
  it('ignores the speaker and reports ties', () => {
    const { votes, tied } = aggregateParties([row('-', 1), row('M', 5), row('S', 2, 2)]);
    expect(votes).toEqual({ M: 'yes' });
    expect(tied).toEqual(['S']);
  });
  it('does not call an all-zero party row tied', () => {
    const { votes, tied } = aggregateParties([row('M', 5), row('S')]);
    expect(votes).toEqual({ M: 'yes' });
    expect(tied).toEqual([]);
  });
});

describe('getPointPartyVotes', () => {
  const ref = { rm: '2023/24', bet: 'NU5' };

  it('labels a sakfråga as a decision and matches lowercase ids', async () => {
    const { client } = fakeClient();
    const r = await getPointPartyVotes(client, { ...ref, punkt: '1' });
    expect(r).toMatchObject({
      status: 'ok',
      votingId: P1,
      kind: 'decision',
      votes: { C: 'no', KD: 'yes', M: 'yes', S: 'no', V: 'no' },
      tied: [],
      totals: { yes: 161, no: 149, abstain: 0, absent: 39 },
    });
  });

  it('resolves a point with two votes by fetching its own vote id', async () => {
    const { client, calls } = fakeClient();
    const r = await getPointPartyVotes(client, { ...ref, punkt: '2', dokId: 'HB01NU5' });
    expect(r).toMatchObject({
      status: 'ok',
      votingId: P2,
      kind: 'decision',
      votes: {
        M: 'yes',
        SD: 'yes',
        S: 'no',
        V: 'abstain',
        C: 'no',
        MP: 'abstain',
        KD: 'yes',
        L: 'yes',
      },
      totals: { yes: 152, no: 114, abstain: 35, absent: 48 },
    });
    expect(calls).toEqual(['status HB01NU5', `members ${P2}`]);
  });

  it('labels a motivfråga as reasoning', async () => {
    const { client } = fakeClient();
    const r = await getPointPartyVotes(client, { ...ref, punkt: '4' });
    expect(r).toMatchObject({
      status: 'ok',
      votingId: P4,
      kind: 'reasoning',
      votes: { M: 'yes', V: 'no', S: 'abstain' },
    });
  });

  it('reports no recorded vote for an empty id without requesting votes', async () => {
    const { client, calls } = fakeClient();
    const r = await getPointPartyVotes(client, { ...ref, punkt: '3' });
    expect(r).toMatchObject({ status: 'no-recorded-vote', punkt: '3' });
    expect(calls).toEqual(['status HB01NU5']);
  });

  it('flags an unknown avser as ambiguous', async () => {
    const { client } = fakeClient();
    const r = await getPointPartyVotes(client, { ...ref, punkt: '5' });
    expect(r).toMatchObject({ status: 'ambiguous', votingId: PWEIRD });
  });

  it('reports unknown points and missing roll-call data', async () => {
    const { client } = fakeClient();
    const unknown = await getPointPartyVotes(client, { ...ref, punkt: '9' });
    expect(unknown).toMatchObject({ status: 'no-recorded-vote' });
    const missing = await getPointPartyVotes(client, { ...ref, punkt: '7' });
    expect(missing).toMatchObject({ status: 'no-recorded-vote' });
  });

  it('returns not-found for an unknown bet and skips lookup with dokId', async () => {
    const { client, calls } = fakeClient();
    expect(await getPointPartyVotes(client, { ...ref, bet: 'XX9', punkt: '1' })).toEqual({
      status: 'not-found',
      reason: 'no bet XX9 in 2023/24',
    });
    await getPointPartyVotes(client, { ...ref, punkt: '1', dokId: 'HB01NU5' });
    expect(calls[0]).toBe('status HB01NU5');
  });
});

describe('getBetPartyVotes', () => {
  it('fetches the document once and members once per voted point', async () => {
    const { client, calls } = fakeClient();
    const r = await getBetPartyVotes(client, { rm: '2023/24', bet: 'NU5' });
    expect(Array.isArray(r) && r.map((x) => x.status)).toEqual([
      'ok',
      'ok',
      'no-recorded-vote',
      'ok',
      'ambiguous',
      'no-recorded-vote',
    ]);
    expect(calls.filter((c) => c.startsWith('status'))).toHaveLength(1);
    expect(calls.filter((c) => c.startsWith('members'))).toHaveLength(5);
  });
});
