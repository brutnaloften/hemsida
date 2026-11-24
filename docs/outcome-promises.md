# Outcome promises: what statistics can answer them

Survey and design for the outcome epic (`hemsida-50r`). It is docs only: no schema change, no verdict. It answers four questions: which `outcome` promises can official statistics answer, what the current model can and cannot say about them, which APIs were probed, and in what order to do the work.

## Scope and headline numbers

Counted on `main` (2022-2026): 86 promises have `type: outcome`, all with a verdict of `unassessed` or `in_progress` that rests on action rather than on a measured result (`docs/data-model.md`, "Outcome promises stay unassessed for now").

- 54 have a `government` or `support` party in `roles`. Statistics can say something about these.
- 32 are opposition-only (C, MP, S, V). Official statistics measure what the government delivered, not what the opposition promised, so statistics should never count against them. Today they are `unassessed` (`docs/data-model.md`, "Outcome promises stay unassessed for now"). **Proposal, needs a decision:** treat them like the opposition-only budget promises (the rule in `docs/data-model.md` under "Budget verdict rule", which is written for ESV data) and set `not_assessable` unless the party itself acted, with statistics shown only as context. That is not current policy for outcome promises. They are listed at the end and need no statistics work.
- The 19 promises retyped to `outcome` in `hemsida-600` (bead `hemsida-ukhd`) are all in the 54. See "The 19 retyped promises".

Of the 54: 3 are answerable now from an official series reachable through an API or open download (`yes`), 40 are `partial` (a series exists but is not an open API, only a proxy exists, or the promise has a date or a regional or qualitative part that a single figure cannot settle), and 11 are `no` (no measurable quantity, or the claim is a decision or event rather than a statistic).

## How outcome verdicts work today

- Evidence kinds are Riksdag documents (`dir`, `sou`, `ds`, `prop`, `bet`, `sfs`, `mot`), `agreement` and `budget` (`src/schema/promise.ts`). There is **no statistics kind**.
- `checkVerdictEvidence` only knows laws, directives and, for `budget` promises, ESV outcome entries (plus a `mot` entry for an opposition-only `budget` promise). A law or budget on the same topic proves action, not the result, so outcome promises were deliberately left `unassessed`.
- The budget flow is the closest precedent: a `budget` evidence entry stores a before/after pair read from committed data (`src/data/budget`), with a `tier` (`ceiling` or `outcome`), a `baselineNote`, a stable reference checked by a data test (`budget-links.test.ts`) and a policy that a figure moving the wrong way never backs `fulfilled` and never sets `broken` or `unfulfilled`.
- `src/data/budget/macro.json` already holds two SCB series (KPI `TAB4352`, GDP `TAB3610`) fetched by `tools/ingest-macro.ts` through PxWebApi v2, with `source`, `fetched_at` and a values map by year. That is the pattern to reuse for outcome series.

## Proposed minimal extension (design only)

Add one evidence branch, `statistic`, built like `budget`, plus a small shared series store.

### Series store

`src/data/<term>/statistics/<series-id>.json`, one file per series, written by an ingest tool (the macro pattern):

```json
{
  "id": "scb-undersysselsatta-15-74",
  "source": "scb",
  "table": "TAB2876",
  "selection": {
    "Arbetskraftsutbud": "3",
    "Kon": "1+2",
    "Alder": "tot15-74",
    "ContentsCode": "AM0401UT"
  },
  "label": "Undersysselsatta 15-74 år",
  "unit": "1000-tal personer",
  "frequency": "year",
  "fetched_at": "2026-11-24",
  "values": { "2022": 299, "2023": 337.2, "2024": 350.9, "2025": 376.3 }
}
```

The same file serves every promise that needs the series (police numbers back four promises, two of them government promises). `source` is an enum (`scb`, `bra`, `migrationsverket`, `skolverket`, `socialstyrelsen`, `energimyndigheten`, `trafikanalys`, `polisen`, `other`); `selection` keeps the exact query so a reader can re-run it.

### Evidence entry

`kind: statistic`, strict, none of the Riksdag fields (like `budget`). There is no `tier` field: every statistic is by definition a measured result, so the tier distinction of budget evidence does not apply. `isRiksdagEvidence` (`src/schema/promise.ts`) must be updated so the new kind is not treated as a Riksdag document (bead `hemsida-50r.2`).

| Field       | Type             | Notes                                                                                                                     |
| ----------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `kind`      | `statistic`      |                                                                                                                           |
| `series`    | slug             | Id of a series file in the same term; a data test checks it exists                                                        |
| `baseline`  | `{period, v}`    | Normally 2022, the last full year before the term; `baselineNote` (Swedish) when it differs                               |
| `latest`    | `{period, v}`    | The latest period at `fetched_at`; the data test checks both values against the series file                               |
| `target`    | object           | `{type: "threshold", op: "gte" or "lte", value, byYear?}`, `{type: "direction", op: "up" or "down"}`, or `{type: "none"}` |
| `relevance` | `full`/`partial` | `partial` when the series is a proxy or covers only part of the promise                                                   |
| `date`      | ISO date         | Release date of the latest period, to place it on the timeline                                                            |
| `note`      | string or null   | Swedish note                                                                                                              |

### Verdict rule (policy first, enforcement later)

- `in_progress`: unchanged, still needs Riksdag action evidence. A statistic alone never sets it.
- `partially_fulfilled`: a `statistic` entry exists and the series moved in the promised direction, but the target was not reached or the entry is `relevance: partial`. Needs the promise's action evidence too (`prop`, `bet` or `sfs`) for government parties, so a number that moved for other reasons does not credit the government alone. The reasoning must say that a statistic shows the result, not the cause.
- `fulfilled`: `relevance: full`, a `threshold` target reached at `latest`, or a `direction` target met with the baseline and latest both stated, plus the same action-evidence floor as `partially_fulfilled` for a promise with a government or support party (a `prop`, `bet` or `sfs` entry; same shape as the budget rule in `docs/data-model.md`, where `fulfilled` additionally needs `relevance: full`). Promises with a `byYear` after the term (for example 2030, 2045) cannot be `fulfilled` from this evidence before that year.
- A series moving against the promise is never `fulfilled`, and, as for budget data, never sets `broken` (needs an explicit contrary act) or `unfulfilled` (term-close review only). It is shown on the page and left for the term-close review.
- Opposition-only promises: no `statistic` entry qualifies a verdict. Whether they become `not_assessable` is the proposal above and needs a decision.
- Price series (fuel) need a stated rule: compare nominal against nominal, and give the inflation-adjusted change (KPI `TAB4352` in `macro.json`) in the reasoning, because 2022 was a price spike.

### Worked examples (verified values, see the probe log)

1. **`val2022-m-minska-ofrivilligt-deltidsarbete`** (M, direction "minska"). Series `scb-undersysselsatta-15-74` (`TAB2876`). Baseline 2022: 299 thousand; latest 2025: 376.3 thousand. Target `direction down`, not met. Verdict stays `in_progress` or `unassessed`; the timeline shows the rise; the term-close review decides. Caveat in the note: "undersysselsatta" (people who work part time and want more hours) is SCB's measure of involuntary part time.
2. **`val2022-l-mer-sol-och-vindkraft-i-hela-landet`** (L, direction "mer", "i hela landet"). Series `TAB4063` installed capacity, riket: wind 14 278 MW (2022) to 18 127 MW (2025), solar 2 367 MW to 5 542 MW. Target `direction up`, met nationally. "I hela landet" is a regional claim, so the entry is `relevance: partial` until the four elområden (SE1-SE4, same table) are each shown to rise. Verdict ceiling: `partially_fulfilled` with action evidence, never `fulfilled` on the national total alone.
3. **`val2022-sd-oka-bostadsbyggandet`** (SD, direction "ökar"). Series `TAB4193` (finished dwellings in newly built houses, summed over house type and tenure): 54 018 (2022), 65 595 (2023), 45 475 (2024), 31 359 (2025). Target `direction up` from a 2022 baseline: not met at 2025. No verdict from it; the entry documents the fall. The 2025 figure is the latest release and may be revised, hence `fetched_at` and the data test.

Not implemented here. Schema, data test and rendering are separate beads (see "Beads filed").

## Probe log

Probed 2026-11-24. Everything below was read from the live source; nothing is filled in from memory.

**SCB PxWebApi v2** (`https://statistikdatabasen.scb.se/api/v2`; `tools/ingest-macro.ts` uses the older base `api.scb.se/OV0104/v2beta`, see `tools/lib/macro-ingest.ts`, which should be reconciled in the ingest bead): works without a key, CC0 licence, CORS on, `json-stat2`/`csv`/`xlsx`, limit 30 calls per 10 s and 150 000 cells per call (same API version as `tools/ingest-macro.ts`). Table search is semantic and patchy (several obvious queries return nothing), so tables must be located once and pinned by id.

| Quantity                                          | Table     | Selection read                         | Values read                                                                                                                                 |
| ------------------------------------------------- | --------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Finished dwellings, newly built, by tenure        | `TAB4193` | Riket, FLERBO + SMÅHUS, tenure 1-3     | Total 2022 54 018; 2023 65 595; 2024 45 475; 2025 31 359 (sum of 6 cells). Rented (hyresrätt) both types: 27 579; 34 071; 24 464; 18 681    |
| Under-employed people (AKU)                       | `TAB2876` | undersysselsatta, totalt, 15-74 år     | 299.0; 337.2; 350.9; 376.3 thousand (2022-2025)                                                                                             |
| Unemployment rate (AKU)                           | `TAB2891` | arbetslösa, totalt, 15-74, procent     | 7.5; 7.7; 8.4; 8.8 percent (2022-2025)                                                                                                      |
| Employed with 1-19 contracted hours (AKU)         | `TAB3007` | 1-19 timmar, 15-74                     | 271.0 (2022); 277.8 thousand (2025); all employed 5 199 and 5 263 thousand                                                                  |
| Installed capacity and gross production by source | `TAB4063` | Riket                                  | Wind 14 278 MW, 33 253 GWh (2022) to 18 127 MW, 39 166 GWh (2025); solar 2 367 to 5 542 MW; nuclear 6 901 to 7 001 MW, 51 944 to 46 392 GWh |
| Electricity supply and gross import               | `TAB1010` | Tot, Imp, netto                        | Supply 176 160 (2022), 172 123 (2025); gross import 6 181, 5 169 (GWh). Import is gross: Sweden is a net exporter                           |
| Tax revenue as share of GDP                       | `TAB121`  | ODD Totala skatter, andel av BNP       | 42.9 (2022); 41.7; 40.8; 40.5 percent (2025)                                                                                                |
| Formally protected nature, share                  | `TAB6829` | Riket, total (overlap removed)         | Land 13.9 percent (2022), 14.3 (2025); land and water 15.0, 15.7                                                                            |
| Greenhouse gas emissions, national total          | `TAB4698` | CO2-ekv., 0.1 excl. LULUCF and intl.   | 45 168 (2022); 44 233.6; 47 493.7 kt (2024). Domestic transport 13 950.8; 13 900; 16 847.9 kt                                               |
| Police employed (SSYK 336)                        | `TAB4355` | Poliser, all birth regions, both sexes | 14 218 (2022); 19 755 (2024), all birth regions incl. South America                                                                         |

Two readings must not be used as they stand, and the ingest bead has to resolve them first:

- **`TAB4698` 2024** jumps by about 3 300 kt in the national total and about 2 900 kt in domestic transport against 2023. A 20 percent rise in one year is unlikely to be a method change. It fits the cut of the biofuel blending requirement (reduktionsplikt) to 6 percent from 2024, which raises fossil emissions in domestic transport and in work machinery, but this is a hypothesis. Verify against the table footnotes and the Naturvårdsverket release before using 2024.
- **`TAB4355` police** rises 39 percent in two years, which is far larger than the police authority's own staffing. The register-based occupation coding is not a reliable police-headcount series. Use Polismyndigheten's own staffing statistics for the police promises and keep `TAB4355` out.

**Other sources:**

- **Migrationsverket** open data (`migrationsverket.se/om-migrationsverket/statistik/oppna-data.html`): `.xlsx` downloads, no REST API. The current-year overview file has a "Vidarebosättning (Kvot)" row: 9 first-time permits and 57 extensions, January to November 2026. Per-year history for 2022-2025 is in the year files, not read yet; the 900 per year target needs it.
- **BRÅ**: `bra.se` is reachable (HTTP 200); `statistik.bra.se` (the statistics database) failed TLS certificate verification from this machine and was not read. BRÅ crime figures are relevant to few outcome promises in this set (see table), so this does not block the first batch.
- **Trafikanalys** `api.trafa.se`: reachable, returns structure items, no data pulled. Searches for charging infrastructure returned nothing, so charge points (two government promises) probably need Energimyndigheten or Power Circle.
- **Socialstyrelsen** statistics database: HTTP 403 for a script; downloadable tables only. **Kolada** v2 API returns 410 (retired; v3 not probed). **Energimyndigheten** `pxexternal`: connection failed.
- Not probed: Skolverket, Försäkringskassan, Polismyndigheten, Kriminalvården, SiS, Naturvårdsverket (wolf inventory), Arbetsmiljöverket, Tillväxtverket, Plikt- och prövningsverket, Försvarsmakten.

## Classification of the 54 government and support promises

Answerable: `yes` = a verified official series covers the promise's quantity; `partial` = a series exists but is not verified or open, only a proxy exists, or part of the promise (date, region, quality) cannot be settled by a single figure; `no` = no measurable quantity or the claim is a decision or event. Kind: `target` (threshold stated), `direction` (an increase or decrease with no figure). IDs drop the `val2022-` prefix. Table ids marked "-" were not found or not probed.

### Tidöavtalet

| Promise id                     | Quantity                             | Kind                    | Source, table                         | Answerable | Notes                                                                                   |
| ------------------------------ | ------------------------------------ | ----------------------- | ------------------------------------- | ---------- | --------------------------------------------------------------------------------------- |
| tido-kvotflyktingar-900-per-ar | Resettlement (kvot) permits per year | target, 900 per year    | Migrationsverket open data xlsx       | partial    | Current-year row read; 2022-2025 history not yet read. Becomes `yes` once it is         |
| tido-ett-samlat-elprisomrade   | Number of elområden                  | target, 1 "på sikt"     | SCB `TAB4063` (SE1-SE4 present)       | partial    | Still four areas; "på sikt och efter utredning" has no deadline, so it cannot be broken |
| tido-bevara-bromma-flygplats   | Bromma open, no closure decision     | state                   | Swedavia, government decisions        | no         | A fact checked from documents, not a statistic                                          |
| tido-ccs-minst-tva-auktioner   | Number of CCS auctions held          | target, 2               | Energimyndigheten                     | no         | An event count; settled from Riksdag and agency documents, not an API                   |
| tido-lagre-drivmedelspriser    | Pump price of petrol and diesel      | direction down          | SCB or Energimyndigheten price series | partial    | Series exists, not located; 2022 baseline was a price spike, so state it                |
| tido-utbyggd-primarvard-tio-ar | Primary care share of health care    | direction up, ten years | Socialstyrelsen, SKR                  | partial    | Not an open API; the ten-year horizon runs past the term                                |

### KD

| Promise id                                  | Quantity                                | Kind           | Source, table                        | Answerable | Notes                                                                      |
| ------------------------------------------- | --------------------------------------- | -------------- | ------------------------------------ | ---------- | -------------------------------------------------------------------------- |
| kd-investera-i-sveriges-framtid             | none (will "drive the question")        | none           | -                                    | no         | Retype to `vague`; see child beads                                         |
| kd-battre-villkor-i-vardens-bristyrken      | Share of agency (hired-in) staff, pay   | direction down | Socialstyrelsen, SKR                 | partial    | Two clauses; no verified series                                            |
| kd-bygg-nya-karnkraftsreaktorer             | Reactors under construction, nuclear MW | direction up   | SCB `TAB4063` (6 901 to 7 001 MW)    | partial    | Capacity moved by 100 MW (uprating, not new reactors); mostly a fact check |
| kd-fler-trygghetsboenden                    | Number of trygghetsboenden              | direction up   | Boverket                             | partial    | Not probed                                                                 |
| kd-fler-vardcentraler-pa-landsbygden        | Rural health centres                    | direction up   | Region registers, Vårdanalys         | partial    | Needs a rural definition; no verified series                               |
| kd-fler-vardplatser                         | Number of hospital beds                 | direction up   | Socialstyrelsen, SKR                 | partial    | Official series exists, download only                                      |
| kd-mobila-sjukvardsenheter-i-hemmet         | Mobile care teams                       | direction up   | -                                    | no         | No national series                                                         |
| kd-okad-medicinsk-kompetens-i-aldreomsorgen | Share of nurses among elder-care staff  | direction up   | Socialstyrelsen; SCB `TAB4355` proxy | partial    | SSYK coding is weak (see police)                                           |
| kd-sank-bensin-och-dieselpriserna           | Pump price of petrol and diesel         | direction down | SCB or Energimyndigheten             | partial    | Same series as `tido-lagre-drivmedelspriser`; "rejält" is vague            |
| kd-vargstammen-minskas-till-170             | Wolf population                         | target, 170    | Naturvårdsverket, SLU inventory      | partial    | Annual inventory report, no API; baseline not read                         |

### L

| Promise id                                                | Quantity                                        | Kind                     | Source, table                              | Answerable | Notes                                                                      |
| --------------------------------------------------------- | ----------------------------------------------- | ------------------------ | ------------------------------------------ | ---------- | -------------------------------------------------------------------------- |
| l-mer-sol-och-vindkraft-i-hela-landet                     | Installed wind and solar MW, by elområde        | direction up             | SCB `TAB4063`                              | yes        | Worked example 2; regional part needs SE1-SE4 each                         |
| l-fossilutslappen-fran-transportsektorn-ska-bort          | Domestic transport emissions                    | target, zero (no year)   | SCB `TAB4698` sector 8.0                   | partial    | 2024 value needs checking; zero has no date                                |
| l-klimatmal-nettonoll-2045-inom-vaxande-ekonomi           | Net emissions incl. LULUCF; GDP growth          | target, 0 by 2045        | SCB `TAB4698` (0.3), GDP `TAB3610`         | partial    | Target year is after the term: direction only. Same series as the next row |
| l-na-33000-poliser                                        | Police employees                                | target, 33 000 "på sikt" | Polismyndigheten staffing stats            | partial    | Not SCB (see probe log); no date                                           |
| l-fler-anstallda-och-varnpliktiga-i-krigsorganisationen   | Employed and conscripts in the war organisation | direction up             | Försvarsmakten, Plikt- och prövningsverket | partial    | Not probed                                                                 |
| l-fler-genomgar-grundlaggande-militar-utbildning          | People starting basic military training         | direction up             | Plikt- och prövningsverket                 | partial    | Not probed                                                                 |
| l-fler-fossilfria-flygresor                               | Share of renewable jet fuel                     | direction up             | Energimyndigheten, Swedavia                | partial    | Not probed                                                                 |
| l-fler-laddstolpar                                        | Public charge points                            | direction up             | Power Circle, Energimyndigheten            | partial    | Not in SCB or Trafikanalys searches                                        |
| l-fler-sarskilda-ungdomshem                               | Young people placed at SiS homes                | direction up             | SiS annual reports                         | partial    | No open series found                                                       |
| l-fossilfri-kollektivtrafik-2030                          | Fossil-free share of public transport           | target, 100 % by 2030    | Svensk Kollektivtrafik, Trafikanalys       | partial    | 2030 is after the term; direction only                                     |
| l-inga-utsatta-omraden-2030                               | Number of "utsatta områden"                     | target, 0 by 2030        | Polisen list                               | partial    | A list, no API; 2030 after the term                                        |
| l-ingen-ko-till-akut-omhandertagande-av-unga-valdsutovare | Queue to emergency placement                    | target, no queue         | SiS                                        | no         | No queue statistic found                                                   |

### M

| Promise id                                | Quantity                                | Kind                    | Source, table                         | Answerable | Notes                                                                                                                           |
| ----------------------------------------- | --------------------------------------- | ----------------------- | ------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| m-minska-ofrivilligt-deltidsarbete        | Under-employed part-time workers        | direction down          | SCB `TAB2876` (and `TAB5288`)         | yes        | Worked example 1                                                                                                                |
| m-skattehojarstopp                        | Tax revenue share of GDP (proxy)        | policy: no increases    | SCB `TAB121`                          | partial    | Share fell 42.9 to 40.5, but the promise is about rate changes, not the share. Better evidence is ESV and Riksdag tax decisions |
| m-polismal-10000-fler-poliser-2028        | Police employees (+10 000 by 2028)      | target, +10 000 by 2028 | Polismyndigheten staffing stats       | partial    | Baseline from the authority, not SCB; date is after the term                                                                    |
| m-minska-vargstammen-170                  | Wolf population                         | target, 170             | Naturvårdsverket, SLU                 | partial    | Same as `kd-vargstammen-minskas-till-170`                                                                                       |
| m-volymmal-asylmottagande-nordiska-nivaer | Asylum and residence permits vs Nordic  | target, Nordic level    | Migrationsverket xlsx, Eurostat       | partial    | "Nordic level" is not defined numerically                                                                                       |
| m-fler-eu-atertagandeavtal-utvisningar    | EU readmission agreements; deportations | direction up            | Migrationsverket, Polisen             | partial    | Agreements are an event count                                                                                                   |
| m-utvisa-fler-klanmedlemmar               | Expulsions due to crime                 | direction up            | Migrationsverket, BRÅ                 | partial    | Clan membership is not recorded; proxy only                                                                                     |
| m-fler-omhandertas-lvu                    | Children taken into care under LVU      | direction up            | Socialstyrelsen                       | partial    | Download only                                                                                                                   |
| m-omhanderta-barn-kriminella-klaner       | Children from criminal clans taken in   | direction up            | -                                     | no         | Not recorded as a category                                                                                                      |
| m-kortare-handlaggning-vapenlicenser      | Processing time for weapon licences     | direction down          | Polisen                               | partial    | No open series found                                                                                                            |
| m-minska-delade-turer                     | Share of split shifts in care           | direction down          | SKR employer survey                   | partial    | Not probed                                                                                                                      |
| m-minska-regelkrangel-administration      | Administrative cost, regulatory burden  | target, minus one third | Tillväxtverket                        | partial    | Measurement method and baseline unclear                                                                                         |
| m-minska-skogsyta-undantagen-skogsbruk    | Forest area withdrawn from forestry     | direction down          | Skogsstyrelsen, SCB `TAB6829` context | partial    | `TAB6829` is all protected nature, not forest only                                                                              |
| m-starka-jordbruket-livsmedelsproduktion  | Domestic food production                | direction up            | Jordbruksverket                       | partial    | Not probed                                                                                                                      |
| m-fler-laddstationer-elbilar              | Public charge points                    | direction up            | Power Circle, Energimyndigheten       | partial    | Same as `l-fler-laddstolpar`                                                                                                    |
| m-storskalig-koldioxidinfangning          | CCS plant in operation                  | state                   | Energimyndigheten                     | no         | An event                                                                                                                        |

### SD

| Promise id                                                    | Quantity                             | Kind           | Source, table               | Answerable | Notes                                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------ | -------------- | --------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| sd-oka-bostadsbyggandet                                       | Finished dwellings                   | direction up   | SCB `TAB4193`, `TAB2538`    | yes        | Worked example 3; falls from 54 018 to 31 359                                                                                   |
| sd-minska-beroendet-av-energiimport                           | Energy import dependence             | direction down | SCB `TAB1010`               | partial    | Electricity only: gross import 6 181 to 5 169 GWh (Sweden is a net exporter). Fuel imports not covered, so `relevance: partial` |
| sd-bekampa-skuggsamhallet-med-fler-kontroller-och-utvisningar | Controls and expulsions              | direction up   | Polisen, Migrationsverket   | partial    | Not probed                                                                                                                      |
| sd-battre-utredningar-och-kortare-handlaggningstider          | Processing time at Försäkringskassan | direction down | Försäkringskassan open data | partial    | Not probed; "quality" has no number                                                                                             |
| sd-grund-for-ett-yrke-som-efterfragas                         | Share completing vocational track    | direction up   | Skolverket                  | partial    | Not probed                                                                                                                      |
| sd-oka-tryggheten-for-vardpersonal-och-pa-akutmottagningar    | Threat and violence incidents        | direction down | Arbetsmiljöverket, BRÅ      | partial    | Not probed                                                                                                                      |
| sd-utbilda-efter-arbetsmarknadens-behov                       | Match of education to labour demand  | none           | -                           | no         | No measurable target                                                                                                            |
| sd-battre-villkor-och-halsovard-i-kvinnoyrken                 | Occupational health coverage         | direction up   | -                           | no         | No national series                                                                                                              |
| sd-oka-sjalvforsorjningsgraden-av-kritiska-produkter          | Self-sufficiency of critical goods   | direction up   | -                           | no         | No agreed definition or series                                                                                                  |
| sd-oka-takten-i-aterstallning-av-havsmiljon                   | Pace of marine restoration           | direction up   | Havs- och vattenmyndigheten | no         | No rate series                                                                                                                  |

### Opposition-only promises (32): `not_assessable`, statistics as context

C: bygg-ut-bredband-och-mobiltackning, fordubbla-utslappsfri-el, laddplatser-i-hela-landet, mangdubbla-biobransle-och-biogas, polistathet-till-eu-snittet-och-oppna-polisstationer, sank-det-totala-skattetrycket. MP: hoj-loner-i-kvinnodominerade-yrken, korta-vardkoer-i-hela-landet, kortare-handlaggningstider-for-arbetstillstand-och-asyl, skydda-30-procent-av-sveriges-natur, skydda-30-procent-av-varldens-hav, snabb-utbyggnad-havsbaserad-vindkraft. S: billigare-fritidsaktiviteter-for-barn, bygg-hyresratter-for-vanligt-folk, bygg-ut-elproduktionen-av-alla-slag, dubbla-antalet-laddstolpar-till-2030, fler-heltid-i-fasta-jobb-i-valfarden, fler-solpaneler, fler-utbildas-och-anstalls-i-aldreomsorgen, full-sysselsattning-overgripande-mal, kortare-vantetider-1177, mer-forbara-drivmedel, minst-70-procent-av-slutlonen-i-pension, minst-fordubbla-takten-i-elnatsutbyggnaden, varldens-forsta-fossilfria-valfardsnation. V: bostadsbyggande-pa-landsbygden, fler-larare-och-tidigare-insatser, fler-patrullerande-poliser, sankta-hyror-och-klimatsmarta-renoveringar, service-och-valfard-pa-mindre-orter, stoppa-diskriminering-och-rasism-pa-arbetsmarknaden, tunga-transporter-till-jarnvag-och-sjofart.

Several of these (finished rented dwellings, installed solar, unemployment rate, protected nature) have verified series above and can be shown next to the promise as context, but no verdict follows from them. Whether these 32 become `not_assessable` is the proposal at the top of this document and needs a decision; the point here is that the statistics epic does not need them.

## The 19 retyped promises (`hemsida-ukhd`)

All 19 are government or support promises. Result:

- **yes (1):** `l-mer-sol-och-vindkraft-i-hela-landet` (`TAB4063`).
- **partial (14):** kd-battre-villkor-i-vardens-bristyrken, kd-bygg-nya-karnkraftsreaktorer, kd-fler-vardcentraler-pa-landsbygden, kd-okad-medicinsk-kompetens-i-aldreomsorgen, l-fler-anstallda-och-varnpliktiga-i-krigsorganisationen, l-fler-fossilfria-flygresor, l-fler-genomgar-grundlaggande-militar-utbildning, l-fler-laddstolpar, l-fler-sarskilda-ungdomshem, m-fler-omhandertas-lvu, sd-battre-utredningar-och-kortare-handlaggningstider, sd-bekampa-skuggsamhallet-med-fler-kontroller-och-utvisningar, sd-grund-for-ett-yrke-som-efterfragas, sd-oka-tryggheten-for-vardpersonal-och-pa-akutmottagningar.
- **no (4):** kd-mobila-sjukvardsenheter-i-hemmet, sd-battre-villkor-och-halsovard-i-kvinnoyrken, sd-oka-takten-i-aterstallning-av-havsmiljon, sd-utbilda-efter-arbetsmarknadens-behov.

Only one of the 19 can be settled from a verified API today, so most of `hemsida-ukhd` waits for the statistics path. The 4 `no` promises should stay `unassessed` or get `no_evidence` at the term-close review.

## Recommended order

1. **Schema and data test** for the `statistic` kind and series store (one bead). Nothing else can be committed without it.
2. **Ingest tool for SCB series** (`tools/ingest-statistics.ts`), a config listing series ids, tables and selections, pinned by table id, written like `ingest-macro.ts` (paced, deterministic, `freshness.json`). Resolve the two flagged readings (`TAB4698` 2024, police) in this step.
3. **First batch of settle PRs**, the three `yes` promises, and only where the Riksdag action evidence also exists: `m-minska-ofrivilligt-deltidsarbete`, `l-mer-sol-och-vindkraft-i-hela-landet` and `sd-oka-bostadsbyggandet`. Then `sd-minska-beroendet-av-energiimport` as `partial` (electricity only), then `tido-kvotflyktingar-900-per-ar` once the Migrationsverket history is read, and the emissions pair (`l-fossilutslappen-fran-transportsektorn-ska-bort`, `l-klimatmal-nettonoll-2045-inom-vaxande-ekonomi`) once `TAB4698` is cleared.
4. **Second batch: non-SCB sources** (Migrationsverket xlsx, Polismyndigheten staffing, Energimyndigheten, Socialstyrelsen, Naturvårdsverket wolf inventory) covering the police and wolf promises, four (two government) and two promises respectively, which gives the best return per source.
5. **Retype the weak ones**: `kd-investera-i-sveriges-framtid` to `vague`, and review the 11 `no` promises at term close.
6. Revisit BRÅ when its database is reachable; today it matters for very few of these promises.
