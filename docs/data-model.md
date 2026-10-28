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

| Field            | Type        | Notes                                                                                    |
| ---------------- | ----------- | ---------------------------------------------------------------------------------------- |
| `id`             | slug        | Referenced from promises                                                                 |
| `title`          | string      | Swedish display title                                                                    |
| `kind`           | enum        | `government_agreement`, `manifesto`, `speech`, `debate`, `other`                         |
| `parties`        | party codes | Parties that stand behind the document                                                   |
| `date`           | ISO date    | Publication date                                                                         |
| `url`, `archive` | URL         | Original and web.archive.org copy                                                        |
| `urlDeadAsOf`    | ISO date    | Optional. Set when the original `url` is dead; the site then links the archive copy only |

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

| Field                  | Type         | Notes                                                                                                                                                                                                        |
| ---------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                   | slug         | Filename without `.json`. Prefixed by source: `tido-` for the Tidö agreement, `val<year>-<party>-` for a party manifesto (year of the source `date`, the election year; party lowercased, e.g. `val2022-l-`) |
| `term`                 | `YYYY-YYYY`  | The mandate period the promise belongs to                                                                                                                                                                    |
| `title`, `description` | string       | Swedish. The title is short; the description gives the full promise in our words                                                                                                                             |
| `source`               | object       | `id` of the source, `page` (if paginated), optional verbatim `quote`                                                                                                                                         |
| `parties`              | party codes  | Who made the promise                                                                                                                                                                                         |
| `roles`                | party → role | Each party's role **during the term**: `government`, `support`, `opposition`. SD is `support` under Tidö                                                                                                     |
| `type`                 | enum         | See _Promise types_                                                                                                                                                                                          |
| `area`                 | string       | Policy area, Swedish (used for grouping/filtering)                                                                                                                                                           |
| `committee`            | utskott code | Riksdag committee, e.g. `JuU`, `SfU`, `FiU`. Narrows the Riksdag search                                                                                                                                      |
| `keywords`             | string[]     | Swedish search terms for the Riksdag full-text search                                                                                                                                                        |
| `verdict`              | object       | See _Verdict_                                                                                                                                                                                                |
| `evidence`             | Evidence[]   | Sorted by date. See _Evidence_                                                                                                                                                                               |

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

| Value                 | Swedish label     | Meaning                                                                      |
| --------------------- | ----------------- | ---------------------------------------------------------------------------- |
| `unassessed`          | Inte bedömt       | Nobody has looked yet; makes no claim about the world. The default           |
| `no_evidence`         | Inga belägg funna | A human searched the Riksdag record and found nothing (see below)            |
| `in_progress`         | Pågår             | Action under way (inquiry, proposal, bill), not yet decided or in force      |
| `fulfilled`           | Uppfyllt          | Done as promised                                                             |
| `partially_fulfilled` | Delvis uppfyllt   | Done, but substantially narrower or weaker than promised, or only some parts |
| `unfulfilled`         | Ej uppfyllt       | The term ended without fulfilment                                            |
| `abandoned`           | Övergivet         | The promising parties explicitly dropped it                                  |
| `broken`              | Brutet            | They did the opposite, or voted against it                                   |
| `not_assessable`      | Ej bedömbart      | Too vague to assess                                                          |

`unassessed` and `no_evidence` are deliberately different. `no_evidence` is a statement about our record, not about what the government did. Absence of evidence is not evidence of absence: `unassessed` only says the promise has not been reviewed, while `no_evidence` is a positive finding by a human who searched the Riksdag record and recorded that nothing was found. Its reasoning must state what was searched and when (committee, keywords, date). New promises and extraction candidates default to `unassessed`.

#### Evidence constraints on the verdict

The verdict stays human-set, but the schema (`checkVerdictEvidence` in `src/schema/promise.ts`) limits which values the evidence allows. Only the current verdict is checked, not `history`. Only Riksdag evidence counts (`dir`, `sou`, `ds`, `prop`, `bet`, `sfs`, `mot`); `agreement` evidence never qualifies any verdict.

| Verdict                                           | Enforced requirement                                                                                                                                                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unassessed`                                      | None                                                                                                                                                                                                                            |
| `not_assessable`                                  | None beyond the general rule that reasoning is non-empty                                                                                                                                                                        |
| `in_progress`                                     | At least one evidence entry of kind `dir`, `sou`, `ds` or `prop`                                                                                                                                                                |
| `fulfilled`                                       | At least one evidence entry of kind `sfs`                                                                                                                                                                                       |
| `broken`                                          | A `bet` evidence entry with `votes` (the voting record; there is no separate `votering` kind), or reasoning that contains the `designation` of a Riksdag evidence entry (the document documenting the reversal)                 |
| `no_evidence`                                     | Reasoning contains an ISO date (`YYYY-MM-DD`) and names what was searched: the promise's `committee` or at least one of its `keywords` (case-insensitive). If the promise has neither, reasoning must be at least 30 characters |
| `partially_fulfilled`, `unfulfilled`, `abandoned` | None beyond non-empty reasoning                                                                                                                                                                                                 |

The `no_evidence` check is pragmatic: it cannot verify that a search really happened, only that one is recorded with a date and a search target.

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

#### Agreement evidence

A second evidence kind, `agreement`, records how a government agreement (Tidöavtalet, later the 2026–2030 agreement) treated a promise made elsewhere, typically a party's election manifesto. It is a separate branch of the evidence union (discriminated on `kind`): it has none of the Riksdag fields above (`dok_id`, `designation`, `title`, `url`, `relevance`, `votes`), so code that reads those must narrow on `kind` first.

| Field      | Type           | Notes                                                                                            |
| ---------- | -------------- | ------------------------------------------------------------------------------------------------ |
| `kind`     | `agreement`    |                                                                                                  |
| `source`   | slug           | Id of the agreement's source file in `src/data/sources/` (kind `government_agreement`)           |
| `date`     | ISO date       | The agreement's date                                                                             |
| `promises` | slug[]         | Ids of the agreement's promise files that correspond to this one; empty only for `not_addressed` |
| `outcome`  | enum           | How the agreement treated the promise (below)                                                    |
| `note`     | string \| null | Optional Swedish note                                                                            |

| Outcome         | Swedish label    | Meaning                                                                                                  |
| --------------- | ---------------- | -------------------------------------------------------------------------------------------------------- |
| `included`      | Med i avtalet    | The agreement contains the promise                                                                       |
| `weakened`      | Urvattnat        | The agreement contains a weaker version                                                                  |
| `strengthened`  | Skärpt           | The agreement goes further than the promise                                                              |
| `contradicted`  | Motsägs          | The agreement says the opposite                                                                          |
| `not_addressed` | Saknas i avtalet | The agreement does not mention it (this also covers "negotiated away", which the text alone cannot show) |

Rules:

- **The outcome is not a verdict.** It describes the agreement text and never sets or implies the verdict, which stays a separate human call. Agreement evidence alone is never enough for `in_progress` or `fulfilled` (to be enforced with the other evidence-to-verdict constraints in `hemsida-bzj.7`).
- **Agreement is not a pipeline stage.** Stage derivation (dir → sou/ds → prop → bet → sfs) ignores it.
- **References, not copies.** `promises` holds ids only. Riksdag evidence of the linked Tidö promises is not copied onto the manifesto promise; the site shows the linked promise's timeline inline.
- **Schema checks:** `promises` is empty if and only if the outcome is `not_addressed`, and a promise has at most one agreement entry per `source`. A data test checks that every id in `promises` is a promise file in the same term and that `source` is a `government_agreement` source file.

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
- **Manifesto promise vs agreement.** A manifesto promise is its own promise file with its own verdict. The agreement is evidence on it: add one `agreement` entry for the agreement, linking the Tidö promise ids that cover it. A manifesto promise the agreement left out gets `not_addressed` with empty `promises`; the verdict is still set by a human (`not_addressed` does not make it `broken` or `abandoned`).
- **Term ends.** Nothing is set automatically. In the term-close review PR a human assesses every remaining `unassessed` promise, and decides whether `no_evidence` / `in_progress` ones become `unfulfilled`, `broken` or something else. `unassessed` is never turned into `unfulfilled` by default: not having looked is not a finding.

## Decision: JSON, not YAML

Promise files stay JSON. The tooling reads and writes them without an extra dependency or formatting round-trip problems, oxfmt formats them, and PR diffs of single-field changes are already readable. YAML would only make long Swedish text slightly nicer to read.

## Open questions

1. Is `unfulfilled` (term ended) different enough from `broken` (did the opposite) to show separately? This draft says yes.
2. Should verdict reasoning be required for `no_evidence`? Yes: the schema enforces a recorded search (see the constraint table). It is not required for `unassessed`.
3. The four Almedalen 2024 KD promises (`hemsida-bzj.5`): migrate them with `source.kind: speech`, or drop them to keep the dataset Tidö-only for now?
