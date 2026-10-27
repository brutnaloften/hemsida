# Riksdag open data API (data.riksdagen.se)

Exploration notes for epic `hemsida-4np` (bead `hemsida-4np.1`). Everything below was observed by running real requests against `https://data.riksdagen.se` on 2026-10-27, with small page sizes and about one request per second. Items marked **UNVERIFIED** were not confirmed. The API is read-only and needs no key. Where behaviour is inferred rather than shown, the text says so.

Responses are trimmed in the examples. Counts (`@traffar`) are live numbers from the day of exploration and will drift.

## Overview of endpoints

| Purpose                            | URL pattern                                                       | Verified                                               |
| ---------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------ |
| Search/list documents              | `/dokumentlista/?doktyp=...&utformat=json`                        | yes                                                    |
| One document with status and links | `/dokumentstatus/{dok_id}.json`                                   | yes                                                    |
| One document, same payload         | `/dokument/{dok_id}.json`                                         | yes (identical byte size to the `dokumentstatus` call) |
| Document full text                 | `/dokument/{dok_id}.html`, `.text`, `.xml`                        | yes (HTTP 200; see notes)                              |
| Votes, per member or aggregated    | `/voteringlista/?rm=...&bet=...&punkt=...&utformat=json`          | yes                                                    |
| One vote with per-member rows      | `/votering/{votering_id}` (XML) or `/votering/{votering_id}.json` | yes                                                    |

All paths are relative to `https://data.riksdagen.se`.

Notes:

- Default output format is XML. Add `utformat=json` to `dokumentlista` and `voteringlista` to get JSON. The `.json` suffix works on `dokumentstatus`, `dokument` and `votering`. Other list formats (`csv`, `html`) were **UNVERIFIED**.
- For `dokument/{id}.text` the observed `Content-Type` was `text/xml` (1,053,440 bytes for `HB03167`, same size as `.xml`), so `.text` is not plain text in practice. `.html` is `text/html`.
- URLs inside responses sometimes use `http://` or protocol-relative `//data.riksdagen.se/...`. Normalise to `https://`.
- Unknown id: `GET /dokument/NOSUCH.json` returns HTTP 404 `text/html`. An unknown `doktyp` in `dokumentlista` returns HTTP 200 with `@traffar: "0"` and no `dokument` key, so zero hits is not an error and the `dokument` key must be treated as optional.

## dokumentlista: search and list

Base: `/dokumentlista/`

### Response envelope

Observed for `?doktyp=prop&rm=2023%2F24&utformat=json&sz=2`:

```json
{
  "dokumentlista": {
    "@ms": "341.0",
    "@version": "3.9.0",
    "@q": "sz=2&utformat=json&doktyp=prop&rm=2023%2f24",
    "@datum": "2026-10-27 21:00:28",
    "@nasta_sida": "http://data.riksdagen.se/dokumentlista/?sz=2&utformat=json&doktyp=prop&rm=2023%2f24&p=2",
    "@sida": "1",
    "@sidor": "98",
    "@traff_fran": "1",
    "@traff_till": "2",
    "@traffar": "196",
    "facettlista": null,
    "dokument": []
  }
}
```

All numbers are strings. Behaviour of `@nasta_sida` on the last page and paging past the end were not tested (**UNVERIFIED**), so drive paging from `@sidor` and `p`. Empty strings stand in for missing values; `null` appears for some fields.

### Fields of a `dokument` item

Observed on a `prop` item (`HB03167`): `traff`, `domain`, `database`, `datum`, `id`, `rdrest`, `slutdatum`, `rddata`, `plats`, `klockslag`, `publicerad`, `systemdatum`, `undertitel`, `kalla`, `kall_id`, `dok_id`, `dokumentformat`, `dokument_url_text`, `dokument_url_html`, `dokumentstatus_url_xml`, `inlamnad`, `motionstid`, `tilldelat`, `lang`, `url`, `relurl`, `titel`, `rm`, `organ`, `relaterat_id`, `doktyp`, `typ`, `subtyp`, `beteckning`, `tempbeteckning`, `nummer`, `status`, `score`, `sokdata` (object), `summary`, `notisrubrik`, `notis`.

The fields a tracker needs are `dok_id`, `doktyp`, `subtyp`, `rm`, `beteckning`, `nummer`, `datum`, `publicerad`, `titel`, `organ`, `status` and the `dokument_url_html` / `dokumentstatus_url_xml` links. `sokdata.statusrad` is a tab-indented HTML fragment (committee report link, decision summary); it is presentation HTML, so use `dokumentstatus` instead of parsing it.

Meaning of `organ` varies by type: department for `prop` (`Finansdepartementet`) and `dir` (`Ju-dep`, `U-dep`), committee abbreviation for `bet` (`SfU`), party for `ip` (`S`, `SD`), empty for `sou` and `ds`.

### Parameters verified

| Param               | Example                          | Effect (observed)                                                                                                                                                                             |
| ------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `doktyp`            | `doktyp=prop`                    | Document type filter. A comma-separated list works: `doktyp=prop,bet` returned both.                                                                                                          |
| `rm`                | `rm=2023%2F24`                   | Riksmöte. Format is `2023/24` for most types and a plain year (`2023`) for `dir`, `sou`, `ds`, `sfs`. Repeating `rm=` unions the values (`2022/23` 173 hits + `2023/24` 196 hits = 369 hits). |
| `sok`               | `sok=k%C3%A4rnkraft`             | Full-text search. A quoted phrase (`%22Ny+k%C3%A4rnkraft%22`) is accepted, but the top hits did not obviously contain the phrase in their titles, so phrase semantics are **UNVERIFIED**.     |
| `from`, `tom`       | `from=2024-01-01&tom=2024-01-31` | Date range, `YYYY-MM-DD`, on `datum`. Verified with `sfs`: 3 hits, all dated 2024-01-25.                                                                                                      |
| `utskott`           | `utskott=SfU`                    | Committee filter for `bet`. `doktyp=bet&utskott=SfU&rm=2023/24` returned 18 hits, all `SfU`.                                                                                                  |
| `org`               | `org=FiU`                        | Also filters on committee: `doktyp=bet&org=FiU&rm=2023/24` returned 36 hits, all `FiU`.                                                                                                       |
| `organ`             | `organ=FiU`                      | Does not filter. 320 hits across MJU, CU and others. Use `org` or `utskott`.                                                                                                                  |
| `sort`, `sortorder` | `sort=datum&sortorder=asc`       | `sort=rel` (with `sok`), `sort=datum`, `sortorder=asc` and `desc` all worked; `asc` gave the earliest first (`2023-09-14` for `prop` 2023/24). Other sort keys **UNVERIFIED**.                |
| `sz`                | `sz=2`                           | Page size. `sz=1000` returned only 200 items (`@traff_till: 200`, `@sidor: 160` for `prop`), so the cap is 200 per page.                                                                      |
| `p`                 | `p=2`                            | Page number, 1-based.                                                                                                                                                                         |
| `utformat`          | `utformat=json`                  | `json`; otherwise XML.                                                                                                                                                                        |
| `facets`, `avd`     | `facets=1`, `avd=dokument`       | Accepted, but `facettlista` stayed `null` with `facets=1`. Effect **UNVERIFIED**. Party and category filters were not tested.                                                                 |

### Document types (`doktyp`) and example queries

Counts are `@traffar` with no other filter (2026-10-27).

| `doktyp`           | What                                           | Total                   | `rm` format | `dok_id` examples      | `organ` holds |
| ------------------ | ---------------------------------------------- | ----------------------- | ----------- | ---------------------- | ------------- |
| `dir`              | Kommittédirektiv                               | 6,476                   | `2023`      | `HBB11`, `HEB1122`     | department    |
| `sou`              | Statens offentliga utredningar                 | 4,958                   | `2023`      | `HBB3103`, `HEB363`    | empty         |
| `ds`               | Departementsserien                             | 1,653                   | `2023`      | `HBB432`, `HEB416`     | empty         |
| `prop`             | Propositioner (and regeringens skrivelser)     | 31,825                  | `2023/24`   | `HB0319`, `HB03167`    | department    |
| `bet`              | Utskottens betänkanden                         | 74,849                  | `2023/24`   | `HB01NU5`, `HE01SfU4`  | committee     |
| `sfs`              | Svensk författningssamling                     | 11,567                  | `2024`      | `sfs-2024-7`           | department    |
| `rskr`             | Riksdagsskrivelser                             | 283 in 2023/24          | `2023/24`   | `HB0K283`              | empty         |
| `mot`              | Motioner                                       | 258,140                 | `2026/27`   | `HE02179`, `HB022751`  | empty         |
| `votering`         | Votes as list items                            | 15,828                  | `2026/27`   | `HD19UU24p3`           | committee     |
| `ip`, `fpm`, `frs` | Interpellation, EU fact memo, written question | 15,757 / 2,721 / 43,098 | -           | `HD10591`, `HE06FPM10` | party / empty |

Government skrivelser are not a separate `doktyp`: `doktyp=skr` returned zero hits. In `dokumentstatus` references they appear as `ref_dok_typ: prop` with `ref_dok_subtyp: skr` (e.g. `HB0389`, "Skrivelse 2023/24:89").

About `dok_id`: the prefix looks like it encodes the riksmöte (`HB` = 2023/24, `HC` = 2024/25, `HD` = 2025/26, `HE` = 2026/27) followed by a type code (`03` prop, `01` bet, `02` mot, `0K` rskr). That is inferred from the ids seen, not documented. Treat ids as opaque and always take them from the API.

Example queries. Each was actually run with `utformat=json` appended; the indented line is a trimmed real result (`dok_id | doktyp | rm | beteckning | datum | organ | title`).

```text
# dir (183 hits for 2023), earliest first
/dokumentlista/?doktyp=dir&rm=2023&utformat=json&sz=3&sort=datum&sortorder=asc
  HBB11 | dir | 2023 | 1 | 2023-01-12 | Ju-dep | Tilläggsdirektiv till Biometriutredningen (Ju 2021:05)

# sou (108 hits for 2023)
/dokumentlista/?doktyp=sou&rm=2023&utformat=json&sz=2
  HBB3103 | sou | 2023 | 103 | 2024-01-01 | | Areella näringar vid vatten
# rm=2023%2F24 returns 0 hits for sou: the rm format differs per type.

# ds (34 hits for 2023)
/dokumentlista/?doktyp=ds&rm=2023&utformat=json&sz=2
  HBB432 | ds | 2023 | 32 | 2023-12-21 | | Säkerhetsdeposition vid hyresavtal

# prop (196 hits for 2023/24)
/dokumentlista/?doktyp=prop&rm=2023%2F24&utformat=json&sz=2
  HB03167 | prop | 2023/24 | 167 | 2024-09-09 | Finansdepartementet | Justeringar vad gäller ...

# prop with full-text search, by relevance (47 hits)
/dokumentlista/?sok=Tid%C3%B6avtalet&doktyp=prop&utformat=json&sz=3&sort=rel
  HC0375 | prop | 2024/25 | 75 | 2025-03-18 | Statsrådsberedningen | Riksdagens skrivelser till regeringen ...

# bet by committee (SfU, 2023/24: 18 hits)
/dokumentlista/?doktyp=bet&utskott=SfU&rm=2023%2F24&utformat=json&sz=3
  HB01SfU18 | bet | 2023/24 | SfU18 | 2024-05-23 | SfU | Anmälan av föreskrifter ...

# sfs in a date range (3 hits)
/dokumentlista/?doktyp=sfs&from=2024-01-01&tom=2024-01-31&utformat=json&sz=3
  sfs-2024-7 | sfs | 2024 | 2024:7 | 2024-01-25 | Justitiedepartementet L4 | Lag (2024:7) om preventiva vistelseförbud

# several types plus text (3 hits)
/dokumentlista/?doktyp=prop,bet&sok=g%C3%A4ngbrott&utformat=json&sz=3&sort=datum&sortorder=desc
  HD03218 | prop | 2025/26 | 218 | 2026-04-09 | Justitiedepartementet | Dubbla straff för brott i kriminella nätverk ...
  HD01JuU16 | bet | 2025/26 | JuU16 | 2026-03-27 | JuU | Polisfrågor

# rskr
/dokumentlista/?doktyp=rskr&utformat=json&sz=2&rm=2023%2F24
  HB0K283 | rskr | 2023/24 | 283 | 2024-06-19 | | Riksdagsskrivelse 2023/24:283

# text plus date range over all types (413 hits)
/dokumentlista/?sok=k%C3%A4rnkraft&utformat=json&sz=3&sort=rel&from=2023-01-01&tom=2023-12-31
  HB01NU5 (bet, "Ny kärnkraft i Sverige"), HB0319 (prop, "Ny kärnkraft i Sverige - ett första steg"), ...
```

## dokumentstatus: the cross-document links

`GET /dokumentstatus/{dok_id}.json` returns one object `dokumentstatus` whose keys vary by type. This is the endpoint that connects documents into a chain (prop, motions, bet, vote, rskr).

Keys observed:

- `bet` (`HB01SfU18`): `dokument`, `dokutskottsforslag`, `dokaktivitet`, `dokuppgift`, `dokbilaga`, `dokreferens`
- `prop` (`HB0319`): `dokument`, `dokforslag`, `dokaktivitet`, `dokintressent`, `dokuppgift`, `dokbilaga`, `dokreferens`
- `dir` (`HBB11`): only `dokument`
- `sfs` (`sfs-2024-7`): `dokument`, `dokumentuppgift`, `dokuppgift`
- vote (`votering/{id}.json`): `dokument`, `dokbilaga`, `dokvotering`

`dokument` holds the metadata (`dok_id`, `rm`, `beteckning`, `doktyp`, `organ`, `datum`, `titel`, `status`, ...) and the full document body as `html`. Payloads are large (48 KB for a small `bet`, 183 KB for `HB0319`, 927 KB for `HB03167`), so fetch them sparingly and drop `html` immediately.

An `sfs` document (`sfs-2024-7`) has `subtyp: sfst`, `beteckning: 2024:7`, `titel: Lag (2024:7) om preventiva vistelseförbud`, `subtitel: t. o. m. SFS 2025:565` (the consolidated version indicator) and `organ: Justitiedepartementet L4`.

### `dokreferens.referens[]` (document links)

Observed on prop `HB0319` ("Ny kärnkraft i Sverige - ett första steg"), as `referenstyp | ref_dok_id | ref_dok_typ | ref_dok_bet`:

```text
behandlas_i | HB01NU5 | bet | NU5     <- the committee report that handled it
följdmotion | HB022751 | mot | 2751
följdmotion | HB022754 | mot | 2754
(2 more följdmotion)
```

Observed on bet `HB01NU5`:

```text
behandlar          | HB0319          | prop    | 19        <- the proposition handled
behandlar          | HB02153 ...     | mot     | 153 ...   <- 14 motions
beslut_id          | HBC320231129NU5 | kammakt | NU5       <- the chamber decision
protokolldebatt    | HB0937          | prot    | 37
protokollbeslut    | HB0938          | prot    | 38
rskr               | HB0K45          | rskr    | 45        <- riksdag letter to the government
föredragningslista | HB0I37          | f-lista | 37
```

Each reference has `referenstyp`, `uppgift`, `ref_dok_id`, `ref_dok_typ`, `ref_dok_rm`, `ref_dok_bet`, `ref_dok_titel`, `ref_dok_subtitel`, `ref_dok_subtyp` and `ref_dok_dokumentnamn`. Whether `referens` collapses to a bare object when there is exactly one is **UNVERIFIED**, but `dokutskottsforslag.utskottsforslag` does flip between object (one point) and array (several) in this JSON conversion, so a client should normalise every nested list with `[].concat(x)`.

Laws (`sfs`) did not appear among the references of the props and bets inspected. How to get from a proposition to the resulting `sfs` document is **UNVERIFIED** (candidates: `sok` on the law title, or other `dokuppgift` entries; not tested).

### `dokutskottsforslag.utskottsforslag` (committee points and votes)

For bet `HB01NU5` there are four points:

```text
punkt 1 | röstning    | votering_id 2c198cdf-3a9c-4318-a678-e6aff5c2c68a | vinnare utskottet
punkt 2 | röstning    | votering_id 46b018b4-3f64-4613-883c-f160032658be | vinnare utskottet
punkt 3 | acklamation | (empty id)
punkt 4 | acklamation | votering_id 86CD7737-A18E-4E06-B804-336656E8B507
```

Fields: `punkt`, `rubrik`, `forslag` (HTML), `beslutstyp`, `motforslag_nummer`, `motforslag_partier`, `votering_id`, `votering_sammanfattning_html`, `votering_url_xml`, `rm`, `bet`, `vinnare`, `voteringskrav`, `beslutsregelkvot`, `beslutsregelparagraf`, `punkttyp`. Point 4 is `acklamation` yet has a `votering_id`, so do not assume an id means a recorded roll call. For NU5 the id on that point (86CD7737) returns real roll-call totals (154 Ja, 20 Nej, 127 Avstår) from `voteringlista`; check the totals rather than the `beslutstyp`.

### `dokuppgift.uppgift[]` and `dokaktivitet.aktivitet[]`

`dokuppgift` items are `{kod, text, ...}`. Codes seen on bet `HB01SfU18`: `beslutdatumtid`, `beslutssammanfattningusk`, `debattdatumtid`, `notis`, `notisrubrik`, `rdbeslut` ("Kammaren biföll utskottets förslag."), `statustext` ("Ärendet är avslutat"), `utsknotis`, `utsknotisrubrik`, `arendestatuskammaren`. On prop `HB0319`: `inlamnatav`, `statustext`, `tilldelat`. Useful for a human-readable status line.

`dokaktivitet` items are `{kod, namn, datum, status, ordning, process}`, e.g. `UBE / Beredning / 2024-05-02 / inträffat`. They give the date trail through the process.

## Voteringar

### voteringlista: per-member rows or aggregates

Base: `/voteringlista/` with `rm`, `bet`, `punkt`, `utformat=json`, optional `sz`, `gruppering`, `p`. The verified filter set is `rm`, `bet`, `punkt`; date and party filters were not tested (**UNVERIFIED**).

Envelope (`@villkor` echoes the filters, `@antal` is the row count):

```json
{
  "voteringlista": {
    "@gruppering": "",
    "@villkor": ": rm=2023/24 : bet=NU5 : punkt=1 ",
    "@antal": "349",
    "votering": []
  }
}
```

Without `gruppering` there is one row per member (349 for NU5 punkt 1, fetched with `sz=500`). **The endpoint caps at 500 rows**, and the `p` (page) and `avser` parameters are ignored, so a point with two votes (about 698 member rows for NU5 punkt 2) is cut off and cannot be read in full. Use `/votering/{votering_id}.json` below for per-member rows:

```text
/voteringlista/?rm=2023%2F24&bet=NU5&punkt=1&utformat=json&sz=500
```

```json
{
  "rm": "2023/24",
  "beteckning": "NU5",
  "punkt": "1",
  "votering_id": "2C198CDF-3A9C-4318-A678-E6AFF5C2C68A",
  "intressent_id": "0257612529618",
  "namn": "Kenneth G Forslund",
  "valkrets": "Västra Götalands läns västra",
  "parti": "S",
  "rost": "Nej",
  "avser": "sakfrågan",
  "votering": "huvud",
  "dok_id": "HB01NU5",
  "systemdatum": "2023-11-29 16:04:27"
}
```

Other keys on each row: `hangar_id`, `punkttyp`, `fornamn`, `efternamn`, `iort`, `banknummer`, `kon`, `fodd`, `votering_url_xml`. Values of `rost` seen as aggregate columns are `Ja`, `Nej`, `Frånvarande`, `Avstår`. Other `avser` values (for example counter-proposal votes) are **UNVERIFIED**.

`gruppering=parti` aggregates by party:

```text
/voteringlista/?rm=2023%2F24&bet=NU5&punkt=1&gruppering=parti&utformat=json&sz=500
parti "-" Ja 1 (the speaker), C Nej 21, KD Ja 16, L Ja 13, M Ja 59, MP Nej 15, S Nej 93, SD Ja 63, V Nej 20
```

Each row is `{parti, Ja, Nej, Frånvarande, Avstår}` (strings, empty means 0). `gruppering=votering_id` aggregates a whole vote (with only `rm` and `bet` (no `punkt`) it returns one row per vote id for the whole betänkande: four rows for NU5, 2C198CDF, 46B018B4, 86CD7737 and D3D272A2; one of them, D3D272A2, is not among the vote ids listed under the committee points, so votes do not map one-to-one to points; the row shown below is the one for punkt 1):

```json
{
  "votering_id": "2C198CDF-3A9C-4318-A678-E6AFF5C2C68A",
  "Ja": "152",
  "Nej": "149",
  "Frånvarande": "48",
  "Avstår": ""
}
```

Per-member rows of a single vote come from `/votering/{votering_id}.json`, which is not capped:

```text
/votering/46B018B4-3F64-4613-883C-F160032658BE.json
```

It returns `{ votering: { dokument, dokbilaga, dokvotering: { votering: [...] } } }` with exactly the vote's own rows (349 for NU5 punkt 2, all `avser: "sakfrågan"`, about 285 KB). The rows have the same keys as the voteringlista member rows. The id must be the full id (a short prefix such as `46B018B4` returns an empty body with status 200). Resolving a point means taking the `votering_id` from its `utskottsforslag` and fetching this; `tools/lib/votes.ts` does so.

Other `gruppering` values are **UNVERIFIED**; the envelope carries slots `@grupp1` to `@grupp8`.

### votering/{votering_id}

`GET /votering/2C198CDF-3A9C-4318-A678-E6AFF5C2C68A` (XML, about 247 KB) or `.json` (about 285 KB). The JSON has `dokument` (the bet metadata, again with full `html`), `dokbilaga` and `dokvotering.votering[]` with the same per-member rows as `voteringlista` plus `valkretsnummer`, `källa` ("RIM-vot") and `datum`. For a point with a single vote, `voteringlista` with `gruppering=parti` is a cheaper way to get party totals (a few hundred bytes versus hundreds of KB). For a point with two votes it mixes them, so use this endpoint and aggregate per party.

Votes can also be listed as documents: `dokumentlista?doktyp=votering` returns items such as `HD19UU24p3 | votering | 2025/26 | UU24 | "Omröstning: betänkande 2025/26:UU24 ..."`. Details of these items beyond the list view are **UNVERIFIED**.

### Linking a vote to a promise's trail

1. `dokumentstatus/{bet}.json` gives `dokutskottsforslag.utskottsforslag[].votering_id`. Compare `votering_id` values case-insensitively: they are lowercase in `dokumentstatus` and uppercase in `voteringlista`.
2. `/votering/{votering_id}.json` for the chosen vote, aggregated per party (as `tools/lib/votes.ts` does). Only for a point with a single vote can `voteringlista?rm=...&bet=...&punkt=...&gruppering=parti` replace this; with two votes it mixes them.

## Rate limits, caching and etiquette

- No rate-limit headers were returned. Only `Cache-Control: private` was present among interesting headers (plus `Content-Type`, `Date`, `Strict-Transport-Security`).
- A burst of 25 sequential `dokumentlista` requests (`sz=1`, no delay, a new connection each) all returned HTTP 200, so no throttling was seen at that volume. That does not establish a limit and no documented limit was found. Whether heavier use is throttled or blocked is **UNVERIFIED**.
- Latency was 120 to 350 ms for small requests.
- Be polite: send a descriptive `User-Agent`, run requests sequentially with about 1 s between them in bulk jobs, cache raw responses on disk, and prefer `dokumentlista` (small) over `dokumentstatus` and `votering` (hundreds of KB because they embed the full HTML).
- Page size is capped at 200. Crawling one type takes `@traffar / 200` requests (`prop`: 31,825 hits, 160 pages), so restrict by `rm` and `from`/`tom` instead of crawling whole types.

## Practical notes for the tracker

- The Tidö term is riksmöten `2022/23` to `2025/26`. For `dir`, `sou`, `ds` and `sfs` use the calendar years 2022 to 2026, since their `rm` is a year.
- Date fields: `datum` is the document date, `publicerad` the publication timestamp, `systemdatum` the last system update. Whether `systemdatum` can be filtered server-side for incremental refreshes is **UNVERIFIED**.
- `status` strings vary by type (`Klar`, `Webbpublicering`, `planerat`, `Inkommen`, `Inte besvarad`); do not treat them as one lifecycle.
- Treat numeric-looking fields as strings, handle `null` and `""`, normalise single-object versus array in nested lists, and treat a missing `dokument` key as an empty result.
- Not explored: member and speech endpoints (`personlista`, `anforandelista`), bulk dumps, `sokdata` internals, and handling of `skr` beyond the `subtyp` observation.
