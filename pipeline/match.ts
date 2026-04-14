/**
 * Step 3: Match extracted promises against existing promise database.
 */

import { readFileSync, readdirSync } from "node:fs";
import { parseArgs } from "node:util";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { loggedCreate } from "./log.ts";
import {
  type Extraction,
  type Match,
  type Promise as PromiseData,
  loadJson,
  validateExtractions,
  validateMatches,
  validatePromise,
  writeJson,
} from "./schemas.ts";

const PROMPT = readFileSync(new URL("prompts/match.txt", import.meta.url), "utf-8");
const PROMISES_DIR = new URL("../src/data/promises/", import.meta.url).pathname;

function parseJsonArray(text: string): unknown[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]") + 1;
  if (start === -1 || end <= start) return [];
  return JSON.parse(text.slice(start, end));
}

function loadExistingPromises(): PromiseData[] {
  const files = readdirSync(PROMISES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  const promises: PromiseData[] = [];
  for (const file of files) {
    const data = JSON.parse(readFileSync(join(PROMISES_DIR, file), "utf-8"));
    if (validatePromise(data)) {
      promises.push(data);
    }
  }
  return promises;
}

async function matchPromises(
  extracted: Extraction[],
  existing: PromiseData[],
  dryRun: boolean,
): Promise<Match[]> {
  if (extracted.length === 0) return [];

  if (dryRun) {
    console.error("DRY RUN: would call Claude API for matching");
    return [
      {
        type: "new",
        existing_promise_id: null,
        extracted_index: 0,
        reasoning: "Dry run — no matching performed",
      },
    ];
  }

  const client = new Anthropic();

  // Build structured context — no raw web content
  const context = JSON.stringify(
    {
      extracted_promises: extracted.map((e, i) => ({
        index: i,
        politician_or_party: e.politician_or_party,
        promise_text: e.promise_text,
        date: e.date,
        confidence: e.confidence,
      })),
      existing_promises: existing.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        party: p.party,
        status: p.status,
      })),
    },
    null,
    2,
  );

  const response = await loggedCreate(client, "match", {
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `${PROMPT}\n\n${context}`,
      },
    ],
  });

  for (const block of response.content) {
    if (block.type === "text") {
      return parseJsonArray(block.text) as Match[];
    }
  }
  return [];
}

const { values, positionals } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    output: { type: "string", short: "o", default: "matches.json" },
  },
  allowPositionals: true,
});

const inputPath = positionals[0];
if (!inputPath) {
  console.error("Usage: match.ts <extracted.json> [-o output.json] [--dry-run]");
  process.exit(1);
}

const extracted = validateExtractions(loadJson(inputPath) as unknown[]);
const existing = loadExistingPromises();
const matches = validateMatches(await matchPromises(extracted, existing, values["dry-run"]!));

writeJson(values.output!, matches);
console.error(`Matched ${matches.length} promises, written to ${values.output}`);
