# Prompt: backfill one scoring slice

Paste the block below into Claude Code, started in a fresh clone of this repository. Replace `SHARD` (for example `2/20`) and `MODEL` (for example `claude-haiku-5-5`) with the values the maintainer gave you. Runbook it follows: `docs/backfill.md`.

```text
You are helping backfill Riksdag scoring for this repository. Read docs/backfill.md first and follow it for the steps below. My slice is shard SHARD and the scorer model is MODEL.

Hard rules:
- Never set, export or print ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN. If either is set in the environment, stop and tell me; do not work around it.
- Never edit verdicts, evidence or anything under src/data/. Never commit or add anything under tools/out/. Do not commit, push, open PRs or merge. Do not run `pack ... --publish` or `publish` (uploading is my decision).
- Run only the commands listed here. Do not retry in a loop. If a command fails or hits a rate limit, usage limit or budget stop, stop and report the exact error and what is already cached; do not rerun it automatically.

Steps:
1. Check prerequisites: node --version (24), pnpm, gh --version (2.4.0 or newer), tar and zstd on PATH, `gh auth status`, and that the Claude login works. Report anything missing and stop.
2. pnpm install, then (cd tools && pnpm install).
3. node --experimental-strip-types tools/cache-archive.ts list, then fetch riksdag-text and fetch score-cache. If tools/out/riksdag-store/2022-2026.json is missing, run node --experimental-strip-types tools/ingest-riksdag.ts.
4. Create tools/score-configs/tido-corpus-claude-v1.json exactly as docs/backfill.md section 2 describes, with model MODEL.
5. Dry run: pnpm score tools/score-configs/tido-corpus-claude-v1.json --shard SHARD --dry-run. Show me the number of documents, requests, cached requests and the estimate. If the uncached request count is above about 1,500, tell me and wait; at roughly 45 seconds per request per concurrency slot that is many hours.
6. Only after I say go, with CAP set from the dry-run estimate times 2-3 headroom (the estimate counts only prompt tokens, so real spend runs higher) (the cap is per run, not cumulative): pnpm score tools/score-configs/tido-corpus-claude-v1.json --shard SHARD --concurrency 4 --max-cost CAP. On any rate-limit, usage-limit or budget stop, stop and report; do not restart it on your own, since each run gets a fresh budget (a restart would spend another full cap).
7. When the run finishes (or I tell you to stop), run: node --experimental-strip-types tools/cache-archive.ts pack score-cache --delta (no --publish). Report the directory it wrote under tools/out/cache-archives/, the file names, sizes and the manifest's entry count.
8. Run git status and confirm nothing is modified except the new untracked config file. Final report: shard, requests sent vs cached, failures, archive directory, and my next step (send the two files in that directory to the maintainer, or publish if I have write access).
```
