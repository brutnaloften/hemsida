#!/usr/bin/env node
// PreToolUse hook: block `gh pr merge` unless the PR has a code-reviewer
// approval comment for its current head commit.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const command = JSON.parse(readFileSync(0, "utf8")).tool_input?.command ?? "";
// Drop heredoc bodies and quoted strings so commit messages and PR bodies
// that mention the command don't trigger it, then match in command position.
const code = command
  .replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2(?=\n|$)/g, "")
  .replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, "''");
const match = code.match(/(?:^|[;&|(]|\n)\s*gh\s+pr\s+merge(?=\s|$)([^;&|\n)]*)/);
if (!match) process.exit(0);

// First non-flag argument after `merge` is the PR (number, URL or branch).
const pr = match[1].split(/\s+/).find((arg) => arg && !arg.startsWith("-"));

function block(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

let view;
try {
  const args = ["pr", "view", ...(pr ? [pr] : []), "--json", "number,commits,comments"];
  view = JSON.parse(execFileSync("gh", args, { encoding: "utf8" }));
} catch (error) {
  block(`require-code-review: could not look up the PR: ${error.message}`);
}

const head = view.commits.at(-1)?.oid;
const reviews = view.comments
  .map((comment) => comment.body.split("\n")[0].trim())
  .filter((line) => line.startsWith("CODE REVIEW:"));
const latest = reviews.at(-1);

if (latest === `CODE REVIEW: APPROVED ${head}`) process.exit(0);

block(
  [
    `Merge blocked: PR #${view.number} has no code-reviewer approval for head ${head}.`,
    latest && `Latest review: ${latest}`,
    "Run the code-reviewer subagent on this PR, fix any findings, and merge once it approves the current head.",
  ]
    .filter(Boolean)
    .join("\n"),
);
