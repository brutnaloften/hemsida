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
    statistics/
      <series-id>.json          # one official statistics series (statistic evidence cites these)
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
    "reasoning": "Straffskärpningen för gängbrott trädde i kraft 2023-07-01 …",
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

The verdict is set by Claude, and the schema (`checkVerdictEvidence` in `src/schema/promise.ts`) limits which values the evidence allows. Only the current verdict is checked, not `history`. Riksdag evidence (`dir`, `sou`, `ds`, `prop`, `bet`, `sfs`, `mot`) counts; `agreement` evidence never qualifies a verdict, and `budget` evidence only through the budget rule below (tiered entry, `budget` promise, government or support party, anchoring `prop`/`bet`).

| Verdict                                                    | Enforced requirement                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unassessed`                                               | None                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `not_assessable`                                           | None beyond the general rule that reasoning is non-empty                                                                                                                                                                                                                                                                                                                                                                                  |
| `in_progress`                                              | At least one evidence entry of kind `dir`, `sou`, `ds` or `prop`; for a `budget` promise alternatively a tiered `budget` entry plus a `prop` or `bet`; for an opposition-only `budget` promise alternatively a `mot` entry                                                                                                                                                                                                                |
| `fulfilled`, `partially_fulfilled`                         | At least one evidence entry of kind `sfs` (an issued law; its `date` is the in-force date and may be in the future, see below); for an `inquiry` promise instead at least one `dir` entry (the inquiry directive); for a `budget` promise alternatively an `outcome`-tier `budget` entry plus a `prop` or `bet` or, for an opposition-only `budget` promise, a `mot` entry (`relevance: full` for `fulfilled`; see "Budget verdict rule") |
| `fulfilled`, `partially_fulfilled` on an `outcome` promise | Only through the statistic rule (see "Statistic evidence"): a `statistic` entry plus a `prop`, `bet` or `sfs` entry, government or support party. A law alone does not settle an outcome promise                                                                                                                                                                                                                                          |
| `broken`                                                   | A `bet` evidence entry with `votes` (the voting record; there is no separate `votering` kind), or reasoning that contains the `designation` of a Riksdag evidence entry (the document documenting the reversal). For an opposition-only `budget` promise instead: a `mot` entry with `relevance: contradicts` (the party's own motion rejecting the targeted funding) and reasoning that cites its designation, see "Opposition promises" |
| `no_evidence`                                              | Reasoning contains an ISO date (`YYYY-MM-DD`) and names what was searched: the promise's `committee` or at least one of its `keywords` (case-insensitive). If the promise has neither, reasoning must be at least 30 characters                                                                                                                                                                                                           |
| `unfulfilled`, `abandoned`                                 | None beyond non-empty reasoning                                                                                                                                                                                                                                                                                                                                                                                                           |

The `no_evidence` check is pragmatic: it cannot verify that a search really happened, only that one is recorded with a date and a search target.

#### Rules for setting a verdict from evidence

These are the working rules for the model that sets verdicts. `checkVerdictEvidence` enforces the evidence floors above; the rest is policy that the reasoning has to be consistent with. One verdict value per promise: there are no combination values such as "partially fulfilled / rest in progress". The reasoning says which part is done and which is still moving.

- **How the law is found.** A law is never searched for by title. It is reached through a proposition that is already evidence on the promise: the SFS register lists the Förarbeten of every law (`Prop. <rm>:<nr>`), and `ingest-sfs` records which laws cite which proposition (`docs/riksdag-api.md`, "SFS register"). The SFS judge then labels how much of the promise each law delivers (`full`, `partial`, `weaker`, `none`; `docs/riksdag-linking.md`). Only `legislative` promises are considered; skrivelser are excluded, and a budget proposition counts (as decided and as pending) only when one of its laws has a non-`none` judgement for the promise, and `none` laws and laws with no in-force date are not added as evidence. **A law counts once it is issued (utfärdad), whether or not it is in force yet** (decision by Andreas, `hemsida-d8i.8`): the government's part is done when the law is adopted, so a law that applies only from e.g. 2027-01-01 can make a promise `fulfilled` or `partially_fulfilled`. `checkVerdictEvidence` only requires an `sfs` entry; the in-force date is on the entry, and the reasoning must state it (future tense, "träder i kraft", for a date still ahead; never "trädde i kraft"). A law with no known in-force date gets no `sfs` entry, as before.
- **`in_progress`**: at least one dir, sou, ds or prop is linked and no issued law is linked yet. It also applies when a law exists but work is pending: another linked proposition with no (dated) law, or a linked dir, sou or ds dated after the newest proposition that has a law. A `full` judged below `high` confidence is unconfirmed: when it is the only law evidence the promise stays `in_progress` with the sfs entry attached (next to a `partial` or `weaker` law the result is `partially_fulfilled`). A proposition whose only laws have no in-force date counts as having no law. A betänkande alone only rejects motions and is not enough.
- **`fulfilled`**: nothing pending, a law judged `full` at `high` confidence is linked, no linked law is judged `weaker`, and no judged law is undated (an undated law on the same proposition blocks it; a law with a future in-force date does not). Only for a commitment delivered by a law; budget promises use the budget verdict rule below instead of a law.
- **`partially_fulfilled`**: nothing pending and at least one of these holds: a linked law is judged `partial` or `weaker`, or a high-confidence `full` is blocked from `fulfilled` (a `weaker` law is linked, or another judged law has no in-force date). A lone `full` below `high` confidence does not qualify (`in_progress`).
- **Laws without a proposition.** A law adopted on a committee initiative (a betänkande with no proposition) counts like any other issued law; it is not found by the proposition index, so it is added by hand as an `sfs` evidence entry with a `tools/sfs-overrides.json` entry that records why (decision in `hemsida-dl5.12`, SFS 2024:238).
- **Overrides.** The judge's lone `full` is not fully reliable, so `tools/sfs-overrides.json` can replace the label for a promise/law pair before any rule runs. The rules above are implemented in `tools/lib/apply-links.ts` (tested); that file's header comment is the authoritative statement.
- **Inquiry promises** (`type: inquiry`, "utreda X"; decision by Andreas, `hemsida-02a`): met once the government has appointed the inquiry, so no law is looked for. `fulfilled` when a linked kommittédirektiv (`dir`) is judged `match` at `high` confidence (it sets up the whole inquiry the promise asks for), `partially_fulfilled` when a directive is judged `partial` at `high` confidence, otherwise `in_progress`. A later SOU, Ds or proposition is shown as evidence and never blocks or changes the verdict (the "newer dir/sou/ds keeps `in_progress`" rule above is for legislative promises only). `checkVerdictEvidence` requires a supporting `dir` entry instead of `sfs` for these promises. The reasoning says that the government appointed the inquiry by directive on its date, names a delivered SOU if one is linked, and says nothing about laws or absent content (the validator rejects both).
- **Out of scope for the law step**: `outcome`, `budget`, `other_action` and `vague` promises never get `fulfilled` or `partially_fulfilled` from `apply-links`.
- **Outcome promises stay `unassessed` for now** (`hemsida-dl5.2`). The model has no outcome-data path yet: the evidence kinds are Riksdag documents and `checkVerdictEvidence` only knows laws and directives, so nothing can show that a measured result (police numbers, charging stations, queue times, emissions) was reached. A law, budget or inquiry on the same topic proves action, not the outcome, and a verdict from it would be a guess. The 59 unassessed `outcome` promises of 2022-2026 are therefore left unassessed until the outcome epic (`hemsida-50r`, SCB/BRÅ/ESV statistics) provides a data source; the term-close review then decides what to do with the ones that remain. Do not set `in_progress` or `no_evidence` on them from Riksdag documents alone. The 8 outcome promises that were already `in_progress` before this bead fall under the same reasoning: their verdict rests on action, not on a measured result, and the term-close review (or the outcome epic) revisits them.
- **`broken`**: needs an explicit contrary act, such as a vote against the promise or a law that does the opposite. A betänkande that rejects motions about the topic, a document that works against the promise (`motverkar`, below) or part of a promise being undelivered is not enough. The one case where a `contradicts` entry does back `broken` is an opposition party's own budget motion rejecting the funding for its own promise (see "Opposition promises"). Never set automatically from judge labels.
- **`no_evidence`**: only after an exhaustive search over a fully ingested term, with the reasoning stating when and what was searched. Never set from a partial backfill.
- **`unfulfilled`, `abandoned`**: only in the term-close review.
- **Prefer `unassessed` over a guess.**
- **Reasoning** is plain Swedish for a reader, not a list of designations. It describes what the documents show in words (who proposed what, when, and whether riksdagen decided). It makes no claim about what does not exist beyond the listed documents ("no decision found") until the term is fully ingested and linked (`hemsida-5n3`), and it does not mention AI or that more documents may exist.
- **Deciding betänkande.** The betänkande that decided a linked proposition (from its own `behandlar` references) is added as evidence next to the proposition, except for budget propositions and bills with many deciding betänkanden.

#### Budget verdict rule

Decided in `hemsida-dl5.6` (user decisions 2026-11-23). It lets ESV data qualify a verdict for a promise of `type: budget`; the spike behind it is `docs/budget-promises.md`.

- **Nominal figures decide.** The comparison is the NOMINAL change of the anslag between the baseline and the end year, as the Riksdag votes it. Real (KPI-deflated) figures are context for the reasoning and the promise page and never qualify or block a verdict. This supersedes the spike's "a rise counts only if real rises" (and settles its inconsistency between the two places that stated it: a nominal-only rise now supports the verdict). `src/lib/budget/promise-comparison.ts` (`compareAnslag`, `compareAnslagFromData`) computes the nominal change, its direction and the real figure as context from `src/data/budget/expenditure.json`.
- **Conventions.** Baseline is the 2022 outcome (`utfall`), the last full year before the first budget of the term; the end year is 2025, the latest ESV outcome year. A different baseline (one-offs, discontinued anslag) is stated in `baselineNote`. Reasoning gives both nominal amounts and the nominal change; it may add the real change as context.
- **Tiers.** `outcome` (what was spent) can support `partially_fulfilled` and `fulfilled`; `ceiling` (what the Riksdag voted) only `in_progress`. Stated intention (`figures`, `prop_text` promises) never qualifies. An entry without `tier` never qualifies.
- **Anchor required.** The promise must also carry a `prop` or `bet` that introduces or changes the money: an anslag name does not show whose decision it was. Enforced by `checkVerdictEvidence`.
- **Enforced floors.** For a `budget` promise with at least one party in `government` or `support`: `in_progress` accepts a tiered budget entry plus `prop`/`bet` (besides the usual `dir`/`sou`/`ds`/`prop`); `partially_fulfilled` needs an `outcome` entry plus `prop`/`bet`; `fulfilled` additionally needs that outcome entry to have `relevance: full`. An `sfs` entry still qualifies as before.
- **Policy, not enforced by the schema.** The schema only checks that the entries exist; it does not know the promised direction. A falling outcome must therefore not back `fulfilled` for an "öka" promise, and `broken` and `unfulfilled` are never set from ESV budget data (an opposition party's own contrary motion is a different thing, see "Opposition promises"). Reviewers of budget verdict PRs (dl5.7) must check the nominal direction against the promise.
- **Policy (not enforced).** `fulfilled` when the nominal change goes in the promised direction for all of the promised anslag and the entry covers the whole promise; `partially_fulfilled` when it covers only part (several anslag, one of them moving the other way, or `relevance: partial`); a nominal move against the promise is not `fulfilled` and is not set as `broken` (that needs an explicit contrary act, for an opposition-only promise a `contradicts` mot entry) or `unfulfilled` (term-close only): leave it for the term-close review. Prefer `unassessed` when the anslag does not match the promise's scope.
- **Mixed promises.** A promise with both a government or support party and an opposition party has one verdict and uses budget evidence for it (none exists yet).
- **Opposition promises.** This paragraph is about `budget` promises. A `legislative` promise by an opposition party is judged like any other: a law that the government and Riksdag passed on its topic counts (as for `val2022-c-kriminalisera-*`), and the reasoning says who proposed it. A `budget` promise whose parties are all in `opposition` is judged only on what that party itself did to make it happen (a motion, its own budget alternative, a vote against its own promise), with the usual evidence kinds; ESV data measures the government's budget and is never used against them. With no such act the verdict is `not_assessable`. The schema enforces the first half (budget evidence never qualifies an opposition-only promise); the `not_assessable` choice is policy. The party's own act is a `mot` evidence entry (its motion or budget alternative, e.g. Mot. 2024/25:3125 for S in Bet. 2024/25:TU1): for an opposition-only `budget` promise it qualifies `in_progress` and `partially_fulfilled`, and `fulfilled` when the entry has `relevance: full` (`checkVerdictEvidence`). The reasoning gives the nominal figures the motion proposes relative to the government's proposal, says that riksdagen rejected them, and never uses ESV outcome data. For an opposition promise `fulfilled` means the party proposed all of it (not that anything was decided or delivered); `partially_fulfilled` means it proposed part of it. A motion that does not cover the promise's money is not linked; without one the verdict is `not_assessable`.

  **Contrary act (`broken`).** The party's own motion can also work against its own promise. `broken` on an opposition-only `budget` promise is set when a `mot` entry with `relevance: contradicts` shows that the party's own budget motion rejects or cuts the government's targeted money for the very topic of the promise (verified in the motion text: a table line or a yrkande that removes the funding, with the reason the motion gives) and the motion does not provide equivalent funding for the promise's measure. It is the party's own act, not ESV data, so it does not conflict with the budget rule further down that `broken` is never set from ESV budget data. `checkVerdictEvidence` enforces the evidence: for an opposition-only budget promise `broken` needs a `mot` entry with `relevance: contradicts` and reasoning that cites that motion's designation, and a vote or a cited document does not stand in for it. Other promise types keep the old rule. The reasoning names the motion, the table line or yrkande, the year and the betänkande that rejected the motion, and discloses what the party's other motions did for the topic in the other years.

  What does not qualify: (1) money moved into a broader sector grant that the motion says covers the topic (for example a general "Sektorsbidrag till skolan och förskolan" replacing earlier targeted grants), and (2) a cut whose direction or topic match is uncertain. In those cases the verdict stays `not_assessable` or `unassessed` (or `partially_fulfilled` if other motions propose part of the promise), and the reasoning discloses the cut and the sector grant.

  **When the years conflict.** A contrary act in one year does not cancel proposals in another. If the party's own motions never propose the promise's measure in any year, the contrary act decides: `broken` (the cut stands even if later motions are silent, since later silence is not support). If a motion in another year proposes (part of) the measure, the verdict follows the proposals: `partially_fulfilled`, with the contrary motion linked as `contradicts` and the cut disclosed in the reasoning. An earlier contrary act is not weighed against a later proposal to reach `broken`.

#### Compound promises

A promise is split into one promise per commitment when the agreement text lists the parts as separate commitments that can be delivered independently, so each part can have its own verdict and `partially_fulfilled` is reserved for one commitment delivered in a weaker form. A package with a single goal (for example one review with three aims) stays one promise. The test is the agreement text, not the number of "och" in the title. Split promises share the same `source.page`, each carries its own quote, and evidence is linked again per part.

#### Documents that work against a promise ("Motverkar")

A document that works against a promise (the judge label `contradicts`) is stored as Riksdag evidence with `relevance: contradicts` and shown in the timeline with the label "Motverkar" (distinct colour, dashed outline). It never counts toward a verdict: `checkVerdictEvidence` ignores it, so it cannot qualify `in_progress` or `fulfilled`, and it cannot qualify `broken` except as an opposition party's own contrary `mot` entry on its own opposition-only budget promise ("Opposition promises"), and it does not fill a pipeline stage in the timeline. `apply-links` writes it on any eligible promise, but a promise whose only evidence works against it stays `unassessed`.

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
| `votes`       | object?        | For `bet` only: the parties' positions on the decision vote (see "Votes on bet evidence"). party → `yes` / `no` / `abstain` / `absent`  |
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

| Field            | Type              | Notes                                                                                                                                            |
| ---------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `kind`           | `budget`          |                                                                                                                                                  |
| `anslag.kod`     | string            | Restated anslag code as in `src/data/budget/expenditure.json`, with year suffix if discontinued                                                  |
| `anslag.namn`    | string            | Anslag name in that release, so a reader (and the data test) can see what the code meant                                                         |
| `anslag.release` | integer           | Last year of the ESV release the code was read from (`meta.years` max, e.g. 2025)                                                                |
| `years`          | `{from, to}`      | Years compared, `from` < `to`, within the data range                                                                                             |
| `amounts`        | `{before, after}` | mn kr, nominal (as in the budget data, not inflation adjusted); `before` is the `from` year, `after` the `to` year                               |
| `tier`           | enum?             | `ceiling` (voted appropriation, `budget` plus `andrad`) or `outcome` (ESV `utfall`). Optional; an entry without a tier never qualifies a verdict |
| `baselineNote`   | string?           | Swedish note on the baseline when it is not the 2022 outcome (one-offs such as covid or elpris money, discontinued anslag)                       |
| `date`           | ISO date          | Places the entry on the timeline, e.g. the date of the budget proposition                                                                        |
| `relevance`      | enum              | `full` or `partial`, as for Riksdag evidence                                                                                                     |
| `note`           | string \| null    | Optional Swedish note                                                                                                                            |

Rules:

- **Stable reference.** Anslag codes are only unique within one release of the ESV data (see `docs/budget-data.md`, Gotchas), so the entry stores `kod` plus `release` and not a route slug. A data test (`src/data/budget-links.test.ts`) checks that `kod` exists in the committed data for that release with the same `namn`; when the data is regenerated from a new release, entries must be re-checked and `release` bumped.
- **Verdicts.** An entry qualifies a verdict only through the budget verdict rule below; `broken` and `unfulfilled` are never set from it. It is ignored by stage derivation, like `agreement`.
- **Link to `/budget`.** The anslag page does not exist yet; the link is derived from `kod` at build time once the budget pages land (`hemsida-rn4`), so it is not stored in the data.
- **Rendering.** The detail page timeline shows the anslag name, the years, both amounts and the nominal change in Swedish; entries are ordered by `date` together with the Riksdag documents.

#### Statistic evidence

A fourth evidence kind, `statistic`, records a measured result from an official statistics series for promises about outcomes (`type: outcome`). The design and the worked examples are in `docs/outcome-promises.md`. It is its own strict branch of the union with none of the Riksdag fields, and `isRiksdagEvidence` is false for it. There is no `tier` field: every statistic is a measured result.

| Field           | Type             | Notes                                                                                                              |
| --------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| `kind`          | `statistic`      |                                                                                                                    |
| `series`        | slug             | Id of a series file in `src/data/<term>/statistics/` (same term as the promise)                                    |
| `baseline`      | `{period, v}`    | Normally 2022; `baselineNote` (Swedish) when it differs                                                            |
| `latest`        | `{period, v}`    | Latest period at the series' `fetched_at`; `latest.period` must be after `baseline.period`                         |
| `target`        | object           | `{type: "threshold", op: "gte"/"lte", value, byYear?}`, `{type: "direction", op: "up"/"down"}` or `{type: "none"}` |
| `relevance`     | `full`/`partial` | `partial` when the series is a proxy or covers only part of the promise                                            |
| `inflationNote` | string?          | Swedish note with the inflation-adjusted change; required (data test) when the series has a `priceBasis`           |
| `date`          | ISO date         | Release date of the latest period, places the entry on the timeline                                                |
| `note`          | string \| null   | Optional Swedish note                                                                                              |

A series file (`statisticSeriesSchema`) holds `id`, `source` (`scb`, `bra`, `migrationsverket`, `skolverket`, `socialstyrelsen`, `energimyndigheten`, `trafikanalys`, `polisen`, `other`), `table`, `selection` (the exact query, so it can be re-run), `label`, `unit`, `frequency`, `fetched_at`, an optional `priceBasis` (`nominal` or `real`) and `values` keyed by period. It is loaded as the `statistics` content collection.

Rules:

- **Data test** (`src/data/statistics-links.test.ts`, `statisticRefProblems` in `src/lib/statistic-evidence.ts`): the series exists in the same term, both periods exist in it and `baseline.v` and `latest.v` equal the file's values.
- **Verdicts, enforced** (`checkVerdictEvidence`): for an `outcome` promise with a government or support party, `partially_fulfilled` needs a `statistic` entry whose series moved from baseline to latest in the direction the target asks for (or reached its threshold) plus a `prop`, `bet` or `sfs` entry that is not `contradicts`; `fulfilled` needs the same with `relevance: full`, the target reached at `latest` (threshold level, or a direction target met), and a `byYear` no later than the end of the term. A law alone no longer settles an outcome promise. A statistic shows the result, not the cause, so the reasoning must say that and the action evidence must be there. `in_progress` is unchanged (a statistic alone never sets it).
- **Never from a statistic:** `broken` (needs an explicit contrary act) and `unfulfilled` (term-close review only). A series moving against the promise qualifies nothing and is left for the term-close review. Opposition-only promises are never qualified by a statistic.
- **Price series (fuel):** compare nominal against nominal (`priceBasis: nominal`, the entry shows "nominellt") and give the inflation-adjusted change (KPI, `TAB4352` in `macro.json`) in `inflationNote` and in the reasoning, because 2022 was a price spike. The data test fails an entry on a price series without `inflationNote`.
- **Rendering.** The promise page timeline shows the series label, baseline and latest with units, the change, the target and the notes in Swedish, and says that a statistic shows the outcome, not its cause (`StatisticEntry.astro`). Entries are ordered by `date` with the Riksdag documents.

#### Evidence figures and the three tiers

Money can be evidenced at three tiers, and they must not be mixed up:

1. **Binding ceiling**: the anslag appropriation voted by the Riksdag (budget evidence, `src/data/budget`).
2. **Actual outcome**: what was spent, ESV utfall (budget data).
3. **Stated intention**: a prose statement in a bet/prop text such as "För 2026 avsätts 1 000 000 000 kronor för ...". This is the `figures` field on Riksdag evidence.

Each figure: `year`, `amount` (mn kr nominal, like budget evidence), `scope` (the document's own Swedish wording of what the money is for), `tier` (always `intention`), `speaker` (`role` is one of `government`, `committee`, `reservation` or `statement` (see below), plus an optional `party`) and `quote` (the sentence it was read from). Example from bet 2024/25:SoU1: "För 2024 avsattes 1 600 000 000 kronor för förlossningsvård och kvinnors hälsa. För 2025 avsätts motsvarande belopp."

Speaker roles: `government` (the proposition's own wording), `committee` (the committee's own wording), `reservation` (a party's formal reservation, voted on) and `statement` (a party's särskilt yttrande, a statement attached to the betänkande that is not voted on; in budget betänkanden the opposition uses it to abstain from the vote and give its own budget alternative). The text parser's `SpeakerKind` `special_statement` (`tools/lib/eval-summary.ts`) corresponds to `statement`.

Figures are only allowed on `bet` and `prop` (enforced like `votes`) and never qualify a verdict: `checkVerdictEvidence` ignores them.

### Rejected candidates

`src/data/<term>/rejected-candidates.json` holds `(promise_id, dok_id)` pairs that the matcher proposed and review rejected. The search skips these pairs, so the same document isn't proposed twice and promise files stay clean. Schema: `src/schema/rejected.ts`.

`tools/apply-links.ts` reads the same file: a listed document (or an `sfs-YYYY-N` law, which is how SFS evidence is keyed) never becomes evidence on that promise, entries already there are dropped, and a promise left without supporting dir/sou/ds/prop evidence stays `unassessed`. Add a row whenever a link is reverted as off topic or evidence is removed by hand, otherwise a rerun of `apply-links` promotes it again. A dry run (`apply-links --dry-run`) prints each promise's evidence diff (`+dok_id` / `-dok_id`), so an empty list confirms the rejections hold.

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

- **The promise is an inquiry.** Use type `inquiry`. It is `fulfilled` once the inquiry directive exists (a `dir` evidence entry judged `match` at `high` confidence); a later SOU is shown as evidence only. See "Inquiry promises" under the verdict rules (bead `hemsida-02a`).
- **A bill is watered down.** The law is written as `relevance: partial` (a weaker law is also `partial`, with the gap in `note`), the verdict is `partially_fulfilled`, and the reasoning says what is missing.
- **Several laws for one promise.** Each law is its own evidence entry, typically `relevance: partial`. The verdict reflects the whole.
- **A promise not to do something** ("inte höja skatten"). Such a promise is met by not legislating, so there is no law to cite. Today it stays `in_progress` (or `unassessed`) until a term-end review; `fulfilled` needs an `sfs` entry, so it cannot be set for a promise with no law, and `broken` needs a contrary act with evidence. The term-close review decides what to do with these.
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

## Votes on bet evidence

`votes` on a `bet` evidence entry records how each party voted on the committee's proposal in the **sakfråga** (the decision), never the motivfråga. "yes" is a yes to the committee's proposal, which can be to adopt or to reject something (read the point's `rubrik`). The point is stored next to the votes as `vote_point` (`punkt`, `rubrik`, `votering_id`) and shown on the page; `vote_point` is only valid together with `votes`. A party whose members split evenly is left out, and the speaker's row is ignored.

Because evidence has no committee point, `tools/fill-votes.ts` picks it: the one point whose proposal text cites a proposition from the promise's own `prop` evidence ("bifaller riksdagen proposition 2023/24:19"). Proposition lists after "punkterna ..." are not followed, which errs on the side of reporting. Several points citing the proposition (even if only one is voted), zero candidate points, `partial` evidence (it delivers only part of the promise), a point decided by acklamation, or an unclear vote kind are reported in `tools/out/fill-votes-report.json` and left unfilled, never guessed. Also left unfilled: a point whose `rubrik` mentions _vilande_ or whose proposal says "som vilande" (a first reading of a constitutional change, or a vilandeförklaring, is not the adoption of the law); a budget frame vote (`rubrik` starting with "Utgiftsram" or containing "rambeslut", since a whole-budget vote says little about one promise); and an ändringsbudget point ("ändringsbudget" or "ändrade ramar för utgiftsområden" in `rubrik` or the proposal text). Promises without `prop` evidence are not filled.

```text
node --experimental-strip-types tools/fill-votes.ts --dry-run [--term T] [--id-prefix tido-] [--id <promise>] [--refresh]
```

Requests are cached in `tools/out/votes-cache/` (`--refresh` re-evaluates entries that already have votes but does not bypass that cache; delete the directory to refetch) and paced at 1 per second. Votes never change a verdict: `broken` still needs an explicit contrary act (see the verdict rules). The promise page shows them under the Riksdag document ("Så röstade partierna") with party chip, a symbol and the word per vote; colours are the `--vote-*` variables in `globals.css`, contrast-tested.
