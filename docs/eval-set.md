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
type, reference/date/committee snippet, URL), the search score and an empty `label` (and no `stage`).
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

### Nyckelfynd (summary view)

The full brief is dense, so the labeller first shows **NYCKELFYND (utan bedömning)**, a few rule-selected lines,
and the full detail on key `d`. `build-eval-briefs.ts` stores the summary in each brief file (`summary` key; briefs
built before this lack it, and the labeller then shows the full detail directly: re-run the build). Rules, no
judgement and never a label suggestion (`tools/lib/eval-summary.ts`):

- Only the promise's own terms count (keywords and extras). Title and quote words are used only if the promise has
  no keywords, and then only when not generic (more than 15 hits and 2% of the paragraphs counts as generic), so
  `nationell` (94 hits) is dropped.
- A **finding** is a sentence containing a promise term, with the kronor amounts of that sentence or, for the
  government and committee, of the next one. If the document has such sentences only those are shown, government
  first, then committee, then others (at most 3, best per speaker: amounts in the sentence, then rarer terms).
  Without any amounts (dir, sou, most prop) the best term-bearing sentence per speaker is shown instead; with no
  term hit at all the block says so.
- **Opposition** (reservation, special statement, motion) is one line per party (max 3, then a count), the sentence
  with the most and rarest terms; only amounts in that sentence.
- Budget documents show the prior year in the same table (year column: the budget year, so 2025/26 is 2026).
- One **zero-hit line** per promise term with no hits in either year ("0 träffar (båda åren)", or the counts per year
  and the first sentence from the year that has it). A longer term (`förlossningsvård`) is dropped when its prefix
  (`förlossning`) has no hits; the prefix-matching note is printed once.
- Matched terms are ANSI bold (off when stdout is not a TTY or `NO_COLOR` is set); lines wrap to the terminal width
  (60 to 120 columns).

`label-eval-set.ts` prints the brief under each pair when `tools/out/eval-briefs/<pair-id>.json` exists and falls back
to the stored snippet otherwise (`--briefs <dir>` overrides the folder). The summary comes first and `d` shows the
full detail. Parsing, speaker detection and fetching are in
`tools/lib/riksdag-text.ts`, the rest in `tools/lib/eval-brief.ts`; both are tested on real HD01SoU1/HC01SoU1 passages.

## Label

```sh
node --experimental-strip-types tools/label-eval-set.ts
```

Works offline in an interactive terminal (piped stdin is rejected). Ctrl-C prints a summary. For each unlabelled pair press `m` (match), `p` (partial),
`c` (contradicts), `n` (no match), `s` (skip), `b` (back) or `q` (quit). After a label you are asked for the document
**stage** in a separate prompt (`d` definitive, `p` preparatory, `b` background, Enter or `s` to skip and keep any
existing stage, `-` to remove it), then optionally a note. Every
answer is saved immediately, so you can quit and resume at any time. `--redo` revisits
labelled pairs. `--only-file ids.txt` (one pair id per line, `#` comments) walks only those pairs and implies `--redo`;
unknown ids are an error. When relabelling, Enter at the note prompt keeps the existing note and `-` removes it. Press
`r` to see what the blind model judgements in `model-labels.json` said and why, including Opus's stage (hidden by
default so they do not anchor you, and never shown at the stage prompt; `--model-labels <file>` points at another file).
You can also edit `label` (`match` | `partial` | `contradicts` | `no_match`), `stage` (`definitive` | `preparatory` |
`background`) and `note` directly in the JSON.

## Two axes: relevance and stage

**Relevance (`label`)** is how much of the promise the document covers:

- `match`: the document is direct evidence of the promise being acted on and covers the promise as a whole (the
  proposal, bill, decision or inquiry implements or prepares exactly what was promised);
- `partial`: same topic, but it covers only part of the promise (one of several measures, a narrower scope, a smaller
  amount);
- `contradicts`: on topic but works against the promise (e.g. a proposal that cuts the funding the promise relies on;
  relevant evidence for the timeline, but not progress);
- `no_match`: unrelated or only shares keywords.

**Stage (`stage`, optional)** is how far along the process the document is:

- `definitive`: a decision: a law, an adopted betänkande, an anslag;
- `preparatory`: a directive, SOU, Ds or proposal that prepares a measure and is not yet decided;
- `background`: only mentions the topic, or rejects motions about it.

The axes are independent. A directive, SOU or committee report that prepares the whole promised measure is `match` +
`preparatory`; it is no longer `partial` merely for preparing. Stage is only meaningful for documents that are
relevant, but it is recorded for any label the user chooses to give it.

Hand labels made before the stage axis existed treated documents that prepare the measure (inquiry directive, SOU,
committee report) as `match`, and `partial` was defined as "covers part of the promise or only prepares it". Old
`partial` labels may therefore need a second look with `--redo`/`--only-file`. `stage` is optional in the schema and
empty for every pair until it is hand-labelled.

`model-labels.json` has a stage only for Opus; the Sonnet and Haiku judgements have none. Once hand stages exist, compare:

```sh
node --experimental-strip-types tools/eval-stage-agreement.ts [--model opus]
```

Commit the labelled `pairs.json` when done.

## Model baselines (`model-labels.json`)

`src/data/2022-2026/eval/model-labels.json` holds Sonnet and Opus judgements for every pair (label, confidence, a
short reason; Opus also a document stage), made blind to the hand labels over the full document text. Its `meta` field
records the date, what blind means and how each model was prompted; the two prompts differ (Opus was also told that
lower spending alone is not contradiction and asked for a stage), and exact model snapshot ids were not recorded. It is
a comparison baseline and never ground truth: the hand label in `pairs.json` is. Its keys must match the pair ids.
