# Data model v2 (draft)

Status: **draft for review** (bead `hemsida-bzj.1`). Open questions are listed at the end.

## Principles

- **Evidence and verdict are separate.** Evidence is a list of official documents, and the tooling can mostly fill it in. The verdict is set by Claude, with written reasoning, and the evidence backs it up. There is no human review step: the reasoning and the evidence constraints below are the safeguards, and git keeps every change revertable.
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

## Term record

`src/data/<term>/term.json` is the single place that says who governed in a term. Schema: `src/schema/term.ts`, loaded as the `terms` content collection.

```json
{
  "id": "2022-2026",
  "roles": {
    "M": "government",
    "KD": "government",
    "L": "government",
    "SD": "support",
    "S": "opposition",
    "V": "opposition",
    "C": "opposition",
    "MP": "opposition"
  },
  "agreements": ["tidoavtalet"],
  "role_changes": [{ "date": "2024-05-01", "party": "S", "role": "government", "note": "…" }]
}
```

- `id` is `YYYY-YYYY` and equals the directory name.
- `roles` lists every party with its role at the start of the term (`government`, `support`, `opposition`).
- `agreements` holds ids of `government_agreement` sources. Zero (`[]`), one or several are all valid.
- `role_changes` (optional) are dated changes mid-term, e.g. a government change. The first change per party must differ from the starting role.
- Data tests check that `agreements` are `government_agreement` source files and that the `roles` in every promise file agree with the term record.

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

Set by Claude, with reasoning that cites evidence. A verdict set by a model carries `assessedBy: "ai"` (optional; also allowed on `history` entries; `human` is reserved for a verdict a person set), and the site shows an AI tag with a hover warning next to it. The reasoning itself does not repeat that warning, nor that more documents may exist: the ingestion status is stated elsewhere on the site. `history` keeps earlier verdicts so the site can show how the assessment changed. Git keeps the full audit trail on top of that.

| Value                 | Swedish label     | Meaning                                                                      |
| --------------------- | ----------------- | ---------------------------------------------------------------------------- |
| `unassessed`          | Inte bedömt       | Nobody has looked yet; makes no claim about the world. The default           |
| `no_evidence`         | Inga belägg funna | The Riksdag record was searched and nothing found (see below)                |
| `in_progress`         | Pågår             | Action under way (inquiry, proposal, bill), not yet decided or in force      |
| `fulfilled`           | Uppfyllt          | Done as promised                                                             |
| `partially_fulfilled` | Delvis uppfyllt   | Done, but substantially narrower or weaker than promised, or only some parts |
| `unfulfilled`         | Ej uppfyllt       | The term ended without fulfilment                                            |
| `abandoned`           | Övergivet         | The promising parties explicitly dropped it                                  |
| `broken`              | Brutet            | They did the opposite, or voted against it                                   |
| `not_assessable`      | Ej bedömbart      | Too vague to assess                                                          |

`unassessed` and `no_evidence` are deliberately different. `no_evidence` is a statement about our record, not about what the government did. Absence of evidence is not evidence of absence: `unassessed` only says the promise has not been reviewed, while `no_evidence` is a positive finding that the Riksdag record was searched and nothing was found. Its reasoning must state what was searched and when (committee, keywords, date). New promises and extraction candidates default to `unassessed`.

#### Evidence constraints on the verdict

The verdict is set by Claude, and the schema (`checkVerdictEvidence` in `src/schema/promise.ts`) limits which values the evidence allows. Only the current verdict is checked, not `history`. Only Riksdag evidence counts (`dir`, `sou`, `ds`, `prop`, `bet`, `sfs`, `mot`); `agreement` and `budget` evidence never qualify any verdict.

| Verdict                            | Enforced requirement                                                                                                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unassessed`                       | None                                                                                                                                                                                                                            |
| `not_assessable`                   | None beyond the general rule that reasoning is non-empty                                                                                                                                                                        |
| `in_progress`                      | At least one evidence entry of kind `dir`, `sou`, `ds` or `prop`                                                                                                                                                                |
| `fulfilled`, `partially_fulfilled` | At least one evidence entry of kind `sfs` with `date` on or before the verdict `date` (a law in force when the verdict was set)                                                                                                 |
| `broken`                           | A `bet` evidence entry with `votes` (the voting record; there is no separate `votering` kind), or reasoning that contains the `designation` of a Riksdag evidence entry (the document documenting the reversal)                 |
| `no_evidence`                      | Reasoning contains an ISO date (`YYYY-MM-DD`) and names what was searched: the promise's `committee` or at least one of its `keywords` (case-insensitive). If the promise has neither, reasoning must be at least 30 characters |
| `unfulfilled`, `abandoned`         | None beyond non-empty reasoning                                                                                                                                                                                                 |

The `no_evidence` check is pragmatic: it cannot verify that a search really happened, only that one is recorded with a date and a search target.

#### Rules for setting a verdict from evidence

These are the working rules for the model that sets verdicts. `checkVerdictEvidence` enforces the evidence floors above; the rest is policy that the reasoning has to be consistent with. One verdict value per promise: there are no combination values such as "partially fulfilled / rest in progress". The reasoning says which part is done and which is still moving.

- **How the law is found.** A law is never searched for by title. It is reached through a proposition that is already evidence on the promise: the SFS register lists the Förarbeten of every law (`Prop. <rm>:<nr>`), and `ingest-sfs` records which laws cite which proposition (`docs/riksdag-api.md`, "SFS register"). The SFS judge then labels how much of the promise each law delivers (`full`, `partial`, `weaker`, `none`; `docs/riksdag-linking.md`). Only `legislative` promises are considered; budget propositions and skrivelser are excluded, and `none` laws and laws with no in-force date are not added as evidence. A law is **in force** when its `Ikraft` date is on or before the verdict date (the same condition `checkVerdictEvidence` enforces for `fulfilled` and `partially_fulfilled`).
- **`in_progress`**: at least one dir, sou, ds or prop is linked and nothing is in force yet. It also applies when a law is in force but work is pending: another linked proposition with no law in force, or a linked dir, sou or ds dated after the newest proposition that has a law in force. A `full` judged below `high` confidence is unconfirmed, so it stays `in_progress` with the sfs entry attached. A betänkande alone only rejects motions and is not enough.
- **`fulfilled`**: nothing pending, a law judged `full` at `high` confidence is in force, no linked law is judged `weaker`, and every linked law judged `full`, `partial` or `weaker` is in force (a future or undated law on the same proposition blocks it). Only for a commitment delivered by a law; promises that need no law (budget, agency instructions) wait for their own evidence tiers (ESV outcome data).
- **`partially_fulfilled`**: nothing pending and a law is in force, but either a `weaker` or `partial` law is all there is, or a high-confidence `full` is blocked as above (a weaker law, or another linked law not yet in force).
- **Overrides.** The judge's lone `full` is not fully reliable, so `tools/sfs-overrides.json` can replace the label for a promise/law pair before any rule runs. The rules above are implemented in `tools/lib/apply-links.ts` (tested); that file's header comment is the authoritative statement.
- **Out of scope for the law step**: `outcome`, `budget`, `other_action` and `vague` promises never get `fulfilled` or `partially_fulfilled` from `apply-links`.
- **`broken`**: needs an explicit contrary act, such as a vote against the promise or a law that does the opposite. A betänkande that rejects motions about the topic, a document that works against the promise (`motverkar`, below) or part of a promise being undelivered is not enough. Never set automatically from judge labels.
- **`no_evidence`**: only after an exhaustive search over a fully ingested term, with the reasoning stating when and what was searched. Never set from a partial backfill.
- **`unfulfilled`, `abandoned`**: only in the term-close review.
- **Prefer `unassessed` over a guess.**
- **Reasoning** is plain Swedish for a reader, not a list of designations. It describes what the documents show in words (who proposed what, when, and whether riksdagen decided). It makes no claim about what does not exist beyond the listed documents ("no decision found") until the term is fully ingested and linked (`hemsida-5n3`), and it does not mention AI or that more documents may exist.
- **Deciding betänkande.** The betänkande that decided a linked proposition (from its own `behandlar` references) is added as evidence next to the proposition, except for budget propositions and bills with many deciding betänkanden.

#### Compound promises

A promise is split into one promise per commitment when the agreement text lists the parts as separate commitments that can be delivered independently, so each part can have its own verdict and `partially_fulfilled` is reserved for one commitment delivered in a weaker form. A package with a single goal (for example one review with three aims) stays one promise. The test is the agreement text, not the number of "och" in the title. Split promises share the same `source.page`, each carries its own quote, and evidence is linked again per part.

#### Documents that work against a promise ("Motverkar")

A document that works against a promise (the judge label `contradicts`) is stored as Riksdag evidence with `relevance: contradicts` and shown in the timeline with the label "Motverkar" (distinct colour, dashed outline). It never counts toward a verdict: `checkVerdictEvidence` ignores it, so it cannot qualify `in_progress`, `fulfilled` or `broken`, and it does not fill a pipeline stage in the timeline. `apply-links` writes it on any eligible promise, but a promise whose only evidence works against it stays `unassessed`.

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
| `relevance`   | enum           | `full` (addresses the whole promise), `partial` (one part of it) or `contradicts` (works against it, "Motverkar", see above)            |
| `note`        | string \| null | Optional Swedish note, e.g. what part is covered or what was watered down                                                               |
| `votes`       | object?        | For `bet` only, later (`hemsida-4np`): party → `yes` / `no` / `abstain` / `absent`                                                      |
| `figures`     | array?         | For `bet` and `prop` only: prose budget intentions found in the text, see "Evidence figures" below                                      |

For `kind: sfs` (a law) the schema also checks the shape: `dok_id` is `sfs-<YYYY>-<N>` (e.g. `sfs-2025-625`), `designation` is `SFS <YYYY>:<N>` and must equal what the `dok_id` says, so the two cannot drift. `title` is the law's title (the SFS register's Rubrik), `date` is the **in-force date** (Ikraft; the earliest when several), not the publication date, and `url` is the official page `https://svenskforfattningssamling.se/doc/<YYYY><N>.html`. `relevance` says whether the law covers the whole promise (`full`) or part of it (`partial`), with the gap in `note`. Amendment acts count too ("Lag (2025:625) om ändring i ...").

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

- **The outcome is not a verdict.** It describes the agreement text and never sets or implies the verdict, which stays a separate call. Agreement evidence alone is never enough for `in_progress` or `fulfilled` (to be enforced with the other evidence-to-verdict constraints in `hemsida-bzj.7`).
- **Agreement is not a pipeline stage.** Stage derivation (dir → sou/ds → prop → bet → sfs) ignores it.
- **References, not copies.** `promises` holds ids only. Riksdag evidence of the linked Tidö promises is not copied onto the manifesto promise; the site shows the linked promise's timeline inline.
- **Schema checks:** `promises` is empty if and only if the outcome is `not_addressed`, and a promise has at most one agreement entry per `source`. A data test checks that every id in `promises` is a promise file in the same term and that `source` is a `government_agreement` source file.

#### Budget evidence

A third evidence kind, `budget`, records a before/after comparison of one anslag (appropriation line) for promises about money. Like `agreement` it is its own branch of the union, strict, and has none of the Riksdag fields.

| Field            | Type              | Notes                                                                                                              |
| ---------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| `kind`           | `budget`          |                                                                                                                    |
| `anslag.kod`     | string            | Restated anslag code as in `src/data/budget/expenditure.json`, with year suffix if discontinued                    |
| `anslag.namn`    | string            | Anslag name in that release, so a reader (and the data test) can see what the code meant                           |
| `anslag.release` | integer           | Last year of the ESV release the code was read from (`meta.years` max, e.g. 2025)                                  |
| `years`          | `{from, to}`      | Years compared, `from` < `to`, within the data range                                                               |
| `amounts`        | `{before, after}` | mn kr, nominal (as in the budget data, not inflation adjusted); `before` is the `from` year, `after` the `to` year |
| `date`           | ISO date          | Places the entry on the timeline, e.g. the date of the budget proposition                                          |
| `relevance`      | enum              | `full` or `partial`, as for Riksdag evidence                                                                       |
| `note`           | string \| null    | Optional Swedish note                                                                                              |

Rules:

- **Stable reference.** Anslag codes are only unique within one release of the ESV data (see `docs/budget-data.md`, Gotchas), so the entry stores `kod` plus `release` and not a route slug. A data test (`src/data/budget-links.test.ts`) checks that `kod` exists in the committed data for that release with the same `namn`; when the data is regenerated from a new release, entries must be re-checked and `release` bumped.
- **Evidence only, never a verdict.** Budget evidence does not qualify any verdict value (`in_progress`, `fulfilled`, `broken`, ...) and is ignored by stage derivation, like `agreement`.
- **Link to `/budget`.** The anslag page does not exist yet; the link is derived from `kod` at build time once the budget pages land (`hemsida-rn4`), so it is not stored in the data.
- **Rendering.** The detail page timeline shows the anslag name, the years, both amounts and the nominal change in Swedish; entries are ordered by `date` together with the Riksdag documents.

#### Evidence figures and the three tiers

Money can be evidenced at three tiers, and they must not be mixed up:

1. **Binding ceiling**: the anslag appropriation voted by the Riksdag (budget evidence, `src/data/budget`).
2. **Actual outcome**: what was spent, ESV utfall (budget data).
3. **Stated intention**: a prose statement in a bet/prop text such as "För 2026 avsätts 1 000 000 000 kronor för ...". This is the `figures` field on Riksdag evidence.

Each figure: `year`, `amount` (mn kr nominal, like budget evidence), `scope` (the document's own Swedish wording of what the money is for), `tier` (always `intention`), `speaker` (`role` is `government`, `committee` or `reservation`, plus an optional `party`) and `quote` (the sentence it was read from). Example from bet 2024/25:SoU1: "För 2024 avsattes 1 600 000 000 kronor för förlossningsvård och kvinnors hälsa. För 2025 avsätts motsvarande belopp."

Figures are only allowed on `bet` and `prop` (enforced like `votes`) and never qualify a verdict: `checkVerdictEvidence` ignores them.

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
- **Manifesto promise vs agreement.** A manifesto promise is its own promise file with its own verdict. The agreement is evidence on it: add one `agreement` entry for the agreement, linking the Tidö promise ids that cover it. A manifesto promise the agreement left out gets `not_addressed` with empty `promises`; the verdict is still a separate call (`not_addressed` does not make it `broken` or `abandoned`).
- **Term ends.** Nothing is set automatically. In the term-close PR Claude assesses every remaining `unassessed` promise, and decides whether `no_evidence` / `in_progress` ones become `unfulfilled`, `broken` or something else. `unassessed` is never turned into `unfulfilled` by default: not having looked is not a finding.

## Decision: JSON, not YAML

Promise files stay JSON. The tooling reads and writes them without an extra dependency or formatting round-trip problems, oxfmt formats them, and PR diffs of single-field changes are already readable. YAML would only make long Swedish text slightly nicer to read.

## Open questions

1. Is `unfulfilled` (term ended) different enough from `broken` (did the opposite) to show separately? This draft says yes.
2. Should verdict reasoning be required for `no_evidence`? Yes: the schema enforces a recorded search (see the constraint table). It is not required for `unassessed`.
3. The four Almedalen 2024 KD promises (`hemsida-bzj.5`): migrate them with `source.kind: speech`, or drop them to keep the dataset Tidö-only for now?

## Area vocabulary

`area` is a fixed list of 20 Swedish areas in `src/schema/areas.ts` (the schema rejects anything else). Free-text labels from extraction are mapped onto it with `tools/area-mapping.json` (grouped by target area) via `node --experimental-strip-types tools/map-areas.ts [--term T] [--apply]`, which also proposes an area from the committee for unmapped labels. Reuse the same list and mapping for 2026-2030; add new areas deliberately.
