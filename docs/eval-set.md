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
for pairs that are sampled again.

Each pair has the promise (title, description, source quote), the document (id, title,
type, reference/date/committee snippet, URL), the search score and an empty `label`.
Candidate files store no document body, so open the URL when the title is not enough.

## Label

```sh
node --experimental-strip-types tools/label-eval-set.ts
```

Works offline in the terminal. For each unlabelled pair press `m` (match), `p` (partial),
`n` (no match), `s` (skip), `b` (back) or `q` (quit); then optionally type a note. Every
answer is saved immediately, so you can quit and resume at any time. `--redo` revisits
labelled pairs. You can also edit `label` (`match` | `partial` | `no_match`) and `note`
directly in the JSON.

Guidance: `match` = the document is direct evidence of the promise being acted on (the
proposal, bill or decision implements it); `partial` = same topic, covers part of the
promise or only prepares it (e.g. an inquiry directive); `no_match` = unrelated or only
shares keywords.

Commit the labelled `pairs.json` when done.
