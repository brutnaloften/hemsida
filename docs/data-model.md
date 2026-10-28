# Data model v2 (draft)

Status: **draft for review** (bead `hemsida-bzj.1`). Open questions are listed at the end.

## Principles

- **Evidence and verdict are separate.** Evidence is a list of official documents, and the tooling can mostly fill it in. The verdict is set by a human, with written reasoning, and the evidence backs it up.
- **Files in git.** One JSON file per promise. Every verdict change is a reviewable PR, which gives the site a public audit trail.
- **References, not copies.** Evidence stores IDs and metadata for Riksdag documents, not their contents.
- **One schema.** A single Zod module, imported by both the Astro content collection and the tooling.
- **Data in English, display in Swedish.** Enum values are English slugs. The site maps them to Swedish labels.

## Layout

```
src/data/
  sources/
    tidoavtalet.json            # origin documents (agreements, manifestos, …)
  2022-2026/
    promises/
      tido-<slug>.json          # one file per promise
    rejected-candidates.json    # (promise, dok_id) pairs checked and rejected by review
  2026-2030/
    …
```

## Source

A document that promises come from.

```json
{
  "id": "tidoavtalet",
  "title": "Tidöavtalet",
  "kind": "government_agreement",
  "parties": ["M", "KD", "L", "SD"],
  "date": "2022-10-14",
  "url": "https://…",
  "archive": "https://web.archive.org/…"
}
```

| Field            | Type        | Notes                                                            |
| ---------------- | ----------- | ---------------------------------------------------------------- |
| `id`             | slug        | Referenced from promises                                         |
| `title`          | string      | Swedish display title                                            |
| `kind`           | enum        | `government_agreement`, `manifesto`, `speech`, `debate`, `other` |
| `parties`        | party codes | Parties that stand behind the document                           |
| `date`           | ISO date    | Publication date                                                 |
| `url`, `archive` | URL         | Original and web.archive.org copy                                |

## Promise

```json
{
  "id": "tido-skarpta-straff-gangbrott",
  "term": "2022-2026",
  "title": "Skärpta straff för gängkriminalitet",
  "description": "Straffen för brott som begås inom ramen för kriminella nätverk ska skärpas …",
  "source": { "id": "tidoavtalet", "page": 23, "quote": "…" },
  "parties": ["M", "KD", "L", "SD"],
  "roles": { "M": "government", "KD": "government", "L": "government", "SD": "support" },
  "type": "legislative",
  "area": "Kriminalpolitik",
  "committee": "JuU",
  "keywords": ["gängbrott", "straffskärpning", "kriminella nätverk"],
  "verdict": {
    "value": "fulfilled",
    "reasoning": "Lagen trädde i kraft 2023-07-01 (SFS 2023:xxx) …",
    "date": "2023-07-01",
    "history": [{ "value": "in_progress", "reasoning": "…", "date": "2023-03-02" }]
  },
  "evidence": [
    {
      "kind": "prop",
      "dok_id": "HA03xxx",
      "designation": "Prop. 2022/23:xx",
      "title": "Skärpta straff för brott i kriminella nätverk",
      "date": "2023-03-02",
      "url": "https://data.riksdagen.se/dokument/HA03xxx",
      "relevance": "full",
      "note": null
    }
  ]
}
```

| Field                  | Type         | Notes                                                                                                    |
| ---------------------- | ------------ | -------------------------------------------------------------------------------------------------------- |
| `id`                   | slug         | Filename without `.json`. Prefixed by source, e.g. `tido-`                                               |
| `term`                 | `YYYY-YYYY`  | The mandate period the promise belongs to                                                                |
| `title`, `description` | string       | Swedish. The title is short; the description gives the full promise in our words                         |
| `source`               | object       | `id` of the source, `page` (if paginated), optional verbatim `quote`                                     |
| `parties`              | party codes  | Who made the promise                                                                                     |
| `roles`                | party → role | Each party's role **during the term**: `government`, `support`, `opposition`. SD is `support` under Tidö |
| `type`                 | enum         | See _Promise types_                                                                                      |
| `area`                 | string       | Policy area, Swedish (used for grouping/filtering)                                                       |
| `committee`            | utskott code | Riksdag committee, e.g. `JuU`, `SfU`, `FiU`. Narrows the Riksdag search                                  |
| `keywords`             | string[]     | Swedish search terms for the Riksdag full-text search                                                    |
| `verdict`              | object       | See _Verdict_                                                                                            |
| `evidence`             | Evidence[]   | Sorted by date. See _Evidence_                                                                           |

Party codes: `S`, `M`, `SD`, `C`, `V`, `KD`, `L`, `MP`.

### Promise types

| Value          | Meaning                                                                | Tracked by                            |
| -------------- | ---------------------------------------------------------------------- | ------------------------------------- |
| `legislative`  | Requires a law change                                                  | Riksdag document chain                |
| `inquiry`      | The promise _is_ to investigate something ("utreda X")                 | Kommittédirektiv                      |
| `budget`       | An amount or spending change                                           | Budget epic (`hemsida-9ce`), later    |
| `outcome`      | A measurable result ("halvera …")                                      | Outcome epic (`hemsida-50r`), later   |
| `other_action` | Government action outside the Riksdag (förordning, agency instruction) | Later epic (`hemsida-l8h`)            |
| `vague`        | Too unspecific to assess                                               | Not tracked; verdict `not_assessable` |

### Verdict

Set by a human, with reasoning that cites evidence. `history` keeps earlier verdicts so the site can show how the assessment changed. Git keeps the full audit trail on top of that.

| Value                 | Swedish label   | Meaning                                                                      |
| --------------------- | --------------- | ---------------------------------------------------------------------------- |
| `unassessed`          | Inte bedömt     | Nobody has looked yet; makes no claim about the world. The default           |
| `not_started`         | Ej påbörjat     | A human searched the Riksdag record and found nothing (see below)            |
| `in_progress`         | Pågår           | Action under way (inquiry, proposal, bill), not yet decided or in force      |
| `fulfilled`           | Uppfyllt        | Done as promised                                                             |
| `partially_fulfilled` | Delvis uppfyllt | Done, but substantially narrower or weaker than promised, or only some parts |
| `unfulfilled`         | Ej uppfyllt     | The term ended without fulfilment                                            |
| `abandoned`           | Övergivet       | The promising parties explicitly dropped it                                  |
| `broken`              | Brutet          | They did the opposite, or voted against it                                   |
| `not_assessable`      | Ej bedömbart    | Too vague to assess                                                          |

`unassessed` and `not_started` are deliberately different. Absence of evidence is not evidence of absence: `unassessed` only says the promise has not been reviewed, while `not_started` is a positive finding by a human who searched the Riksdag record and recorded that nothing was found. Its reasoning must state what was searched and when (committee, keywords, date). New promises and extraction candidates default to `unassessed`. Schema enforcement of the `not_started` reasoning is tracked in `hemsida-bzj.7`.

### Evidence

A reference to an official document that bears on the promise.

| Field         | Type           | Notes                                                                                                                                   |
| ------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`        | enum           | `dir` (kommittédirektiv), `sou`, `ds`, `prop`, `bet` (betänkande/riksdagsbeslut), `sfs`, `mot` (motion, mainly for opposition promises) |
| `dok_id`      | string         | Riksdag document ID, the stable key                                                                                                     |
| `designation` | string         | Human-readable reference, e.g. `Prop. 2022/23:45`, `SFS 2023:123`                                                                       |
| `title`       | string         | Document title (Swedish, as published)                                                                                                  |
| `date`        | ISO date       | Publication or decision date                                                                                                            |
| `url`         | URL            | Link to the document                                                                                                                    |
| `relevance`   | enum           | `full` (addresses the whole promise) or `partial` (one part of it)                                                                      |
| `note`        | string \| null | Optional Swedish note, e.g. what part is covered or what was watered down                                                               |
| `votes`       | object?        | For `bet` only, later (`hemsida-4np`): party → `yes` / `no` / `abstain` / `absent`                                                      |

The **stage** shown on the site comes from the latest evidence `kind` (dir → sou/ds → prop → bet → sfs), so it isn't stored separately.

Budget evidence (budget bills, supplementary budgets, ESV outcomes) will be added by the budget epic.

### Rejected candidates

`src/data/<term>/rejected-candidates.json` holds `(promise_id, dok_id)` pairs that the matcher proposed and review rejected. The search skips these pairs, so the same document isn't proposed twice and promise files stay clean. Schema: `src/schema/rejected.ts`.

```json
[
  {
    "promise_id": "tido-skarpta-straff-gangbrott",
    "dok_id": "HA03123",
    "reason": "Gäller ungdomsbrott, inte gängbrott",
    "rejected_at": "2026-01-02"
  }
]
```

| Field         | Type      | Notes                                     |
| ------------- | --------- | ----------------------------------------- |
| `promise_id`  | slug      | Promise filename without `.json`          |
| `dok_id`      | string    | Riksdag document ID, same key as evidence |
| `reason`      | string?   | Why it was rejected                       |
| `rejected_at` | ISO date? | When review rejected it                   |

The file is a flat array, one per term rather than one per promise: it is small, the matcher loads all of it at once, and a rejection is a one-line PR diff. A pair appears at most once. Accepting a previously rejected pair means deleting its row and adding the evidence.

## Edge cases

- **The promise is an inquiry.** Use type `inquiry`. Once the kommittédirektiv exists, the verdict is `fulfilled`. Any later legislation is extra evidence but doesn't change the verdict.
- **A bill is watered down.** The evidence is `relevance: full`, the verdict is `partially_fulfilled`, and the reasoning or `note` says what's missing.
- **Several laws for one promise.** Each law is its own evidence entry, typically `relevance: partial`. The verdict reflects the whole.
- **A promise not to do something** ("inte höja skatten"). The verdict stays `in_progress` during the term. At term end it becomes `fulfilled` if nothing contradicting happened, otherwise `broken` with the contradicting evidence.
- **Reversed later.** Add the reversing document as evidence and move the verdict (e.g. `fulfilled` → `broken`); the earlier verdict stays in `history`.
- **One sentence holds several promises.** Split into separate promise files that share the same `source.page`.
- **A support party, not a government party.** `roles` records it (`SD: support`), so the site can distinguish "the government did not deliver" from "a support party voted against".
- **Term ends.** Remaining `unassessed` / `not_started` / `in_progress` verdicts become `unfulfilled` in a term-close review PR.

## Decision: JSON, not YAML

Promise files stay JSON. The tooling reads and writes them without an extra dependency or formatting round-trip problems, oxfmt formats them, and PR diffs of single-field changes are already readable. YAML would only make long Swedish text slightly nicer to read.

## Open questions

1. Is `unfulfilled` (term ended) different enough from `broken` (did the opposite) to show separately? This draft says yes.
2. Should verdict reasoning be required for `not_started`? Its reasoning is meant to state what was searched and when; enforcement is tracked in `hemsida-bzj.7`. It is not required for `unassessed`.
3. The four Almedalen 2024 KD promises (`hemsida-bzj.5`): migrate them with `source.kind: speech`, or drop them to keep the dataset Tidö-only for now?
