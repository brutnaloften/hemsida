import { describe, expect, it } from 'vitest';
import type { MemberVote } from './riksdag.ts';
import { betRef, citedPropositions, fillBetVotes, propRef } from './fill-votes.ts';
import type { VotesClient } from './votes.ts';

const members = (id: string, avser: string, parti: string, rost: string, n: number): MemberVote[] =>
  Array.from({ length: n }, () => ({ votering_id: id, parti, rost, avser }));

const V1 = 'aaaa0000-0000-4000-8000-000000000001';
const V2 = 'aaaa0000-0000-4000-8000-000000000002';
const VM = 'aaaa0000-0000-4000-8000-000000000003';

const rows: Record<string, MemberVote[]> = {
  [V1]: [...members(V1, 'sakfrågan', 'M', 'Ja', 5), ...members(V1, 'sakfrågan', 'S', 'Nej', 4)],
  [V2]: [...members(V2, 'sakfrågan', 'M', 'Ja', 5)],
  [VM]: [...members(VM, 'motivfrågan', 'M', 'Ja', 5)],
};

const point = (punkt: string, forslag: string, votering_id: string) => ({
  punkt,
  rubrik: '',
  forslag,
  beslutstyp: votering_id ? 'röstning' : 'acklamation',
  votering_id,
  vinnare: '',
});

function client(proposals: ReturnType<typeof point>[]): VotesClient {
  return {
    async *listAllDocuments() {},
    async getDocumentStatus() {
      return { committeeProposals: proposals } as never;
    },
    async getVoteMembers(id) {
      return rows[id] ?? [];
    },
  };
}

const bet = { kind: 'bet', dok_id: 'HB01NU5', designation: 'Bet. 2023/24:NU5' };
const prop = { kind: 'prop', dok_id: 'HB0319', designation: 'Prop. 2023/24:19' };
const bill =
  'Därmed bifaller riksdagen proposition 2023/24:19 punkterna 1 och 2 samt avslår motionerna 2023/24:2751';

describe('parsing', () => {
  it('reads propositions and bets from designations', () => {
    expect(propRef('Prop. 2023/24:19')).toBe('2023/24:19');
    expect(propRef('Bet. 2023/24:NU5')).toBeNull();
    expect(betRef('Bet. 2023/24:NU5')).toEqual({ rm: '2023/24', bet: 'NU5' });
    expect(betRef('Prop. 2023/24:19')).toBeNull();
  });
  it('does not mistake a motion with the same number for the proposition', () => {
    expect(citedPropositions(bill)).toEqual(['2023/24:19']);
    expect(citedPropositions('proposition 2023/24:19 och 2023/24:20')).toEqual([
      '2023/24:19',
      '2023/24:20',
    ]);
    expect(citedPropositions('avslår motion 2023/24:19')).toEqual([]);
  });
});

describe('fillBetVotes', () => {
  it('fills party votes from the one voted point citing the proposition', async () => {
    const c = client([point('1', bill, V1), point('2', 'avslår motion 2023/24:19', V2)]);
    const r = await fillBetVotes(c, bet, [bet, prop]);
    expect(r).toMatchObject({
      status: 'filled',
      punkt: '1',
      votes: { M: 'yes', S: 'no' },
      tied: [],
    });
  });

  it('reports no recorded vote for an acklamation point', async () => {
    const r = await fillBetVotes(client([point('1', bill, '')]), bet, [bet, prop]);
    expect(r.status).toBe('no-recorded-vote');
  });

  it('reports ambiguity instead of picking between two voted points', async () => {
    const c = client([point('1', bill, V1), point('2', bill, V2)]);
    const r = await fillBetVotes(c, bet, [bet, prop]);
    expect(r).toMatchObject({ status: 'ambiguous' });
  });

  it('reports ambiguity without prop evidence or a citing point', async () => {
    expect((await fillBetVotes(client([point('1', bill, V1)]), bet, [bet])).status).toBe(
      'ambiguous',
    );
    expect(
      (await fillBetVotes(client([point('1', 'avslår motion 2023/24:19', V1)]), bet, [bet, prop]))
        .status,
    ).toBe('ambiguous');
  });

  it('refuses a motivfråga vote as the decision', async () => {
    const r = await fillBetVotes(client([point('1', bill, VM)]), bet, [bet, prop]);
    expect(r).toMatchObject({ status: 'ambiguous' });
  });
});
