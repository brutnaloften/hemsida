import { describe, expect, it } from "vitest";
import type { PartyVotes, VoteTotals } from "./riksdag.ts";
import { aggregateParties, getBetPartyVotes, getPointPartyVotes, partyChoice } from "./votes.ts";
import type { VotesClient } from "./votes.ts";

const row = (parti: string, Ja = 0, Nej = 0, Frånvarande = 0, Avstår = 0): PartyVotes => ({
  parti,
  Ja,
  Nej,
  Frånvarande,
  Avstår,
});
const total = (votering_id: string, Ja: number, Nej: number, Frånvarande = 0, Avstår = 0) =>
  ({ votering_id, Ja, Nej, Frånvarande, Avstår }) satisfies VoteTotals;

const P1 = "2c198cdf-3a9c-4318-a678-e6aff5c2c68a";
const P4 = "86CD7737-A18E-4E06-B804-336656E8B507";

const p1Rows = [
  row("-", 1),
  row("C", 0, 21),
  row("KD", 16),
  row("L", 13),
  row("M", 59),
  row("MP", 0, 15),
  row("S", 0, 93),
  row("SD", 63),
  row("V", 0, 20, 48),
];

function fakeClient(overrides: Partial<VotesClient> = {}) {
  const calls: string[] = [];
  const client: VotesClient = {
    async *listAllDocuments() {
      yield { dok_id: "HB01NU4", beteckning: "NU4" } as never;
      yield { dok_id: "HB01NU5", beteckning: "NU5" } as never;
    },
    async getDocumentStatus(id) {
      calls.push(`status ${id}`);
      return {
        committeeProposals: [
          { punkt: "1", rubrik: "", beslutstyp: "röstning", votering_id: P1, vinnare: "" },
          { punkt: "3", rubrik: "", beslutstyp: "acklamation", votering_id: "", vinnare: "" },
          { punkt: "4", rubrik: "", beslutstyp: "acklamation", votering_id: P4, vinnare: "" },
        ],
      } as never;
    },
    async getVoteTotals() {
      calls.push("totals");
      return [total(P1.toUpperCase(), 152, 149, 48), total(P4, 154, 20, 0, 127)];
    },
    async getPartyVotes({ punkt }) {
      calls.push(`parties ${punkt}`);
      return punkt === "1" ? p1Rows : [row("S", 0, 0, 0, 90), row("M", 59)];
    },
    ...overrides,
  };
  return { client, calls };
}

describe("partyChoice", () => {
  it("picks the majority and treats absent only as a fallback", () => {
    expect(partyChoice(row("S", 3, 90))).toBe("no");
    expect(partyChoice(row("S", 0, 0, 5))).toBe("absent");
    expect(partyChoice(row("S", 1, 0, 50))).toBe("yes");
    expect(partyChoice(row("S", 0, 0, 0, 4))).toBe("abstain");
  });
  it("returns undefined for ties and empty rows", () => {
    expect(partyChoice(row("S", 2, 2))).toBeUndefined();
    expect(partyChoice(row("S"))).toBeUndefined();
  });
});

describe("aggregateParties", () => {
  it("ignores the speaker and reports ties", () => {
    const { votes, tied } = aggregateParties([row("-", 1), row("M", 5), row("S", 2, 2)]);
    expect(votes).toEqual({ M: "yes" });
    expect(tied).toEqual(["S"]);
  });
});

describe("getPointPartyVotes", () => {
  it("matches lowercase proposal ids to uppercase totals", async () => {
    const { client } = fakeClient();
    const r = await getPointPartyVotes(client, { rm: "2023/24", bet: "NU5", punkt: "1" });
    expect(r).toMatchObject({
      status: "ok",
      votingId: P1,
      votes: { C: "no", KD: "yes", L: "yes", M: "yes", MP: "no", S: "no", SD: "yes", V: "no" },
      tied: [],
      totals: { yes: 152, no: 149, abstain: 0, absent: 48 },
    });
  });

  it("reports no recorded vote for an empty id without requesting votes", async () => {
    const { client, calls } = fakeClient();
    const r = await getPointPartyVotes(client, { rm: "2023/24", bet: "NU5", punkt: "3" });
    expect(r).toMatchObject({ status: "no-recorded-vote", punkt: "3" });
    expect(calls).toEqual(["status HB01NU5"]);
  });

  it("flags a point whose party rows do not match its vote", async () => {
    const { client } = fakeClient();
    const r = await getPointPartyVotes(client, { rm: "2023/24", bet: "NU5", punkt: "4" });
    expect(r).toMatchObject({ status: "ambiguous", votingId: P4 });
  });

  it("reports unknown points and missing roll-call data", async () => {
    const { client } = fakeClient({ getVoteTotals: async () => [] });
    const unknown = await getPointPartyVotes(client, { rm: "2023/24", bet: "NU5", punkt: "9" });
    expect(unknown).toMatchObject({ status: "no-recorded-vote" });
    const missing = await getPointPartyVotes(client, { rm: "2023/24", bet: "NU5", punkt: "1" });
    expect(missing).toMatchObject({ status: "no-recorded-vote" });
  });

  it("returns not-found for an unknown bet and skips lookup with dokId", async () => {
    const { client, calls } = fakeClient();
    expect(await getPointPartyVotes(client, { rm: "2023/24", bet: "XX9", punkt: "1" })).toEqual({
      status: "not-found",
      reason: "no bet XX9 in 2023/24",
    });
    await getPointPartyVotes(client, { rm: "2023/24", bet: "NU5", punkt: "1", dokId: "HB01NU5" });
    expect(calls[0]).toBe("status HB01NU5");
  });
});

describe("getBetPartyVotes", () => {
  it("resolves every point with one totals request", async () => {
    const { client, calls } = fakeClient();
    const r = await getBetPartyVotes(client, { rm: "2023/24", bet: "NU5" });
    expect(Array.isArray(r) && r.map((x) => x.status)).toEqual([
      "ok",
      "no-recorded-vote",
      "ambiguous",
    ]);
    expect(calls.filter((c) => c === "totals")).toHaveLength(1);
  });
});
