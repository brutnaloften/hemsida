/**
 * Step 5: Write updated promise files and create one PR per change.
 *
 * Each update (status change) and each new promise gets its own branch,
 * commit, and PR so reviewers can merge/reject them independently. A
 * failure on one PR is logged and the loop continues with the rest.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { execFileSync } from "node:child_process";
import {
  type Extraction,
  type Match,
  type Update,
  type Promise as PromiseData,
  loadJson,
  validateMatches,
  validateUpdates,
} from "./schemas.ts";

const PROMISES_DIR = new URL("../src/data/promises/", import.meta.url).pathname;
const REPO_ROOT = new URL("../", import.meta.url).pathname;
const MAX_CHANGES = 100;

function git(...args: string[]): string {
  // Use execFileSync with an array — no shell, so arbitrary content in
  // args (commit messages, file paths) cannot be interpreted as shell
  // syntax. Don't switch to execSync with string interpolation.
  return execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf-8",
  }).trim();
}

type Change =
  | { kind: "update"; promiseId: string; path: string; update: Update }
  | { kind: "new"; promiseId: string; path: string; extraction: Extraction };

function generatePromiseId(e: Extraction): string {
  const partyPrefix = e.politician_or_party
    .split("(")
    .pop()!
    .replace(")", "")
    .trim()
    .toLowerCase()
    .slice(0, 3);
  const slug = e.promise_text
    .slice(0, 50)
    .toLowerCase()
    .replace(/[^a-zåäö0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return `${partyPrefix}-${slug}`;
}

function collectChanges(updates: Update[], matches: Match[], extracted: Extraction[]): Change[] {
  const changes: Change[] = [];
  for (const update of updates) {
    const path = join(PROMISES_DIR, `${update.promise_id}.json`);
    if (!existsSync(path)) {
      console.error(`Warning: promise file not found: ${path}; skipping`);
      continue;
    }
    const existing: PromiseData = JSON.parse(readFileSync(path, "utf-8"));
    if (existing.status === update.new_status) continue;
    changes.push({ kind: "update", promiseId: update.promise_id, path, update });
  }
  for (const match of matches) {
    if (match.type !== "new") continue;
    if (match.extracted_index >= extracted.length) continue;
    const extraction = extracted[match.extracted_index];
    const promiseId = generatePromiseId(extraction);
    const path = join(PROMISES_DIR, `${promiseId}.json`);
    changes.push({ kind: "new", promiseId, path, extraction });
  }
  return changes;
}

function applyChange(change: Change): void {
  const today = new Date().toISOString().slice(0, 10);
  if (change.kind === "update") {
    const promise: PromiseData = JSON.parse(readFileSync(change.path, "utf-8"));
    if (!promise.updates) promise.updates = [];
    promise.updates.push({
      date: today,
      status: change.update.new_status,
      reasoning: change.update.reasoning,
      sources: change.update.sources.map((value) => ({ value, archive: "" })),
      confidence: change.update.confidence,
    });
    promise.status = change.update.new_status;
    writeFileSync(change.path, JSON.stringify(promise, null, 2) + "\n");
  } else {
    const e = change.extraction;
    const promise: PromiseData = {
      id: change.promiseId,
      name: e.promise_text.slice(0, 100),
      description: e.promise_text,
      party: e.politician_or_party,
      status: "Pågående",
      date: e.date,
      sources: [{ value: e.source_url, archive: "" }],
      tags: [],
      updates: [],
    };
    writeFileSync(change.path, JSON.stringify(promise, null, 2) + "\n");
  }
}

function titleFor(change: Change): string {
  if (change.kind === "update") {
    return `Pipeline: ${change.promiseId} → ${change.update.new_status}`;
  }
  const text = change.extraction.promise_text.slice(0, 60);
  return `Pipeline: nytt löfte — ${change.extraction.politician_or_party}: ${text}`;
}

function bodyFor(change: Change): string {
  const lines = ["## Pipeline Update\n"];
  if (change.kind === "update") {
    const u = change.update;
    lines.push(
      `Status change for **${change.promiseId}**: → ${u.new_status} (${u.confidence} confidence)\n`,
    );
    lines.push(`### Reasoning`);
    lines.push(u.reasoning);
    lines.push("");
    if (u.sources.length > 0) {
      lines.push(`### Sources`);
      for (const src of u.sources) lines.push(`- ${src}`);
      lines.push("");
    }
  } else {
    const e = change.extraction;
    lines.push(`New promise from **${e.politician_or_party}** (${e.confidence} confidence)\n`);
    lines.push(`### Promise`);
    lines.push(e.promise_text);
    lines.push("");
    if (e.direct_quote) {
      lines.push(`### Direct quote`);
      lines.push(`> ${e.direct_quote}`);
      lines.push("");
    }
    lines.push(`### Source`);
    lines.push(`- ${e.source_url} (${e.date})`);
    lines.push("");
  }
  lines.push("---");
  lines.push("*Generated by the Brutna Löften AI pipeline. Please review carefully.*");
  return lines.join("\n");
}

// --- Main ---

const { values } = parseArgs({
  options: {
    updates: { type: "string", default: "updates.json" },
    matches: { type: "string", default: "matches.json" },
    extracted: { type: "string", default: "extracted.json" },
    "dry-run": { type: "boolean", default: false },
    "max-changes": { type: "string", default: String(MAX_CHANGES) },
  },
});

const maxChanges = parseInt(values["max-changes"]!, 10);
const updates = existsSync(values.updates!)
  ? validateUpdates(loadJson(values.updates!) as unknown[])
  : [];
const matches = existsSync(values.matches!)
  ? validateMatches(loadJson(values.matches!) as unknown[])
  : [];
const extracted = existsSync(values.extracted!)
  ? (loadJson(values.extracted!) as Extraction[])
  : [];

const changes = collectChanges(updates, matches, extracted);

if (changes.length === 0) {
  console.error("No changes to apply.");
  process.exit(0);
}

if (changes.length > maxChanges) {
  console.error(
    `ABORT: ${changes.length} changes exceeds limit of ${maxChanges}. ` +
      "Review manually or increase --max-changes.",
  );
  process.exit(1);
}

const newCount = changes.filter((c) => c.kind === "new").length;
const updateCount = changes.length - newCount;
console.error(`Preparing ${changes.length} PRs (${updateCount} updates, ${newCount} new)`);

if (values["dry-run"]) {
  for (const change of changes) applyChange(change);
  console.error("DRY RUN: wrote files, skipping git operations");
  process.exit(0);
}

const baseBranch = git("rev-parse", "--abbrev-ref", "HEAD");
const baseSha = git("rev-parse", "HEAD");
const runTimestamp = new Date().toISOString().replace(/[T:]/g, "-").slice(0, 19);

let succeeded = 0;
let failed = 0;

for (const [i, change] of changes.entries()) {
  const branch = `pipeline/${change.promiseId}-${runTimestamp}`;
  try {
    // Start each PR from a clean baseSha — discards any working-tree
    // state from a previous iteration's failure mid-way through.
    git("reset", "--hard", baseSha);
    git("checkout", "-B", branch);
    applyChange(change);
    git("add", change.path);
    git("commit", "-m", titleFor(change));
    git("push", "-u", "origin", branch);
    const pr = execFileSync(
      "gh",
      ["pr", "create", "--title", titleFor(change), "--body", bodyFor(change)],
      { cwd: REPO_ROOT, encoding: "utf-8" },
    ).trim();
    console.error(`PR ${i + 1}/${changes.length}: ${pr}`);
    succeeded++;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Failed PR for ${change.promiseId}: ${msg}`);
    failed++;
  }
}

// Restore whatever branch we started on so the workflow leaves a tidy state.
try {
  git("reset", "--hard", baseSha);
  git("checkout", baseBranch);
} catch {
  // Best-effort cleanup — don't mask the real result.
}

console.error(`\nSummary: ${succeeded} PRs created, ${failed} failed`);
if (succeeded === 0 && failed > 0) process.exit(1);
