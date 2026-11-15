# Linking harness

`tools/link.ts` (`pnpm link-pairs`, `pnpm link` is a pnpm built-in) is step 7 of `docs/riksdag-linking.md`: a judge model reads each candidate promise/document pair and proposes a relevance label (`match`, `partial`, `contradicts`, `no_match`), a document stage (`definitive`, `preparatory`, `background`), a confidence and a reason. Bead `hemsida-4np.5`. It is built like the scoring harness (`docs/scoring-harness.md`) and is model-agnostic: the model is a config field, so a collaborator runs it locally with whatever model and login they have. **Judgements are inputs to the evidence step (step 8 of `docs/riksdag-linking.md`), where Claude writes `evidence[]` and sets verdicts; a judgement alone is never a verdict.**

## Running

```sh
pnpm link-pairs tools/link-configs/eval-v1.json --dry-run     # plan, cache hits, token and cost estimate; calls nothing
pnpm link-pairs tools/link-configs/eval-v1.json --limit 5     # a real judge on the first 5 pairs only (name gets a -limit-5 suffix)
pnpm link-pairs tools/link-configs/eval-v1.json               # full run, resumable; --max-cost <usd>, --concurrency <n>
pnpm link-pairs tools/link-configs/eval-v1.json --judge fake  # offline smoke run with the deterministic fake judge
```

Needs the Riksdag text cache (`tools/out/riksdag-text`, see `docs/cache-sharing.md`); `--text-dir`, `--cache-dir` and `--runs-dir` override the locations. A dry run needs no credentials.

## Judge kinds

- `claude`: the Claude Agent SDK on the local subscription login (`claude login`), `model` is any SDK alias or id (`haiku`, `sonnet`, `claude-haiku-5-5`, ...). No money billed, rate-limited per account. **Refuses to run when `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` is set**, like the claude scorer.
- `api`: the billed Messages API (needs `ANTHROPIC_API_KEY`). The judgement comes back from a forced tool call; the promise is a separate `cache_control` block ahead of the document evidence so many documents against one promise reuse the prompt prefix.
- `fake`: deterministic offline judge (word overlap between promise and evidence; stage from the document type). For tests and smoke runs only.

Add a provider by implementing `Judge` in `tools/lib/link/judge.ts` and registering it in `createJudge`.

## Config fields (`tools/link-configs/*.json`, unknown keys are errors)

- `name`: run name; output goes to `tools/out/link-runs/<name>/`.
- `judge`: `{kind, model}`.
- `template_version` and `instructions`: the system prompt (label and stage definitions from `docs/eval-set.md`). Bump `template_version` whenever `instructions` changes meaning, it is part of every cache key.
- `inputs.promises`: `{term, id_prefix}` (the manifesto promises are `val2022-`, the Tidö ones `tido-`; the matcher prioritises manifesto promises).
- `inputs.pairs`: `{kind: "eval-pairs", pairs_file}` judges the 51 hand-labelled pairs; `{kind: "candidates", min_relevance?, max_per_promise?, pairs_file?}` judges documents in `src/data/<term>/riksdag-candidates/` (keyword hits plus score hits from `link-scores.ts`), best first, optionally only those the scoring run rated at least `min_relevance`; `pairs_file` supplies hand labels for the report.
- `evidence`: `max_tokens` and `chars_per_token` cap the tier-1 text per document; optional `briefs_dir` appends the eval brief's passages for pairs that have one.
- `thresholds`: `accept_labels` and `min_confidence`; judgements that pass are flagged `proposed` in `results.json`.
- `budget`: `max_cost_usd` (hard guard, also `--max-cost`) and `usd_per_million_tokens` for the estimate.

## Evidence and cache keys

The judge sees the promise (title and description) and the document's **tier-1 text** from `tools/lib/riksdag-tier1.ts` (dir in full; bet decision outcome and the committee's own sections; sammanfattning and förslag of sou/ds/prop), preceded by a header (type, title, id, outcome), cut to `evidence.max_tokens`. It is not the whole document.

Cache key: sha256 of judge kind, model, `template_version`, the hash of `instructions`, promise title and text, and the hash of the evidence text. Pair ids are not in it, so identical inputs share an entry across runs and people; a changed model, template version, promise text or document text never reuses one. Entries live in `tools/out/link-cache/<key>.json` (gitignored). Re-running resumes: only requests without an entry are sent; a transient error (429, 529, 5xx, or the Agent SDK's `error_max_turns`) skips that request and the run goes on (`skipped_count` in the manifest, re-run to retry), any other failure stops the run and everything finished stays cached; spend is the cost the judge reports (Agent SDK `costUSD`) where there is one, else all tokens at the flat price; the budget guard stops before the estimated spend would pass the cap.

## Output

`tools/out/link-runs/<name>/`: `manifest.json` (config, status, counts, tokens, cost), `results.json` (judgement per pair, `proposed` flag) and, when the pairs carry hand labels and the run is complete, `report.json`: the **agreement report** against the hand labels, which is how a model is chosen. It lists exact label agreement, relevance precision and recall (match and partial against no_match; contradicts is left out), the confusion matrix, stage agreement where a hand stage exists, how the thresholds' proposals line up with the hand labels, and every disagreement. The blind baselines in `src/data/2022-2026/eval/model-labels.json` (Haiku exact 30/51, 31/33 relevant found, 1 FP) are the numbers to compare with.

## Sharing results

`link-cache` is a third cache name of `tools/cache-archive.ts` (`pack link-cache --delta --publish`, `fetch link-cache`), with a manifest coverage listing the linking runs (judge kind, model, template version). See `docs/cache-sharing.md`. Do not publish a cache without the owner's say-so.
