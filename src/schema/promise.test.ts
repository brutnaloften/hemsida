import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { promiseSchema, legacyPromiseSchema, VERDICTS, VERDICT_LABELS } from "@/schema/promise";

const valid = {
  id: "tido-skarpta-straff-gangbrott",
  term: "2022-2026",
  title: "Skärpta straff",
  description: "Straffen ska skärpas.",
  source: { id: "tidoavtalet", page: 23 },
  parties: ["M", "KD", "L", "SD"],
  roles: { M: "government", SD: "support" },
  type: "legislative",
  area: "Kriminalpolitik",
  verdict: {
    value: "fulfilled",
    reasoning: "Lagen trädde i kraft.",
    date: "2023-07-01",
    history: [{ value: "in_progress", reasoning: "Prop lagd.", date: "2023-03-02" }],
  },
  evidence: [
    {
      kind: "prop",
      dok_id: "HA03xxx",
      designation: "Prop. 2022/23:45",
      title: "Skärpta straff",
      date: "2023-03-02",
      url: "https://data.riksdagen.se/dokument/HA03xxx",
      relevance: "full",
    },
  ],
};

describe("promiseSchema", () => {
  it("accepts a valid promise and applies defaults", () => {
    const p = promiseSchema.parse(valid);
    expect(p.keywords).toEqual([]);
    expect(p.evidence[0]!.note).toBeNull();
  });

  it("rejects unknown verdict values", () => {
    const bad = { ...valid, verdict: { ...valid.verdict, value: "Uppfyllt" } };
    expect(promiseSchema.safeParse(bad).success).toBe(false);
  });

  it("requires reasoning except for not_started", () => {
    const v = (value: string) => ({
      ...valid,
      verdict: { value, reasoning: "", date: "2023-01-01" },
    });
    expect(promiseSchema.safeParse(v("not_started")).success).toBe(true);
    expect(promiseSchema.safeParse(v("broken")).success).toBe(false);
  });

  it("rejects bad terms, parties and evidence kinds", () => {
    expect(promiseSchema.safeParse({ ...valid, term: "2022" }).success).toBe(false);
    expect(promiseSchema.safeParse({ ...valid, parties: ["X"] }).success).toBe(false);
    const ev = [{ ...valid.evidence[0], kind: "news" }];
    expect(promiseSchema.safeParse({ ...valid, evidence: ev }).success).toBe(false);
  });

  it("has a Swedish label for every verdict", () => {
    for (const v of VERDICTS) expect(VERDICT_LABELS[v]).toBeTruthy();
  });
});

describe("legacyPromiseSchema", () => {
  it("accepts every current data file", () => {
    const dir = "src/data/promises";
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const r = legacyPromiseSchema.safeParse(JSON.parse(readFileSync(`${dir}/${f}`, "utf-8")));
      expect(r.success, f).toBe(true);
    }
  });
});
