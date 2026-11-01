---
name: refresh-data
description: Take a stale dataset (a data-stale GitHub issue or a dataset name like budget, macro, riksdag-2022-2026) to one reviewable data PR - run the ingest tool, summarise the diff, run the gates, open the PR that closes the issue. Use when the user says refresh-data, "refresh the budget data", or a data-stale issue needs handling.
---

# refresh-data

Turn one stale dataset into one data PR. Argument: a dataset id (`budget`, `macro`, `riksdag-2022-2026`) or a `data-stale` issue number. Data changes are reviewable by design: nothing is pushed to `main`, and nothing is merged here unless auto-run mode allows it.

## 1. Resolve the dataset and issue

- Issue number given: `gh issue view <n> --json title,body,labels`. The body starts with a marker `<!-- data-stale:<id> -->`; `<id>` is the dataset. Stop if the label is not `data-stale` or the issue is closed.
- Dataset id given: find its open issue with `gh issue list --label data-stale --state open --json number,title,body` (match the marker or the title `Stale dataset: <id>`). No issue is fine; the PR then closes nothing.
- Confirm it is really stale: `node --experimental-strip-types tools/check-freshness.ts` (exit 1 means stale; the line for `<id>` gives the reason). If the dataset is fresh, say so and stop. Rules live in `tools/lib/freshness-check.ts`.
- Check no PR for it is already open: `gh pr list --search "<id> in:title,body" --state open`.

## 2. Branch

From latest main, never on `main`: `git fetch origin`, then `git checkout -b chore/data-<id>-<yyyy-mm> origin/main`. Run `pnpm install` (root and `tools/`) in a fresh worktree.

## 3. Run the ingest tool

Run exactly the tool for the dataset. Requests are sequential and cached; do not parallelise and do not hammer a failing source (stop and report instead).

| Dataset             | Command                                                                    | Writes                                                                       |
| ------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `budget`            | `node --experimental-strip-types tools/ingest-budget.ts`                   | `src/data/budget/{meta,expenditure,revenue}.json`, `src/data/freshness.json` |
| `macro`             | `node --experimental-strip-types tools/ingest-macro.ts`                    | `src/data/budget/macro.json`, `src/data/freshness.json`                      |
| `riksdag-2022-2026` | `node --experimental-strip-types tools/ingest-riksdag.ts --term 2022-2026` | gitignored `tools/out/riksdag-store/`, `src/data/freshness.json`             |

Every ingest tool records `fetchedAt` and `latestPeriod` in `src/data/freshness.json`. If one fails, do not hand-edit data; report the error.

## 4. Summarise the diff

`git status` and `git diff --stat`, then read the real diff of the data files and put the summary in the PR body:

- **New periods:** new years/months in `latestPeriod` and new rows (new anslag, new titles).
- **Restated values:** existing periods whose numbers changed. For budget, restatement of earlier years is normal (anslag are restated across releases); a changed total for a past year needs an explanation or a flag, not silent acceptance.
- **Status changes:** preliminary to final (budget revenue status is configuration, see below).
- **Schema or shape changes:** new/removed keys, changed types, a different row count with no matching new period. Treat these as suspicious; the schemas in `src/schema/` should reject most, but check.
- **Only `freshness.json` changed:** upstream data was unchanged. If `latestPeriod` did not advance and `check-freshness.ts` still reports the dataset stale, the upstream release is not out yet: do not open a PR; comment on the issue and stop.

For `riksdag-2022-2026` the store is gitignored, so the committed diff is only the manifest; say what the run fetched (counts per doktyp from the tool output).

## 5. Dataset gotchas (check before committing)

Full background: `docs/budget-data.md` (Gotchas, Refresh).

**budget (ESV/Statskontoret)**

- The tool scrapes the listing page and picks the newest zip per type. Verify the files and status in the output match the release you expect; the annual endpoint silently returns the wrong file for monthly URLs (the tool validates headers; do not bypass).
- Anslag codes are only unique within one release, so everything is regenerated from one release of each file. Never merge old and new rows.
- Discontinued anslag carry a space-and-year suffix (`0501003 2024`); a plain and a suffixed code are different anslag.
- Revenue finality is configuration: when ESV publishes a definitive revenue file, raise `--revenue-final-through` (default `DEFAULT_REVENUE_FINAL_THROUGH` in `tools/lib/budget-ingest.ts`) in the same PR.
- Empty is not zero: `null` cells stay `null`.
- `meta.json` keeps the previous `fetched` date when the CSV sha256 is unchanged; a no-op rerun must give no data diff.
- After the run `pnpm test` must pass; `src/lib/budget/data.test.ts` checks the 2024 totals against the reconciliation (saldo about -104.27 mdkr).
- Zip entry names are CP437-garbled; the tool opens the single entry. Never match by name.

**macro (SCB PxWebApi v2)**

- KPI and GDP: GDP lags KPI by about a year, so a GDP latest period one year behind is expected, not a failure.
- Preliminary GDP is revised later: small changes to the latest GDP years are normal; large changes to old years are suspicious.
- Two sequential requests, well inside SCB's 30 calls per 10 seconds; never loop retries.

**riksdag-2022-2026 (data.riksdagen.se)**

- Incremental: fetches documents after the per-type cursor minus a lookback; interrupted runs resume from the cursor. Requests are 1 per second.
- The 2022-2026 term is treated as closed by one fetch on or after 2026-10-31; after that the dataset is final and not stale again.
- Fetching does not edit promise files. Matching (`match-riksdag-candidates.ts`) and any evidence or verdict change are separate PRs, one per change.

## 6. Gates

`pnpm build`, `pnpm fmt:check` (run `pnpm fmt` if only formatting fails), `pnpm test`, `pnpm typecheck`. If a data schema test fails, the data is wrong or the schema needs a deliberate change, not a workaround.

## 7. PR

Commit with Conventional Commits: `chore(data): refresh <id> (<latestPeriod>)`. `tools/lib/pr.ts` (`openPrPerChange`) is the helper for one branch, commit and PR per change when scripting several; for a single dataset plain `git push -u origin <branch>` and `gh pr create` are enough.

PR body: `Closes #<n>` when there is an issue, what ran (command, source files/releases used), the diff summary from step 4, and gate results. No Claude attribution line or session link. Then wait for CI and fix failures.

The weekly `sync-freshness-issues.ts` run also closes the issue once the manifest is fresh; `Closes #<n>` just makes it immediate on merge.

Do not merge unless auto-run mode applies (squash-merge once CI is green and `code-reviewer` is clean). Report the PR URL.

## Rules

- One dataset per PR; one data change, one PR.
- Never hand-edit generated data files; fix the tool instead (separate bead).
- Never push to `main`. Never skip a failing validation.
- A new gotcha belongs in this file and `docs/budget-data.md`.
