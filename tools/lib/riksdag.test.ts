import { describe, expect, it } from "vitest";
import {
  createRiksdagClient,
  formatRm,
  normaliseUrl,
  RiksdagHttpError,
  sameVoteId,
} from "./riksdag.ts";
import * as fx from "./riksdag.fixtures.ts";

function setup(responses: Array<unknown | { status: number }>, extra = {}) {
  const urls: string[] = [];
  const sleeps: number[] = [];
  let clock = 0;
  let i = 0;
  const client = createRiksdagClient({
    fetch: (async (input: string | URL | Request) => {
      urls.push(String(input));
      const r = responses[Math.min(i++, responses.length - 1)] as any;
      if (r && typeof r.status === "number") return new Response("err", { status: r.status });
      return new Response(JSON.stringify(r), { status: 200 });
    }) as typeof fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    now: () => clock,
    ...extra,
  });
  return { client, urls, sleeps };
}

describe("helpers", () => {
  it("formats rm per type", () => {
    expect(formatRm("prop", 2023)).toBe("2023/24");
    expect(formatRm("bet", 2099)).toBe("2099/00");
    expect(formatRm("sou", 2023)).toBe("2023");
    expect(formatRm("sfs", 2024)).toBe("2024");
  });
  it("normalises urls", () => {
    expect(normaliseUrl("//data.riksdagen.se/x")).toBe("https://data.riksdagen.se/x");
    expect(normaliseUrl("http://data.riksdagen.se/x")).toBe("https://data.riksdagen.se/x");
    expect(normaliseUrl("")).toBe("");
  });
  it("compares vote ids case-insensitively", () => {
    expect(sameVoteId("2c19", "2C19")).toBe(true);
    expect(sameVoteId("", "")).toBe(false);
  });
});

describe("listDocuments", () => {
  it("parses a page and normalises scalars and urls", async () => {
    const { client, urls } = setup([fx.dokumentlistaProp]);
    const page = await client.listDocuments({
      doktyp: "prop",
      rm: formatRm("prop", 2023),
      org: "FiU",
      sok: "kärnkraft",
    });
    expect(page).toMatchObject({ total: 196, page: 1, pages: 98 });
    expect(page.documents).toHaveLength(2);
    expect(page.documents[0]).toMatchObject({
      dok_id: "HB0319",
      dokument_url_html: "https://data.riksdagen.se/dokument/HB0319.html",
      dokumentstatus_url_xml: "https://data.riksdagen.se/dokumentstatus/HB0319.xml",
    });
    expect(page.documents[1]).toMatchObject({ subtyp: "skr", organ: "" });
    const u = new URL(urls[0]!);
    expect(u.pathname).toBe("/dokumentlista/");
    expect(u.searchParams.get("rm")).toBe("2023/24");
    expect(u.searchParams.get("org")).toBe("FiU");
    expect(u.searchParams.get("organ")).toBeNull();
    expect(u.searchParams.get("utformat")).toBe("json");
    expect(u.searchParams.get("sz")).toBe("200");
  });

  it("wraps a single hit in an array and treats no hits as empty", async () => {
    const { client } = setup([fx.dokumentlistaSingle, fx.dokumentlistaEmpty]);
    const one = await client.listDocuments({ doktyp: "sfs" });
    expect(one.documents.map((d) => d.dok_id)).toEqual(["sfs-2024-7"]);
    const none = await client.listDocuments({ doktyp: "nosuch" });
    expect(none).toEqual({ total: 0, page: 1, pages: 0, documents: [] });
  });

  it("clamps sz, joins doktyp and repeats rm", async () => {
    const { client, urls } = setup([fx.dokumentlistaEmpty]);
    await client.listDocuments({ doktyp: ["prop", "bet"], rm: ["2022/23", "2023/24"], sz: 1000 });
    const u = new URL(urls[0]!);
    expect(u.searchParams.get("doktyp")).toBe("prop,bet");
    expect(u.searchParams.getAll("rm")).toEqual(["2022/23", "2023/24"]);
    expect(u.searchParams.get("sz")).toBe("200");
  });

  it("pages through all hits", async () => {
    const page = (p: number, sidor: number) => ({
      dokumentlista: {
        "@traffar": "2",
        "@sida": String(p),
        "@sidor": String(sidor),
        dokument: [{ dok_id: `D${p}` }],
      },
    });
    const { client, urls } = setup([page(1, 2), page(2, 2)]);
    const ids: string[] = [];
    for await (const d of client.listAllDocuments({ doktyp: "prop" })) ids.push(d.dok_id);
    expect(ids).toEqual(["D1", "D2"]);
    expect(new URL(urls[1]!).searchParams.get("p")).toBe("2");
  });
});

describe("getDocumentStatus", () => {
  it("parses a betänkande, dropping html", async () => {
    const { client, urls } = setup([fx.dokumentstatusBet]);
    const s = await client.getDocumentStatus("HB01NU5");
    expect(new URL(urls[0]!).pathname).toBe("/dokumentstatus/HB01NU5.json");
    expect(s.document.dok_id).toBe("HB01NU5");
    expect("html" in s.document).toBe(false);
    expect(s.references.map((r) => [r.referenstyp, r.ref_dok_id])).toEqual([
      ["behandlar", "HB0319"],
      ["rskr", "HB0K45"],
    ]);
    expect(s.committeeProposals).toHaveLength(2);
    expect(s.committeeProposals[0]!.votering_id).toBe("2c198cdf-3a9c-4318-a678-e6aff5c2c68a");
    expect(s.activities).toHaveLength(1);
    expect(s.notes[0]!.kod).toBe("rdbeslut");
  });

  it("normalises single objects to arrays", async () => {
    const { client } = setup([fx.dokumentstatusPropSingle]);
    const s = await client.getDocumentStatus("HB0319");
    expect(s.references).toHaveLength(1);
    expect(s.references[0]!.ref_dok_id).toBe("HB01NU5");
    expect(s.committeeProposals).toHaveLength(1);
    expect(s.activities).toEqual([]);
  });

  it("handles documents with only dokument", async () => {
    const { client } = setup([fx.dokumentstatusDir]);
    const s = await client.getDocumentStatus("HBB11");
    expect(s.document.rm).toBe("2023");
    expect(s.references).toEqual([]);
  });

  it("throws a typed error on 404", async () => {
    const { client } = setup([{ status: 404 }]);
    await expect(client.getDocumentStatus("NOSUCH")).rejects.toBeInstanceOf(RiksdagHttpError);
  });

  it("throws on an unexpected shape", async () => {
    const { client } = setup([{ nope: true }]);
    await expect(client.getDocumentStatus("X")).rejects.toThrow(/Unexpected Riksdag response/);
  });
});

describe("votes", () => {
  it("parses party totals", async () => {
    const { client, urls } = setup([fx.voteringlistaParti]);
    const rows = await client.getPartyVotes({ rm: "2023/24", bet: "NU5", punkt: "1" });
    expect(rows).toEqual([
      { parti: "M", Ja: 59, Nej: 0, Frånvarande: 8, Avstår: 0 },
      { parti: "S", Ja: 0, Nej: 93, Frånvarande: 10, Avstår: 0 },
      { parti: "-", Ja: 1, Nej: 0, Frånvarande: 0, Avstår: 0 },
    ]);
    const u = new URL(urls[0]!);
    expect(u.searchParams.get("gruppering")).toBe("parti");
    expect(u.searchParams.get("punkt")).toBe("1");
  });

  it("parses a single vote total row and empty results", async () => {
    const { client } = setup([fx.voteringlistaVoteringId, fx.voteringlistaEmpty]);
    const rows = await client.getVoteTotals({ rm: "2023/24", bet: "NU5" });
    expect(rows).toEqual([
      {
        votering_id: "2C198CDF-3A9C-4318-A678-E6AFF5C2C68A",
        Ja: 152,
        Nej: 149,
        Frånvarande: 48,
        Avstår: 0,
      },
    ]);
    expect(await client.getVoteTotals({ rm: "2023/24", bet: "X" })).toEqual([]);
  });
});

describe("getVoteMembers", () => {
  const body = (n: number) => ({
    votering: {
      dokument: { dok_id: "HB01NU5" },
      dokvotering: {
        votering: Array.from({ length: n }, (_, i) => ({
          dok_id: "HB01NU5",
          votering_id: "46B018B4-3F64-4613-883C-F160032658BE",
          punkt: "2",
          namn: `Ledamot ${i}`,
          parti: "S",
          rost: "Nej",
          avser: "sakfrågan",
        })),
      },
    },
  });
  const id = "46B018B4-3F64-4613-883C-F160032658BE";

  it("requests /votering/{id}.json and returns all rows beyond 500", async () => {
    const { client, urls } = setup([body(699)]);
    const rows = await client.getVoteMembers(id);
    expect(urls).toEqual([`https://data.riksdagen.se/votering/${id}.json`]);
    expect(rows).toHaveLength(699);
    expect(rows[0]).toEqual({
      votering_id: id,
      parti: "S",
      rost: "Nej",
      avser: "sakfrågan",
    });
  });

  it("accepts a single row object and an empty body", async () => {
    const one = body(1);
    const { client } = setup([
      { votering: { dokvotering: { votering: one.votering.dokvotering.votering[0] } } },
    ]);
    expect(await client.getVoteMembers(id)).toHaveLength(1);
    const empty = createRiksdagClient({
      fetch: (async () => new Response("", { status: 200 })) as typeof fetch,
      sleep: async () => undefined,
    });
    expect(await empty.getVoteMembers("46B018B4")).toEqual([]);
  });
});

describe("throttle and retry", () => {
  it("spaces requests by the minimum interval", async () => {
    const { client, sleeps } = setup([fx.dokumentlistaEmpty]);
    await client.listDocuments({ doktyp: "a" });
    await client.listDocuments({ doktyp: "b" });
    expect(sleeps).toEqual([1000]);
  });

  it("retries 5xx then succeeds", async () => {
    const { client, urls } = setup([{ status: 503 }, fx.dokumentlistaEmpty], { minIntervalMs: 0 });
    const page = await client.listDocuments({ doktyp: "a" });
    expect(page.total).toBe(0);
    expect(urls).toHaveLength(2);
  });

  it("gives up after the retry budget", async () => {
    const { client, urls } = setup([{ status: 500 }], { minIntervalMs: 0, retries: 1 });
    await expect(client.listDocuments({ doktyp: "a" })).rejects.toBeInstanceOf(RiksdagHttpError);
    expect(urls).toHaveLength(2);
  });

  it("does not retry 404", async () => {
    const { client, urls } = setup([{ status: 404 }], { minIntervalMs: 0 });
    await expect(client.getDocumentStatus("X")).rejects.toBeInstanceOf(RiksdagHttpError);
    expect(urls).toHaveLength(1);
  });
});

describe("network errors and concurrency", () => {
  it("retries a network error then succeeds", async () => {
    let calls = 0;
    const client = createRiksdagClient({
      fetch: (async () => {
        if (calls++ === 0) throw new TypeError("fetch failed");
        return new Response(JSON.stringify(fx.dokumentlistaEmpty));
      }) as typeof fetch,
      sleep: async () => {},
      minIntervalMs: 0,
    });
    expect((await client.listDocuments({ doktyp: "a" })).total).toBe(0);
    expect(calls).toBe(2);
  });

  it("serialises and spaces concurrent callers", async () => {
    let clock = 0;
    const starts: number[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const client = createRiksdagClient({
      fetch: (async () => {
        starts.push(clock);
        maxInFlight = Math.max(maxInFlight, ++inFlight);
        await Promise.resolve();
        inFlight--;
        return new Response(JSON.stringify(fx.dokumentlistaEmpty));
      }) as typeof fetch,
      sleep: async (ms) => {
        clock += ms;
      },
      now: () => clock,
    });
    await Promise.all([1, 2, 3].map((n) => client.listDocuments({ doktyp: String(n) })));
    expect(starts).toEqual([0, 1000, 2000]);
    expect(maxInFlight).toBe(1);
  });

  it("falls back to the default page size for NaN", async () => {
    const { client, urls } = setup([fx.dokumentlistaEmpty]);
    await client.listDocuments({ sz: Number.NaN });
    expect(new URL(urls[0]!).searchParams.get("sz")).toBe("200");
  });
});
