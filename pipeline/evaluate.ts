/**
 * Step 4: Evaluate status changes for matched promises.
 *
 * Like extract.ts, this stage is per-item and resilient to transient API
 * errors: it saves after every evaluation and resumes from a side-car
 * cursor, so hitting the TPM ceiling mid-run doesn't cost the work
 * already done.
 */

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { MODEL, createClient, isTransientApiError, loggedCreate } from "./log.ts";
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

// --- Resume support (same shape as extract.ts) --------------------------

function loadProcessedIds(path: string): Set<string> {
  if (!existsSync(path)) return new Set();
  const ids = readFileSync(path, "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return new Set(ids);
}

function markProcessed(path: string, id: string): void {
  appendFileSync(path, id + "\n");
}

// --- Main ---------------------------------------------------------------

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

const outputPath = values.output!;
const processedPath = `${outputPath}.processed`;
const dryRun = values["dry-run"]!;

const matches = validateMatches(loadJson(positionals[0]) as unknown[]);
const extracted = loadJson(positionals[1]) as Extraction[];

const updatesToEvaluate = matches.filter(
  (m) => m.type === "update" && m.existing_promise_id,
);

if (updatesToEvaluate.length === 0) {
  writeJson(outputPath, []);
  console.error(`Evaluated 0 updates, written to ${outputPath}`);
  process.exit(0);
}

if (dryRun) {
  const stub: Update[] = [
    {
      promise_id: updatesToEvaluate[0].existing_promise_id!,
      new_status: "Pågående",
      reasoning: "Dry run — no evaluation performed",
      sources: [],
      confidence: "medium",
    },
  ];
  writeJson(outputPath, validateUpdates(stub));
  console.error(`DRY RUN: wrote ${stub.length} stub update(s) to ${outputPath}`);
  process.exit(0);
}

const client = createClient();

// Resume: carry forward any prior updates and the processed-ID cursor.
const existing: Update[] = existsSync(outputPath)
  ? validateUpdates(loadJson(outputPath) as unknown[])
  : [];
const processedIds = loadProcessedIds(processedPath);
if (existing.length || processedIds.size) {
  console.error(
    `Resume: ${existing.length} updates loaded, ${processedIds.size} promise IDs already attempted`,
  );
}

const allUpdates: Update[] = [...existing];
let skippedTransient = 0;

for (const match of updatesToEvaluate) {
  const promiseId = match.existing_promise_id!;

  if (processedIds.has(promiseId)) {
    console.error(`Skip (already processed): ${promiseId}`);
    continue;
  }

  const promise = loadPromise(promiseId);
  if (!promise) {
    markProcessed(processedPath, promiseId);
    processedIds.add(promiseId);
    continue;
  }

  const idx = match.extracted_index;
  if (idx >= extracted.length) {
    console.error(`Warning: extracted_index ${idx} out of range; skipping ${promiseId}`);
    markProcessed(processedPath, promiseId);
    processedIds.add(promiseId);
    continue;
  }
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

  let response;
  try {
    response = await loggedCreate(client, `evaluate: ${promiseId}`, {
      model: MODEL,
      max_tokens: 2048,
      messages: [{ role: "user", content: `${PROMPT}\n\n${context}` }],
    });
  } catch (err) {
    if (isTransientApiError(err)) {
      console.error(`Transient error on ${promiseId}; skipping this promise.`);
      skippedTransient++;
      continue;
    }
    throw err;
  }

  for (const block of response.content) {
    if (block.type === "text") {
      const parsed = validateUpdates(parseJsonArray(block.text));
      allUpdates.push(...parsed);
      break;
    }
  }

  writeJson(outputPath, allUpdates);
  markProcessed(processedPath, promiseId);
  processedIds.add(promiseId);
}

console.error(
  `Evaluated ${allUpdates.length} updates (skipped ${skippedTransient} transient-error items), written to ${outputPath}`,
);
