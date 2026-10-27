/**
 * Open one PR per change.
 *
 * Each change gets its own branch, commit and PR so reviewers can merge or
 * reject them independently. A failure on one PR is logged and the loop
 * continues with the rest.
 */

import { execFileSync } from "node:child_process";

const REPO_ROOT = new URL("../../", import.meta.url).pathname;

export function git(...args: string[]): string {
  // Use execFileSync with an array — no shell, so arbitrary content in
  // args (commit messages, file paths) cannot be interpreted as shell
  // syntax. Don't switch to execSync with string interpolation.
  return execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf-8",
  }).trim();
}

export interface PrSpec<C> {
  /** Branch name for this change; should be unique per run. */
  branch: (change: C) => string;
  /** Write the change to disk and return the paths to commit. */
  apply: (change: C) => string[];
  title: (change: C) => string;
  body: (change: C) => string;
}

export interface PrOptions {
  /** Write files for every change, skip all git/gh operations. */
  dryRun?: boolean;
  /** Abort before doing anything if there are more changes than this. */
  maxChanges?: number;
}

export interface PrSummary {
  succeeded: number;
  failed: number;
}

export function openPrPerChange<C>(
  changes: C[],
  spec: PrSpec<C>,
  { dryRun = false, maxChanges = 100 }: PrOptions = {},
): PrSummary {
  if (changes.length > maxChanges) {
    throw new Error(
      `${changes.length} changes exceeds limit of ${maxChanges}. ` +
        "Review manually or raise maxChanges.",
    );
  }

  if (dryRun) {
    for (const change of changes) spec.apply(change);
    console.error(`DRY RUN: wrote files for ${changes.length} changes, skipping git operations`);
    return { succeeded: 0, failed: 0 };
  }

  const baseBranch = git("rev-parse", "--abbrev-ref", "HEAD");
  const baseSha = git("rev-parse", "HEAD");

  let succeeded = 0;
  let failed = 0;

  for (const [i, change] of changes.entries()) {
    const branch = spec.branch(change);
    try {
      // Start each PR from a clean baseSha — discards any working-tree
      // state from a previous iteration's failure mid-way through.
      git("reset", "--hard", baseSha);
      git("checkout", "-B", branch);
      const paths = spec.apply(change);
      git("add", "--", ...paths);
      git("commit", "-m", spec.title(change));
      git("push", "-u", "origin", branch);
      const pr = execFileSync(
        "gh",
        ["pr", "create", "--title", spec.title(change), "--body", spec.body(change)],
        { cwd: REPO_ROOT, encoding: "utf-8" },
      ).trim();
      console.error(`PR ${i + 1}/${changes.length}: ${pr}`);
      succeeded++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Failed PR for ${branch}: ${msg}`);
      failed++;
    }
  }

  // Restore whatever branch we started on so the caller is left in a tidy state.
  try {
    git("reset", "--hard", baseSha);
    git("checkout", baseBranch);
  } catch {
    // Best-effort cleanup — don't mask the real result.
  }

  console.error(`Summary: ${succeeded} PRs created, ${failed} failed`);
  return { succeeded, failed };
}
