# Matcher eval set

Hand-labelled promise/document pairs used to choose the matcher model (Haiku vs Sonnet,
`hemsida-4np.5`). The set is `src/data/2022-2026/eval/pairs.json`; its Zod schema is
`src/schema/eval.ts`.

## Generate

```sh
node --experimental-strip-types tools/prepare-eval-set.ts [--count 50] [--seed 20260401]
```

Samples pairs from `src/data/2022-2026/riksdag-candidates/` with a fixed seed, so the
output is reproducible. Strata are document type (dir, sou/ds, prop, bet) times candidate
score band (score 1 = likely negatives, 2-3, 4+). Picks go round-robin over the strata,
preferring promises and policy areas not yet used. Re-running keeps labels already entered
for pairs that are sampled again. If a different `--count`/`--seed` would drop an
already-labelled pair, the tool warns and refuses unless `--force` is given.

Each pair has the promise (title, description, source quote), the document (id, title,
type, reference/date/committee snippet, URL), the search score and an empty `label`.
Candidate files store no document body: run the evidence briefs below, or open the URL.

## Evidence briefs (full text)

The stored snippet is not enough to judge a pair, so build briefs from each document's full text first:

```sh
node --experimental-strip-types tools/build-eval-briefs.ts
```

It fetches `data.riksdagen.se/dokument/<id>.text` (sequentially, 1 req/s, descriptive User-Agent), caches the raw
response in `tools/out/riksdag-text/` (not committed, so re-runs are offline) and writes
`tools/out/eval-briefs/<pair-id>.json` per pair. Options: `--only <pair-id>`, `--term`, `--store`
(riksdag store, default `tools/out/riksdag-store/<term>.json`), `--out`, `--cache`.

Each brief reports facts only, never a suggested label:

- **Term counts** for the promise's keywords, extra terms from `tools/eval-brief-terms.json` and distinctive words
  (6+ letters) of the promise title and source quote. Terms match from a word start, so `förlossning` also counts
  `förlossningsvård`. Zero counts are listed explicitly ("Förekommer inte i texten").
- Extra hand-picked terms per promise live in `tools/eval-brief-terms.json` (promise id to list of terms), for when the
  promise's wording and the document's wording differ.
- **Verbatim passages** with the section heading, the `Anslaget N:N` heading when there is one, and the speaker:
  government, committee majority, reservation or special statement by party, motion by party, inquiry. Passages are
  the paragraphs with the most (rarity-weighted) term matches, shown in document order.
- **Amounts** in those passages ("1 000 000 000 kronor", "127 miljarder kronor") with the year in the same sentence.
- **Prior year** for budget documents (bet/prop for an utgiftsområde): the same passages and counts for the
  counterpart in the previous riksmöte (same organ and title, else same utgiftsområde number), only if it is inside the
  term (found in the riksdag store); otherwise the brief says there is none.

`label-eval-set.ts` prints the brief under each pair when `tools/out/eval-briefs/<pair-id>.json` exists and falls back
to the stored snippet otherwise (`--briefs <dir>` overrides the folder). Parsing, speaker detection and fetching are in
`tools/lib/riksdag-text.ts`, the rest in `tools/lib/eval-brief.ts`; both are tested on real HD01SoU1/HC01SoU1 passages.

## Label

```sh
node --experimental-strip-types tools/label-eval-set.ts
```

Works offline in an interactive terminal (piped stdin is rejected). Ctrl-C prints a summary. For each unlabelled pair press `m` (match), `p` (partial),
`c` (contradicts), `n` (no match), `s` (skip), `b` (back) or `q` (quit); then optionally type a note. Every
answer is saved immediately, so you can quit and resume at any time. `--redo` revisits
labelled pairs. You can also edit `label` (`match` | `partial` | `contradicts` | `no_match`) and `note`
directly in the JSON.

Guidance: `match` = the document is direct evidence of the promise being acted on (the
proposal, bill or decision implements it); `partial` = same topic, covers part of the
promise or only prepares it (e.g. an inquiry directive); `contradicts` = on topic but
works against the promise (e.g. a proposal that cuts the funding the promise relies on; it is
relevant evidence for the timeline, but not progress); `no_match` = unrelated or only
shares keywords.

Commit the labelled `pairs.json` when done.
