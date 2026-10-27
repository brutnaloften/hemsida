# Tidöavtalet candidate extraction

One-time script (bead `hemsida-bvb.2`) that turns the Tidöavtalet PDF into **candidate** promises for human review (bead `hemsida-bvb.3`).

```
export ANTHROPIC_API_KEY=...
node --experimental-strip-types tools/extract-tidoavtalet.ts --dry-run   # print the planned requests, no API call
node --experimental-strip-types tools/extract-tidoavtalet.ts             # run for real
```

Options: `--pdf <path>` (default `tools/out/tidoavtalet.pdf`, downloaded from the source's `url`, then its `archive`, if missing), `--pages N` (override the detected page count), `--pages-per-chunk N` (default 8), `--out`, `--cursor`.

- **Model:** `claude-opus-5-5`, effort `high`, structured output (Zod). The whole PDF goes in as a cached document block for each chunk; the prompt restricts extraction to a page range, so page references stay reliable and no PDF library is needed.
- **Output:** `src/data/2022-2026/candidates/tidoavtalet.json`. This is outside the content collection glob (`*/promises/*.json`), so the site never loads it. Each entry is `{ chunk, ministry, promise }` where `promise` already validates against the shared promise schema (verdict `not_started`, empty evidence). The reviewer edits the file, then moves approved promises into `src/data/2022-2026/promises/`. `ministry` is review-only and not part of the schema.
- **Resumable and idempotent:** progress is tracked per page chunk in `tools/out/tidoavtalet.processed` (gitignored; delete it to re-run everything). Re-running a chunk replaces that chunk's entries instead of appending.
- **Logs:** `loggedParse` logs the full request to stderr, with base64 payloads (the PDF) redacted to a length placeholder.
