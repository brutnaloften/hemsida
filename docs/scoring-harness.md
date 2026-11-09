# Scoring harness

`pnpm score <config>` runs a promise x document scoring pass (the Jev spike, `docs/jev-spike.md`) from a committed config. Runs are reproducible (the plan is a pure function of config and inputs), resumable (results are cached per request) and budget-guarded. Code: `tools/score.ts` and `tools/lib/score/`.

## Running

```bash
pnpm score tools/score-configs/tido-eval-v1.json --dry-run   # always first: no network, no token needed
pnpm score tools/score-configs/tido-eval-v1.json             # real run (needs JEV_TOKEN, loaded from .env)
pnpm score tools/score-configs/tido-eval-v1.json --scorer fake   # offline smoke run (separate cache keys and run name)
```

Options: `--shard i/n` scores only documents whose `sha256(document id)` mod n equals i-1 (1-based i), so several people or accounts take disjoint slices and merge them as `score-cache` deltas (the run lands in `tools/out/runs/<name>-shard-i-of-n/`; shard membership depends only on the id, not on the other documents), `--store-file` (the Riksdag store used by `cache` documents, default `tools/out/riksdag-store/<term>.json`), `--max-cost <usd>` overrides the config cap, `--concurrency <n>` (default 4), `--cache-dir`, `--runs-dir`, `--text-dir` (the cached Riksdag text, default `tools/out/riksdag-text`).

The dry run prints the plan (documents, chunks, batches per chunk, requests), how many requests are already cached, and the estimated input tokens and cost of what is still to send. Nothing is sent.

## Config fields (`tools/score-configs/*.json`, unknown keys are errors)

- `name`: run name; output goes to `tools/out/runs/<name>/`.
- `scorer`: `{ kind: "jev" | "claude" | "fake", model }`. `claude` runs through a local `claude login` (Pro/Max subscription) via the Claude Agent SDK instead of a billed API key — unset `ANTHROPIC_API_KEY` or it refuses to run (that would silently bill the console key instead of the subscription). `model` is any Agent SDK model alias or id (`"haiku"`, `"claude-haiku-5-5"`, ...); pin a full id in committed configs, since the model string is part of every cache key and an alias silently changes meaning when it moves to a newer model. CI only runs `jev`/`fake`: `claude` needs an interactive subscription login and is noticeably slower and more token-hungry per request (Haiku burns several thousand "thinking" tokens per request even with `thinking: {type: 'disabled'}` in the request — that option doesn't currently seem to take effect through the Agent SDK). See `tools/score-configs/haiku-eval-v1.json`.
- `question`: `template_version` (bump when the wording changes) and `template` with `{title}` and `{text}`.
- `inputs.promises`: `term` and `id_prefix` (e.g. `tido-`; empty = all promises of the term).
- `inputs.documents`: `{ kind: "eval-pairs", pairs_file }` (the distinct documents of an eval pairs file, whose labels feed the report) or `{ kind: "ids", ids, pairs_file? }`, or `{ kind: "cache", doktyper?, since?, pairs_file? }`: every document in the riksdag-text cache, titled from the Riksdag store. `doktyper` keeps only those document types and `since` (YYYY-MM-DD) only documents dated on or after it (incremental runs, e.g. from the riksdag-text watermark in `cache-manifest.json`); documents missing from the store are dropped when either filter is set. Titles from `pairs_file` win over store titles, because the title is part of the request and the eval requests only stay cached when it matches. `tools/score-configs/tido-corpus-v1.json` is the whole-corpus config: same template v1, scorer and chunking as `tido-eval-v1.json`, so the eval requests are cache hits and the dry run shows only the new ones; its cap is high (about $48 measured for the full corpus, cap $60), so check the dry run estimate first. The store (`tools/out/riksdag-store/<term>.json`) must exist: a missing store file is an error, so run `ingest-riksdag` first. Sharding is applied before any text is read, so a shard run only loads its own slice. An unsharded whole-corpus run holds all 3,547 documents in memory, which overflows the default Node heap; the `score` script therefore sets `--max-old-space-size=12288` (dry run: 25,217 requests, 535 cached, about $52 estimated). Prefer shards on small machines.
- `chunk.max_chars`: documents are split into chunks of at most this many characters, never inside a paragraph.
- `limits`: `max_request_tokens` (62000), `max_state_plus_question_tokens` (32000), `chars_per_token` (2.8, the estimate).
- `budget`: `max_cost_usd` (hard cap) and `usd_per_million_tokens` (0.042).

## Plan and cache keys

Each document is chunked; promises (sorted by id) are packed into question batches so that the largest chunk plus a batch stays under `max_request_tokens`. Batch boundaries are the same for every chunk, so adding a promise that sorts after the others only changes the last batch (a promise that sorts earlier shifts the batches after it, and a larger chunk can change the batch size). One request per (chunk, batch). A request's key is `sha256` of the stable JSON of scorer kind and model, `template_version`, the state (document title and chunk text) and the rendered questions. Change any of them and the key changes; change nothing and the key, and the plan hash, are byte-identical. Results are stored one file per key in `tools/out/score-cache/<key>.json` (gitignored), written atomically. A request whose key exists is never sent again, so a re-run or a resume after an interruption costs nothing for what is done.

If the scorer rejects a request as too long, the runner splits the state in half, asks both halves and keeps the max per question; the result is cached under the original key.

A scorer can throw `SkippableScoreError` for a failure that concerns only that request: the runner skips it and goes on, the run still ends `complete` (exit 0) but with `skipped_count` in the manifest and a `N skipped` note, and a re-run sends the skipped requests again. The `claude` scorer does this for the Agent SDK's `error_max_turns` (it allows 3 turns so the SDK can retry structured output that failed validation; with 1 turn this happened about once per few hundred requests and aborted the run). Rate, usage and every other error still stop the run.

## Budget behaviour

Before each uncached request the runner checks actual spend plus the estimates of requests in flight plus this request's estimate against `max_cost_usd`. If it would exceed the cap the run stops with `budget_exceeded` (exit code 1) and an explanation; everything completed is already cached, so raising the cap (`--max-cost`) and re-running continues where it stopped. Estimates use `chars_per_token`, so check the dry run against the first real token counts in the manifest and adjust.

For the `claude` scorer there's no real per-token bill (it runs on a subscription login), so `max_cost_usd`/`usd_per_million_tokens` act as a nominal safety cap rather than real billing: `input_tokens` is the sum of every category the Agent SDK's `modelUsage` reports (input, output including thinking, cache read, cache write — plain `usage.input_tokens` alone drastically undercounts once prompt caching kicks in), and `usd_per_million_tokens` is a rough blended rate across those categories (Haiku 5.5 list price is $0.10/1M input vs $0.50/1M output, and output — mostly thinking — is a large share of the total here). The pre-run estimate (and the guard that uses it) counts only prompt characters, while the tokens recorded afterwards include output, thinking and cache, so the guard underestimates what a `claude` run really uses: size runs with the dry run's request count and the observed ~45 s per request per concurrency slot, not its dollar figure. Treat the dollar figure as directional; the real constraint running this scorer at scale is the account's rate-limit window, not money.

## Output

`tools/out/runs/<name>/`:

- `manifest.json`: config, plan hash, status, request / cached / sent / remaining / skipped counts, tokens, cost, started and finished timestamps.
- `results.json`: `results[document][promise] = { score, best_chunk }` (max chunk probability).
- `report.json` (when the inputs have labels and every request is done): AUC (match|partial vs no_match), per-label count, mean, min and max, precision and recall at 0.3 to 0.7, the rank of each pair's own promise within its document, lowest positives and highest negatives. The same report is printed.

## Adding a scorer

Implement `Scorer` from `tools/lib/score/scorer.ts` (`score(state, questions)` returns `{ answers, input_tokens }`; throw `TooLongError` to have the runner split the state), register it in `createScorer` and add the kind to the config enum. Tests use the deterministic `fake` scorer; there is no network in any test.

## Sharing results

The score cache (and the Riksdag text it needs) can be shared as release archives with a validated manifest, so a collaborator does not redo finished requests: `docs/cache-sharing.md`. How scoring fits into linking promises to Riksdag documents, with scorer results: `docs/riksdag-linking.md`.
