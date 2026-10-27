import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import {
  countPdfPages,
  extractChunk,
  makeChunks,
  mergeChunk,
  slugify,
  type RawCandidate,
} from "./tido-extract.ts";

const raw = (over: Partial<RawCandidate> = {}): RawCandidate => ({
  slug: "Skärpta straff",
  title: "Skärpta straff",
  description: "Straffen för gängbrott ska skärpas.",
  page: 3,
  quote: "Straffen ska skärpas",
  type: "legislative",
  area: "Kriminalpolitik",
  ministry: "Justitiedepartementet",
  committee: "JuU",
  keywords: ["gängbrott", " straff "],
  ...over,
});

function mockClient(candidates: RawCandidate[], stop_reason = "end_turn") {
  const calls: unknown[] = [];
  const client = {
    messages: {
      parse: async (params: unknown) => {
        calls.push(params);
        return { stop_reason, parsed_output: { candidates } };
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}

describe("helpers", () => {
  it("chunks pages", () => {
    expect(makeChunks(10, 4).map((c) => c.key)).toEqual(["p1-4", "p5-8", "p9-10"]);
  });
  it("slugifies Swedish", () => {
    expect(slugify("Skärpta straff för åklagare!")).toBe("skarpta-straff-for-aklagare");
  });
  it("counts pages heuristically", () => {
    const pdf = Buffer.from("/Type /Pages /Type /Page /Type/Page /Type /Page");
    expect(countPdfPages(pdf)).toBe(3);
    expect(countPdfPages(Buffer.from("nothing"))).toBeNull();
  });
});

describe("extractChunk", () => {
  const chunk = makeChunks(8, 8)[0];

  it("produces schema-valid drafts, dedupes ids, drops out-of-range pages", async () => {
    const { client, calls } = mockClient([raw(), raw(), raw({ title: "Utanför", page: 99 })]);
    const entries = await extractChunk(client, "AAAA", chunk, new Set());
    expect(entries.map((e) => e.promise.id)).toEqual([
      "tido-skarpta-straff",
      "tido-skarpta-straff-2",
    ]);
    expect(entries[0].promise.verdict.value).toBe("not_started");
    expect(entries[0].promise.keywords).toEqual(["gängbrott", "straff"]);
    expect(entries[0].promise.roles.SD).toBe("support");
    expect(entries[0].ministry).toBe("Justitiedepartementet");
    expect(JSON.stringify(calls[0])).toContain("pages 1 to 8");
  });

  it("throws on max_tokens", async () => {
    const { client } = mockClient([], "max_tokens");
    await expect(extractChunk(client, "AAAA", chunk, new Set())).rejects.toThrow(/max_tokens/);
  });
});

describe("mergeChunk", () => {
  it("replaces a chunk idempotently", async () => {
    const chunk = makeChunks(8, 8)[0];
    const { client } = mockClient([raw()]);
    const first = await extractChunk(client, "A", chunk, new Set());
    const once = mergeChunk([], chunk, first);
    const again = mergeChunk(once, chunk, await extractChunk(client, "A", chunk, new Set()));
    expect(again).toEqual(once);
  });
});
