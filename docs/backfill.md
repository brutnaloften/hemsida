# Backfill runbook: score a slice, link, share

Bead `hemsida-4np.20`. For someone who helps backfill the Riksdag evidence on their own machine and their own Claude subscription (the `claude` scorer and judge are rate-limited per login, so several people each taking a slice is the way to parallelise). Background: `docs/riksdag-linking.md` (the pipeline), `docs/scoring-harness.md`, `docs/link-harness.md`, `docs/cache-sharing.md`. A copy-paste prompt that runs these steps with safe defaults is in `docs/prompts/backfill-slice.md`.

**Ground rules**

- Tools produce caches and candidate files. **A helper who only scores a slice does not set a verdict or `evidence[]`**; the maintainer's Claude session does that in step 8 of `docs/riksdag-linking.md` (`docs/data-model.md`).
- Never set `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN`. The `claude` scorer and judge refuse to run with either set (it would bill a console key instead of the subscription); `unset` them in the shell if they are exported.
- Never `git add tools/out/`; it is gitignored and stays that way.
- Nothing is uploaded unless you run `pack ... --publish` or `publish`.

## Who needs what

| Role                                                   | Needs                                                                                                                                                                                                                                                            |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Helper who scores a slice and hands it over            | Clone the repo and a `gh` login (to `fetch` release archives). No write access.                                                                                                                                                                                  |
| Publisher of a `score-cache` or `link-cache` delta     | **Write access to the repository**: creating a GitHub Release needs it. Without it, run `pack` (no `--publish`) and send the directory `tools/out/cache-archives/<tag>/` (the `.tar.zst` and `cache-manifest.json`) to the maintainer, who runs `publish <dir>`. |
| Candidate PRs (`link-scores.ts` writes to `src/data/`) | A fork or branch, as for any PR; data changes are normal reviewed PRs.                                                                                                                                                                                           |

## Prerequisites

- Node 24 (what CI uses; the tools run with `--experimental-strip-types`), pnpm (version pinned in `package.json`, via corepack) and `git`.
- `gh` logged in (`gh auth login`). The cache tool was written against **gh 2.4.0, the minimum**: it uses `gh api --paginate`, `gh release download --pattern ... --dir` and `gh release create`. Newer versions work too. Check with `gh --version`.
- `tar` and `zstd` on the PATH.
- Fetch caches only with `tools/cache-archive.ts` from a checkout that includes the fix for non-ASCII (for example `ö`) file names in `riksdag-text` archives; pull `main` before step 1.
- Claude Code installed and logged in with the subscription (`claude login`). Check that `echo "${ANTHROPIC_API_KEY:+set}"` prints nothing.
- About 3 GB of disk (the text cache is 2.5 GB unpacked).

## 1. Setup

```sh
git clone <repo-url> && cd hemsida
pnpm install
(cd tools && pnpm install)            # tools/ is its own package; pnpm test also needs it
node --experimental-strip-types tools/cache-archive.ts list
node --experimental-strip-types tools/cache-archive.ts fetch riksdag-text
node --experimental-strip-types tools/cache-archive.ts fetch score-cache
node --experimental-strip-types tools/cache-archive.ts fetch link-cache    # only if a link-cache snapshot is listed
```

`fetch` verifies size, sha256 and file list, never overwrites existing files and follows delta chains. `--tag <tag>` picks an older snapshot, `--repo owner/name` another repository.

The scoring plan for `cache` documents also needs the document metadata store `tools/out/riksdag-store/2022-2026.json`, which is **not** in any archive. Build it (a few dozen requests at 1 per second, no credentials):

```sh
node --experimental-strip-types tools/ingest-riksdag.ts
```

If the text cache lacks documents (the `list` output shows the coverage watermark `documentsTo`), `node --experimental-strip-types tools/fetch-riksdag-text.ts` fetches only the missing ones at 1 request per second; prefer the snapshot.

## 2. Choose the configs

Committed configs: `tools/score-configs/tido-corpus-v1.json` (whole cached corpus x the 274 Tidö promises, scorer `jev`) and `tools/link-configs/eval-v1.json` (judge `claude`, the 51 eval pairs). Cache keys contain scorer kind, model, template version and text, **not the run name**, so a differently named copy shares cache with anyone using the same settings. Use the model the maintainer names, otherwise your results do not merge with theirs.

Scorer kinds: `jev` needs a `JEV_TOKEN` (from the maintainer; about $48 for the whole corpus; fast). `claude` runs on your subscription, is slow (about 45 s per request per concurrency slot) and is limited by your rate-limit window; its dollar figures are nominal, so size a run by its request count. For a subscription run, make a local copy of the corpus config that changes only the scorer:

```sh
node -e '
const fs = require("fs");
const c = JSON.parse(fs.readFileSync("tools/score-configs/tido-corpus-v1.json", "utf8"));
c.name = "tido-corpus-claude-v1";
c.scorer = { kind: "claude", model: "claude-haiku-5-5" };
c.budget = { max_cost_usd: 10, usd_per_million_tokens: 0.3 }; // nominal; set the real cap with --max-cost
fs.writeFileSync("tools/score-configs/tido-corpus-claude-v1.json", JSON.stringify(c, null, 2) + "\n");'
```

For linking (maintainer, after step 4), copy `tools/link-configs/eval-v1.json` the same way and set `inputs.pairs` to `{ "kind": "candidates", "min_relevance": 0.5, "max_per_promise": 5 }` and `inputs.promises.id_prefix` to `tido-`, and give it a new `name` (it names the output directory under `tools/out/link-runs/`) (fields: `docs/link-harness.md`). Candidate-mode linking is not part of a helper's slice.

## 3. Score a slice

Always dry-run first (no network, no login):

```sh
pnpm score tools/score-configs/tido-corpus-claude-v1.json --shard 2/20 --dry-run
```

It prints the documents in the shard, requests, how many are already cached and the estimated cost; only uncached requests are sent. Shards are `i/n` (1-based) and disjoint: a document's shard depends only on its id, so the maintainer can hand `1/20` to `20/20` to as many people as there are slices with no overlap and no coordination. Then the real run:

```sh
pnpm score tools/score-configs/tido-corpus-claude-v1.json --shard 2/20 --concurrency 4
```

- Output goes to `tools/out/runs/<name>-shard-2-of-20/`; results land in `tools/out/score-cache/`. Set `--max-cost <usd>` from the dry-run estimate times 2-3 headroom (the estimate counts only prompt tokens, so real spend runs higher) (the config cap of 10 is only a default).
- **Interrupted or stopped runs resume**: run the same command again; finished requests are cache hits. **The budget cap is per run**, not cumulative (spend restarts at 0 each run), so every restart gets a fresh cap. A `budget_exceeded` stop (exit 1) means the estimate was too low: report it to the maintainer instead of restarting in a loop.
- **Rate limits**: if requests fail with rate-limit or usage-limit errors, stop; do not loop. The window is per account and more concurrency does not help. Wait for the reset and re-run the same command. Partial progress is fine, the delta in step 5 contains what is done.
- An unsharded whole-corpus run holds every document in memory (the `score` script sets a 12 GB heap, so it needs a machine with that much free RAM); use shards.

## 4. Link scores to candidates (maintainer)

`tools/link-scores.ts` reads one run's `results.json` and refuses an incomplete run, so a shard run alone is not enough. To link the whole corpus: `fetch score-cache` (everyone's deltas), run the **unsharded** config (needs a machine with room for the 12 GB heap) with `--dry-run` (the uncached request count must be 0, so the real run costs nothing), run it for real to produce `results.json`, then:

```sh
node --experimental-strip-types tools/link-scores.ts --run tido-corpus-claude-v1 --dry-run
node --experimental-strip-types tools/link-scores.ts --run tido-corpus-claude-v1
```

This appends score hits (defaults `--threshold 0.55 --top-k 10`) to `src/data/2022-2026/riksdag-candidates/*.json` and writes `link-report.json` under the run directory (recall against the keyword candidates; details in `docs/riksdag-linking.md`, step 5b). A helper who only scored a slice stops at step 5.

## 5. Share the result

```sh
node --experimental-strip-types tools/cache-archive.ts pack score-cache --delta
ls tools/out/cache-archives/*/
node --experimental-strip-types tools/cache-archive.ts pack score-cache --delta --publish   # publisher only
```

`pack --delta` archives only what the newest published snapshot lacks and writes `tools/out/cache-archives/<tag>/`; nothing is uploaded without `--publish`. With write access, `... publish tools/out/cache-archives/<tag>` uploads a directory you have checked; without it, send the two files in it to the maintainer. The same applies to `link-cache` after linking runs. Do not publish without the maintainer's say-so. Several people publishing deltas on the same day is fine (tags get `-2`, `-3`).

## What to commit and what not

- Commit (normal PR, one per change): `src/data/2022-2026/riksdag-candidates/*.json` after step 4, and a new config under `tools/score-configs/` or `tools/link-configs/` if the maintainer wants it kept.
- Never commit anything in `tools/out/` (caches, runs, store), `.env` or tokens. Do not edit `src/data/**/promises/` (verdicts, evidence), `rejected-candidates.json` or the eval set.
- A helper who only scores a slice commits nothing; the new config file stays untracked.

## Troubleshooting

- `ANTHROPIC_API_KEY ... is set`: `unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN`, then re-run.
- Missing store file: run `tools/ingest-riksdag.ts` (step 1).
- `fetch` refuses an archive (size, hash or file-list mismatch): re-run once and report it if it repeats.
- Out of memory: use a shard (a larger `n` means smaller slices).
