#!/usr/bin/env node
// PreToolUse hook: block `gh pr merge` unless the PR has a code-reviewer
// approval comment, posted by the authenticated gh user, for its current
// head commit.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// `gh pr merge` flags that take a value; every other flag is boolean.
const VALUE_FLAGS = new Set([
  "-R",
  "--repo",
  "-t",
  "--subject",
  "-b",
  "--body",
  "-F",
  "--body-file",
  "-A",
  "--author-email",
  "--match-head-commit",
]);

const command = JSON.parse(readFileSync(0, "utf8")).tool_input?.command ?? "";
// Drop heredoc bodies and quoted strings so commit messages and PR bodies
// that mention the command don't trigger it, then match in command position,
// allowing `VAR=x`, `env` and `command` prefixes and a path to gh.
const code = command
  .replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2(?=\n|$)/g, "")
  .replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, "''")
  .replace(/\\\n/g, " ");
const match = code.match(
  /(?:^|[;&|(`]|\n)\s*(?:(?:\w+=\S*|env|command)\s+)*(?:\S*\/)?gh\s+pr\s+merge(?=\s|$)([^;&|\n)`]*)/,
);
if (!match) process.exit(0);

let pr;
let repo = match[0].match(/GH_REPO=(\S+)/)?.[1];
const tokens = match[1].split(/\s+/).filter(Boolean);
for (let i = 0; i < tokens.length; i++) {
  const token = tokens[i];
  if (/^\d*[<>]/.test(token)) break; // redirection
  if (token === "-h" || token === "--help") process.exit(0);
  const [flag, inline] = token.split(/=(.*)/s);
  if (VALUE_FLAGS.has(flag)) {
    const value = inline ?? tokens[++i];
    if (flag === "-R" || flag === "--repo") repo = value;
  } else if (!token.startsWith("-")) {
    pr ??= token;
  }
}

function block(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8" });
}

let view;
let viewer;
try {
  const args = ["pr", "view", ...(pr ? [pr] : []), ...(repo ? ["--repo", repo] : [])];
  view = JSON.parse(gh([...args, "--json", "number,commits,comments"]));
  viewer = gh(["api", "user", "--jq", ".login"]).trim();
} catch (error) {
  block(`require-code-review: could not look up the PR: ${error.message}`);
}

const head = view.commits.at(-1)?.oid;
// Only the authenticated user's comments count: anyone can comment on a
// public PR.
const reviews = view.comments
  .filter((comment) => comment.author?.login === viewer)
  .map((comment) => comment.body.split("\n")[0].trim())
  .filter((line) => line.startsWith("CODE REVIEW:"));
const latest = reviews.at(-1);

if (latest === `CODE REVIEW: APPROVED ${head}`) process.exit(0);

block(
  [
    `Merge blocked: PR #${view.number} has no code-reviewer approval from ${viewer} for head ${head}.`,
    latest && `Latest review: ${latest}`,
    "Run the code-reviewer subagent on this PR, fix any findings, and merge once it approves the current head.",
  ]
    .filter(Boolean)
    .join("\n"),
);
