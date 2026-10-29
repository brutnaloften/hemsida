# Manifesto candidate extraction

How candidate promises are extracted from a party's election manifesto (valmanifest) and validated. Epic: `hemsida-chv`. Like the Tidö candidates, extraction is done by a Claude Code subagent on the user's subscription. No script here calls the Anthropic API.

## Pieces

- `tools/lib/manifesto-extract.ts`: `EXTRACTION_RULES` (the instructions the subagent follows), `rawManifestoCandidateSchema`, `toManifestoEntry`, and the checks.
- `tools/validate-manifesto-candidates.ts`: the validator CLI.
- `tools/add-manifesto-candidates.ts`: builds entries from raw candidates and merges them into the candidate file (wraps `toManifestoEntry`).
- `tools/lib/common.ts`: `slugify` and `COMMITTEES`, shared with the Tidö tool (no SDK import).
- Source file `src/data/sources/<source-id>.json` (kind `manifesto`, exactly one party), for example `valmanifest-2022-l`.
- Output `src/data/2022-2026/candidates/<source-id>.json`: an array of
  `{ section, promise, link? }`.
  - `promise` is a complete, schema-valid promise (verdict `unassessed`, `evidence: []`). The id is `val<year>-<party>-<slug>` (year of the source `date`, which must be the election year; the source must have kind `manifesto`), roles come from the per-term table `TERM_ROLES`.
  - `section` is the manifesto's own heading. Review-only.
  - `link` is filled by the later linking step: `{ promises: [tido ids], outcome, note: string | null, rationale }`. `outcome` must be one of `AGREEMENT_OUTCOMES`; `not_addressed` is used exactly when `promises` is empty. `rationale` is review-only.

## Running an extraction (orchestrator)

1. Make sure the source file exists and the manifesto PDF is available locally (use the `archive` URL if the original is gone). Pre-extract page text so the subagent and the validator read the same text:
   `pdftotext manifesto.pdf tools/out/<source-id>.txt` (poppler; pages are separated by form feeds, page N is the Nth piece).
2. Spawn a subagent per chunk of roughly 8-10 PDF pages (keeps each run small and resumable). Prompt outline:
   - the source id and PDF/text paths, and the page range for this chunk;
   - "Follow `EXTRACTION_RULES` in `tools/lib/manifesto-extract.ts`";
   - for each promise, produce the fields of `rawManifestoCandidateSchema` as a JSON array in a scratch file, then run the add command below so ids, roles and verdict are derived rather than hand-written.

   ```
   node --experimental-strip-types tools/add-manifesto-candidates.ts \
     --source valmanifest-2022-l --input tools/out/raw-pages-1-10.json
   ```

   It validates each raw candidate, derives ids (suffixing collisions with promise files and other entries), and merges into `src/data/2022-2026/candidates/<source-id>.json`, sorted by page then id. Entries already in the file from pages covered by the input are replaced, so re-running a chunk is safe. Nothing is written if any raw candidate is invalid. `--date` sets the verdict date (default today); `--data-dir` and `--term` override the data location.

3. Validate:

   ```
   node --experimental-strip-types tools/validate-manifesto-candidates.ts \
     --source valmanifest-2022-l --pages-text tools/out/valmanifest-2022-l.txt
   ```

   Use `--pdf path` instead of `--pages-text` to run `pdftotext` (must be on PATH) from the validator. `--tido path` points at a Tidö candidates file; by default the Tidö ids come from `promises/tido-*.json`, falling back to `candidates/tidoavtalet.json`. `--data-dir` and `--term` override the data location (default `src/data`, `2022-2026`).

4. The validator checks: every entry against the schema, source id and id prefix, unique ids that do not collide with existing promise files, every quote a verbatim substring of its cited page (whitespace, quote style, dashes and line-break hyphenation are normalised; see _Loose quote fallback_), and, when links are present, that every linked id is a Tidö promise, that `link.outcome` is a valid outcome label, that `promises` has no duplicates, and that `not_addressed` holds iff `promises` is empty. It exits non-zero on any error. Fix the file (or the quote) and rerun. Without page text the quote check is skipped with a warning. The Tidö candidate file is only read when some entry has a `link`.

### Loose quote fallback

The primary quote check is strict: the normalised quote must be a substring of the normalised page text. Only if that fails does a loose fallback run, which removes every hyphen and space from both sides and compares again. This catches real hyphens split by a line break (`el-` / `bilar`) that PDF text extraction renders ambiguously. The cost is that the loose match can accept a quote with wrong spacing or a missing hyphen, so a loose-only match is reported as a warning (`quote only matches page N ignoring spaces and hyphens`) instead of passing silently. Review those quotes by hand.

## Swapping the pilot party

Everything party-specific comes from the source file: add `src/data/sources/valmanifest-2022-<party>.json` (one party), then run the same steps with `--source valmanifest-2022-<party>`. No code changes. A new term needs a `TERM_ROLES` entry in `manifesto-extract.ts`.

## Not covered here

- Turning a link into `agreement` evidence on a promoted promise (`hemsida-chv.8`).
