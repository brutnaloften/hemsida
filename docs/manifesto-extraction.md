# Manifesto candidate extraction

How candidate promises are extracted from a party's election manifesto (valmanifest) and validated. Epic: `hemsida-chv`. Like the Tidö candidates, extraction is done by a Claude Code subagent on the user's subscription. No script here calls the Anthropic API.

## Pieces

- `tools/lib/manifesto-extract.ts`: `EXTRACTION_RULES` (the instructions the subagent follows), `rawManifestoCandidateSchema`, `toManifestoEntry`, and the checks.
- `tools/validate-manifesto-candidates.ts`: the validator CLI.
- Source file `src/data/sources/<source-id>.json` (kind `manifesto`, exactly one party), for example `valmanifest-2022-l`.
- Output `src/data/2022-2026/candidates/<source-id>.json`: an array of
  `{ section, promise, link? }`.
  - `promise` is a complete, schema-valid promise (verdict `unassessed`, `evidence: []`). The id is `val<year>-<party>-<slug>`, roles come from the per-term table `TERM_ROLES`.
  - `section` is the manifesto's own heading. Review-only.
  - `link` is filled by the later linking step: `{ promises: [tido ids], outcome: string, note: string | null, rationale }`. `outcome` is a plain string here; its allowed values are checked once the agreement schema exists (not in this tool yet). `rationale` is review-only.

## Running an extraction (orchestrator)

1. Make sure the source file exists and the manifesto PDF is available locally (use the `archive` URL if the original is gone). Pre-extract page text so the subagent and the validator read the same text:
   `pdftotext manifesto.pdf tools/out/<source-id>.txt` (poppler; pages are separated by form feeds, page N is the Nth piece).
2. Spawn a subagent per chunk of roughly 8-10 PDF pages (keeps each run small and resumable). Prompt outline:
   - the source id and PDF/text paths, and the page range for this chunk;
   - "Follow `EXTRACTION_RULES` in `tools/lib/manifesto-extract.ts`";
   - for each promise, produce the fields of `rawManifestoCandidateSchema` and build entries with `toManifestoEntry(raw, source, takenIds, today)` so ids, roles and verdict are derived rather than hand-written;
   - merge into `src/data/2022-2026/candidates/<source-id>.json`, sorted by page then id, replacing earlier entries from the same pages when re-running.
3. Validate:

   ```
   node --experimental-strip-types tools/validate-manifesto-candidates.ts \
     --source valmanifest-2022-l --pages-text tools/out/valmanifest-2022-l.txt
   ```

   Use `--pdf path` instead of `--pages-text` to run `pdftotext` (must be on PATH) from the validator. `--tido path` points at a Tidö candidates file; by default the Tidö ids come from `promises/tido-*.json`, falling back to `candidates/tidoavtalet.json`. `--data-dir` and `--term` override the data location (default `src/data`, `2022-2026`).

4. The validator checks: every entry against the schema, source id and id prefix, unique ids that do not collide with existing promise files, every quote a verbatim substring of its cited page (whitespace, quote style, dashes and line-break hyphenation are normalised), and, when links are present, that every linked id is a Tidö promise. It exits non-zero on any error. Fix the file (or the quote) and rerun. Without page text the quote check is skipped with a warning.

## Swapping the pilot party

Everything party-specific comes from the source file: add `src/data/sources/valmanifest-2022-<party>.json` (one party), then run the same steps with `--source valmanifest-2022-<party>`. No code changes. A new term needs a `TERM_ROLES` entry in `manifesto-extract.ts`.

## Not covered here

- The `agreement` evidence kind and outcome-label validation (`hemsida-chv.4`, `hemsida-chv.7`).
