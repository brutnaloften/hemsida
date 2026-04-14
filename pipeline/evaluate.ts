/**
 * Step 4: Evaluate status changes for matched promises.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { loggedCreate } from "./log.ts";
import {
  type Extraction,
  type Match,
  type Update,
  loadJson,
  validateMatches,
  validateUpdates,
  writeJson,
} from "./schemas.ts";

const PROMPT = readFileSync(new URL("prompts/evaluate.txt", import.meta.url), "utf-8");
const PROMISES_DIR = new URL("../src/data/promises/", import.meta.url).pathname;

function parseJsonArray(text: string): unknown[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]") + 1;
  if (start === -1 || end <= start) return [];
  return JSON.parse(text.slice(start, end));
}

function loadPromise(id: string): Record<string, unknown> | null {
  const path = join(PROMISES_DIR, `${id}.json`);
  if (!existsSync(path)) {
    console.error(`Warning: promise file not found: ${path}`);
    return null;
  }
  return JSON.parse(readFileSync(path, "utf-8"));
}

async function evaluate(
  matches: Match[],
  extracted: Extraction[],
  dryRun: boolean,
): Promise<Update[]> {
  const updatesToEvaluate = matches.filter((m) => m.type === "update" && m.existing_promise_id);

  if (updatesToEvaluate.length === 0) return [];

  if (dryRun) {
    console.error("DRY RUN: would call Claude API for evaluation");
    return [
      {
        promise_id: updatesToEvaluate[0].existing_promise_id!,
        new_status: "Pågående",
        reasoning: "Dry run — no evaluation performed",
        sources: [],
        confidence: "medium",
      },
    ];
  }

  const client = new Anthropic();
  const allUpdates: Update[] = [];

  for (const match of updatesToEvaluate) {
    const promise = loadPromise(match.existing_promise_id!);
    if (!promise) continue;

    const idx = match.extracted_index;
    if (idx >= extracted.length) continue;
    const evidence = extracted[idx];

    const context = JSON.stringify(
      {
        existing_promise: {
          id: promise.id,
          name: promise.name,
          description: promise.description,
          party: promise.party,
          status: promise.status,
          date: promise.date,
        },
        new_evidence: {
          promise_text: evidence.promise_text,
          direct_quote: evidence.direct_quote,
          date: evidence.date,
          source_url: evidence.source_url,
          confidence: evidence.confidence,
        },
      },
      null,
      2,
    );

    const response = await loggedCreate(client, `evaluate: ${promise.id}`, {
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `${PROMPT}\n\n${context}`,
        },
      ],
    });

    for (const block of response.content) {
      if (block.type === "text") {
        allUpdates.push(...(parseJsonArray(block.text) as Update[]));
        break;
      }
    }
  }

  return allUpdates;
}

const { values, positionals } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    output: { type: "string", short: "o", default: "updates.json" },
  },
  allowPositionals: true,
});

if (positionals.length < 2) {
  console.error("Usage: evaluate.ts <matches.json> <extracted.json> [-o output.json] [--dry-run]");
  process.exit(1);
}

const matches = validateMatches(loadJson(positionals[0]) as unknown[]);
const extracted = loadJson(positionals[1]) as Extraction[];
const updates = validateUpdates(await evaluate(matches, extracted, values["dry-run"]!));

writeJson(values.output!, updates);
console.error(`Evaluated ${updates.length} updates, written to ${values.output}`);
