# Sharing local caches

Bead `hemsida-8l0`. Code: `tools/cache-archive.ts` (CLI) and `tools/lib/cache-archive.ts` (manifest schema and pure logic, tested in `cache-archive.test.ts`).

Two caches under `tools/out/` (gitignored) are expensive to rebuild and safe to share:

| Cache          | Directory                | Entries                                  | Size (2026-11-08)                 | Rebuild cost                                                      |
| -------------- | ------------------------ | ---------------------------------------- | --------------------------------- | ----------------------------------------------------------------- |
| `riksdag-text` | `tools/out/riksdag-text` | `<dok_id>.xml`, raw document text        | 3,547 files, 2.5 GB (218 MB zstd) | `tools/fetch-riksdag-text.ts`, 1 request/s, about an hour or more |
| `score-cache`  | `tools/out/score-cache`  | `<sha256>.json`, one per scoring request | 1,070 files, 17 MB (0.4 MB zstd)  | A scoring run: minutes with `jev`, hours with `claude`            |

Snapshots are published as **GitHub Release assets**: a `.tar.zst` archive plus a `cache-manifest.json`, under the tag `cache-<name>-<YYYY-MM-DD>` (`-2`, `-3`, ... for a second snapshot on the same day). A release asset may be at most about 2 GiB, which `riksdag-text` stays far below once compressed. Not git: these are derived, rebuildable files that never need review, and tens of thousands of blobs in history would bloat every clone.

## Commands

```bash
node --experimental-strip-types tools/cache-archive.ts list                          # published snapshots and the newest one's coverage
node --experimental-strip-types tools/cache-archive.ts fetch riksdag-text            # download + verify + unpack into tools/out/riksdag-text
node --experimental-strip-types tools/cache-archive.ts pack riksdag-text --publish   # archive the local cache and upload it
node --experimental-strip-types tools/cache-archive.ts pack score-cache --delta --publish
```

Needs `gh` (logged in; `--repo owner/name` targets another repository), `tar` and `zstd`. `pack` writes `tools/out/cache-archives/<tag>/` first (`publish <dir>` uploads a directory you have checked), so nothing leaves the machine without `--publish` or an explicit `publish`.

- **`fetch`** takes the newest snapshot (or `--tag`), follows the `base` chain, and for each snapshot checks the archive's size and sha256 and that it contains exactly the files the manifest lists (plain names only, so a tampered archive cannot write outside the directory). Files are unpacked into a staging directory next to the destination (so its parent must be writable) and moved in one by one, so an interrupted fetch never leaves a truncated entry. Existing files are never overwritten; a snapshot whose files are all present is skipped.
- **`pack --delta`** archives only files missing from the newest published snapshot (and its base chain) and records that snapshot as `base`. Use it for `score-cache`, which grows a little after every scoring run. `riksdag-text` is large and changes slowly, so a full snapshot every few months is simpler.
- Level 19 compression is the default (a few minutes for `riksdag-text`); `--level 3` is fast.

## The manifest (`cache-manifest.json`)

One Zod schema, `cacheManifestSchema` in `tools/lib/cache-archive.ts`, is the only definition. Fields: `version`, `name`, `tag`, `createdAt`, `archive` (`file`, `sha256`, `bytes`, `compression`), `base` (tag of the snapshot it extends, or `null`), `files`, `uncompressedBytes` and `coverage`. Coverage is what the snapshot is **valid for**:

- `riksdag-text`: `term`, `doktyper`, `documentsFrom` and `documentsTo` (the publication dates, `datum` in the Riksdag store, of the oldest and newest cached document) and `documentCount`. **`documentsTo` is the watermark**: a later refresh only needs documents dated after it (minus the lookback `ingest-riksdag.ts` already uses, 14 days). It describes the whole cache at pack time, also in a delta.
- `score-cache`: the scoring runs the entries belong to (`name`, `scorerKind`, `model`, `templateVersion`, `planHash`, `requestCount`, `status`, read from `tools/out/runs/*/manifest.json`) and `entryCount`. Cache keys are content hashes of scorer, model, question template version, text and questions, so an entry is valid for exactly the runs and configs that produce the same key: a changed template version or model never reuses it, and entries from different people merge without conflict.

Change the manifest shape by editing the schema (and its tests), bump `version`, and keep `fetch` able to read the old version or say clearly that it cannot.

## Refreshing

1. `node --experimental-strip-types tools/ingest-riksdag.ts` (updates the store and `src/data/freshness.json`, see `docs/riksdag-api.md`), then `tools/fetch-riksdag-text.ts` fetches the text of new documents only.
2. `pack riksdag-text --publish`. The old release stays, so any snapshot can still be fetched.
3. Scoring: `pnpm score ...` then `pack score-cache --delta --publish`.

Several people can score different slices of the corpus on their own accounts (the `claude` scorer is limited by one login's rate-limit window, not by local concurrency) and each publish a `--delta`. Because keys do not depend on who ran a request, `fetch` of all of them gives the union.

## Legal

Swedish Copyright Act section 9 excludes laws, decisions, official reports and similar documents of public authorities from copyright, and data.riksdagen.se is an open-data API meant for reuse, so mirroring the document text is fine. Keep the descriptive User-Agent and 1 request/s when fetching from the source (see `docs/riksdag-api.md`).

## Note on scorer kinds in keys

The scorer's `kind` and `model` are part of every cache key. Results produced by a throwaway script with another `kind` do not match a later first-class scorer's keys; re-key them once by building both plans and copying each file to the new key (the plans' requests line up one to one) instead of paying for the run again. This was done for the 535 Haiku requests of the spike (`claude-haiku-experiment` to `claude`).
