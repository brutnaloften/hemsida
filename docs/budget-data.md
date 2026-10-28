# Budget data: what is actually available

Findings of the spike `hemsida-rn4.1`, checked on 2026-10-28 by downloading the real files and analysing them with the Python standard library. It informs the epic `hemsida-rn4` (budget explorer) and the ingestion bead `hemsida-9ce.3`. All amounts below are million kronor (mn kr) unless stated. No raw data is committed; downloads went to the gitignored `tools/out/budget-cache/`.

## Summary

- Statskontoret (ESV's open data) covers everything the explorer needs through 2025: expenditure per anslag 1997-2025 (definitive), revenue per inkomsttitel 2006-2025 (2025 is Prel 2), and monthly outcome per anslagspost.
- **The proposed totals formula reconciles for 2024.** Statens utgifter 1 377 021.4, revenue 1 272 749.1, saldo -104 272.3 mn kr. Riksgälden's published budget outcome for 2024 is a deficit of 104 mdkr. See [Reconciliation](#reconciliation-2024).
- Monthly outcome summed Jan-Dec equals the annual outcome exactly, per anslag and per year, if the two files are joined on the `... utfallsår` columns (not on the restated columns, which differ per release).
- There is no budget per anslagspost in open data (monthly files are outcome only).
- The regeringen.se Excel files are parseable but not worth building for v1 (see [Regeringen xlsx](#4-regeringen-statens-budget-som-excel)). Recommendation for `hemsida-rn4.7`: defer.
- SCB PxWebApi v2 works, is CC0, and has everything for KPI and GDP. GDP for 2025 is not published yet (latest 2024).
- Design changes found: restated anslag codes are not unique over time (the same 7-digit code can mean different anslag in different releases), discontinued anslag carry a year suffix, and the monthly download uses a different endpoint than the annual one. See [Gotchas](#gotchas) and [Changes to the epic design](#changes-to-the-epic-design).

## Sources

| Source                                | URL                                                                                                      | Licence                                                             | Cadence                                                                        | Coverage                                                                                                       |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Årsutfall utgifter (zip, csv, xlsx)   | https://www.statskontoret.se/analys-och-statistik/oppna-data/arsutfall/                                  | CC0 ("Användningsvillkor" box on the page links the CC0 legal code) | Page states "Två gånger per år"; the 2025 expenditure file is dated 2026-03-24 | 1997-2025, definitive. No preliminary expenditure files.                                                       |
| Årsutfall inkomster (zip, csv, xlsx)  | same page                                                                                                | CC0                                                                 | Three preliminary files then a definitive one (see below)                      | 2006-2025. Listing now offers "första preliminära" and "andra preliminära".                                    |
| Månadsutfall utgifter / inkomster     | https://www.statskontoret.se/analys-och-statistik/oppna-data/manadsutfall/                               | CC0                                                                 | Monthly, one cumulative file per month (latest listed: January-August 2026)    | January 2006 up to the file's month, per anslagspost (expenditure).                                            |
| Regeringen "Statens budget som excel" | https://www.regeringen.se/sveriges-regering/finansdepartementet/statens-budget/statens-budget-som-excel/ | None stated (public government documents)                           | Per budget proposition and per ändringsbudget                                  | 2013-2026 (page lists BP 2026 and 2026 spring/extra ändringsbudgetar). BP 2027 not published as of 2026-10-28. |
| SCB PxWebApi v2                       | https://api.scb.se/OV0104/v2beta/api/v2/                                                                 | CC0 (`/config` returns the CC0 licence link)                        | KPI monthly, annual average once a year; GDP annual in the spring              | KPI annual average 1980-2025, GDP 1980-2024.                                                                   |

## 1. Statskontoret årsutfall

### Discovering the download URL

The listing page contains the links, in HTML-escaped form (`&amp;`). Scrape `href="...GetFile?..."` and unescape. Shape of the links:

```
https://www.statskontoret.se/OpenDataArsUtfallPage/GetFile
  ?documentType=Utgift|Inkomst
  &fileType=Zip|Excel
  &fileName=Årsutfall utgifter 1997 - 2025, definitivt.zip   (URL-encoded)
  &Year=2025&month=0&status=Definitiv|Preliminär 1|Preliminär 2
```

The file name embeds the year range and status and changes each release, so a fixed pattern is fragile. Scraping `/analys-och-statistik/oppna-data/arsutfall/` works: the landing page lists only the newest set (6 links today: 2 inkomster preliminary files and 1 utgifter definitive, each as Excel and Zip). Older sets are at `?year=<y>` (2016-2025). The tool should take the URL as an optional argument as a fallback.

Files downloaded: `Årsutfall utgifter 1997 - 2025, definitivt.zip` (795 KB zipped, 3.5 MB csv) and `Årsutfall inkomster 2006 - 2025, andra preliminära.zip` (156 KB zipped, 1.3 MB csv, file dated 2026-06-12).

### Format

- Zip with exactly one entry, a `.csv`. The entry name is not flagged UTF-8, so `unzip` shows `Årsutfall` as `├Еrsutfall` (CP437). Pick the single `.csv` entry instead of matching by name.
- Content: UTF-8, no BOM, `;` separator, CRLF line endings, decimal comma (`1234,567`), no thousands separator, no quoting needed in the samples checked. Amounts in mn kr, nominal.
- Expenditure: 15 832 data rows, 17 columns:
  `Utgiftsområde; Utgiftsområdesnamn; Anslag; Anslagsnamn; År; Ingående överföringsbelopp; Statens budget; Ändringsbudgetar; Indragningar; Utnyttjad del av medgivet överskridande; Utfall; Anslagskredit; Utgående överföringsbelopp; Utgiftsområde utfallsår; Utgiftsområdesnamn utfallsår; Anslag utfallsår; Anslagsnamn utfallsår`
- Revenue: 4 452 data rows, 19 columns:
  `Inkomsttyp; Inkomsttypsnamn; Inkomsthuvudgrupp; Inkomsthuvudgruppsnamn; Inkomsttitelgrupp; Inkomsttitelgruppsnamn; Inkomsttitel; Inkomsttitelsnamn; År; Statens budget; Utfall; ... utfallsår (8 more columns, same names suffixed)`.
  Rows per year: 242 (2006), 211 (2015), 223 (2025). 298 distinct inkomsttitlar. `(År, Inkomsttitel)` is unique. Titel-group codes can be ranges (`1140-1160`).

### Empty-cell semantics

Expenditure counts over all 15 832 rows: `Utfall` empty 757 (713 of them on anslag rows, e.g. an anslag with a budget but no recorded outcome that year), explicit `0` in 97. `Statens budget` empty 1 392, zero 89. `Ändringsbudgetar` empty 12 604 (mostly "no ändringsbudget"), `Indragningar` empty 8 940, `Utnyttjad del av medgivet överskridande` empty 15 710. `Anslagskredit` and `Utgående överföringsbelopp` have both many empty and many explicit zeros, so empty is not the same as zero in the source.
Revenue: `Utfall` empty 368 rows, `Statens budget` empty 221. In 2025 22 titles have no outcome and 9 have no budget.
Rule: store `null` for empty, 0 for explicit zero, and treat `null` as 0 in sums. Display "-" for null, not 0.

### Non-UO rows

Rows with an empty `Utgiftsområde` carry the macro rows. Per year (1997-2025, 29 years): `Utgiftstak`, `Marginal till utgiftstaket`, `Kassamässig korrigering`, `Ålderspensionssystemet vid sidan av statens budget`, `Riksgäldskontorets nettoutlåning` (each 29 rows), and `Förändring av anslagsbehållningar` (44 rows, two per year in recent years, budget only, `Utfall` empty). For them `Anslag` is empty and the name sits in `Utgiftsområdesnamn`. The restated UO columns hold the name, the `... utfallsår` columns hold the original numbering (UO 91, 92, 93 and codes `919601`, `929701`, `9301001`/`939801` appear in the monthly file).

### Restated versus utfallsår

- Restated columns (first group) use the nomenclature of the newest year in the file. They are what to use for time series.
- `... utfallsår` columns use the nomenclature of the outcome year (what the budget for that year called it). Needed to link to the original budget documents.
- Differences shrink toward the present: rows where restated anslag code differs from the original code: 1997 730 of 732, 2005 532 of 532, 2010 306 of 519, 2015 175 of 492, 2022 66 of 517, 2025 13 of 503. UO number differs for 42 rows in 1997 but only 2 in 2022 and 0 in 2025. The UO number-and-name set is stable in the restated columns (27 UOs, one name each).
- Restating never changes totals: UO 1-27 outcome sums are identical in the 2024-release and the 2025-release files for 2015, 2022 and 2024 (889 344.9, 1 237 960.2, 1 364 651.1).
- Years before 2006 have alphanumeric six-character codes in `Anslag utfallsår` (`02B004`, `20A011`). We start at 2006 so this is out of scope.

### Anslag code format

Restated `Anslag` has three shapes (in the 2025 file):

| Shape       | Rows   | Example                        | Meaning                                                                                    |
| ----------- | ------ | ------------------------------ | ------------------------------------------------------------------------------------------ |
| 7 digits    | 11 013 | `0901011`                      | Active anslag: UO (2) + anslagsgrupp (2) + number (3). `0901011` is UO 9, anslag **1:11**. |
| 11-12 chars | 4 616  | `0201003 2010`, `0501003 2024` | Discontinued anslag: old 7-digit code, a space, and the last year it was in the budget.    |
| 6 chars     | 14     | `020205`                       | Legacy pre-2005 codes, all in 1997-2000.                                                   |

The mapping code to display designation holds for every 7-digit code in the file (11 013 of 11 013 match `UO(01-27) group(2) nr(3)`, first two digits equal the UO column; highest group 15, highest number 067): designation `<group without leading zeros>:<number without leading zeros>` within the UO, e.g. `0101001` is 1:1 and `0901011` is 1:11. Verified against the regeringen BP 2026 Excel (`9 Hälso- och sjukvårdspolitik`, group `1 Socialstyrelsen` = ESV `0901001`, same name).

**The same 7-digit code can mean different anslag in different releases.** In the 2025 release `0501003` is "Inspektionen för strategiska produkter" (originally `0501005`) and the old `0501003` (Nordiskt samarbete) became `0501003 2024`. Within one file each `(År, Anslag)` is unique (0 duplicates), and no 7-digit code has two names within the file, so the restated key is safe inside one release, but not across releases. Ingest from one release only, and regenerate everything on refresh. 10 of the 7-digit codes in 2024 changed name between the 2024-release and the 2025-release files, and 17 codes exist only in the older one.

Counts: 490 distinct 7-digit codes in the file, all 490 active in 2025, 327 of them already present in 2006. For 2006-2025: 814 distinct restated anslag keys (including the suffixed discontinued ones), 542 anslag rows in 2006, 503 in 2025.

### Revenue status and cadence

From ESV's description page: taxes (inkomsttyp 1000) are accrual-based per income year, so title-level outcome is not definitive until about 1.5 years after the budget year. ESV therefore publishes three preliminary files (Prel 1, 2, 3) before the definitive one. At total level the tax outcome is cash-based and definitive at year end (huvudgrupp 1900 Periodiseringar bridges the two). Types 2000-6000 are definitive immediately and never revised. Expenditure has no preliminary file.

Now (2026-10-28): 2025 is at Prel 2 (listing offers Prel 1 and Prel 2). Per the cadence above, 2024 title-level tax rows are probably still preliminary too, but the file does not carry a per-year status flag. Do not infer finality per year from the file name alone. Proposal: ingestion takes a configured `revenueFinalThrough` year (initially 2023, to be confirmed against the Def file when published) and tags later years `preliminary`.

## 2. Reconciliation (2024)

Inputs: expenditure from the 2025-release file, revenue from the Prel 2 file.

| Item                                                          |            mn kr |
| ------------------------------------------------------------- | ---------------: |
| Sum of UO 1-27 outcome (517 anslag rows)                      |     1 364 651.11 |
| Riksgäldskontorets nettoutlåning                              |        -1 972.86 |
| Kassamässig korrigering                                       |        14 343.21 |
| **Statens utgifter** (the sum of the three)                   | **1 377 021.45** |
| Revenue, all inkomsttyper 1000-8000 (net)                     |      1 272 749.1 |
| **Saldo** (revenue minus statens utgifter)                    |   **-104 272.3** |
| Ålderspensionssystemet vid sidan av statens budget (excluded) |       366 581.95 |

Published check: Riksgälden reports a state budget deficit ("Statens betalningar resulterade i ett underskott") of **104 mdkr for 2024**, versus its own forecast of 78 mdkr. Source: Riksgälden press release "Statens budgetunderskott blev 104 miljarder kronor 2024" (https://storage.mfn.se/7e1ba85c-4a72-43a9-954d-935541ceeb25/statens-budgetunderskott-blev-104-miljarder-kronor-2024.pdf). Our -104.27 mdkr rounds to -104. **It reconciles within rounding.** Caveat: I did not find a second published ESV figure for total revenue or expenditure to check each side separately; only the saldo is verified externally. Without the two adjustment rows (UO sum only) the saldo would be -91.9 mdkr, so the formula, not just the UO sum, is needed to match.

Second internal check, the expenditure ceiling. `Utgiftstak` 1 747 000 minus `Marginal` 60 965.18 = 1 686 034.82 takbegränsade utgifter. UO 1-27 (1 364 651.11) + ålderspensionssystemet (366 581.95) - UO 26 Statsskuldsräntor (45 198.2) = 1 686 034.86. Matches to 0.04 mn kr. Useful for an explanatory note: the ceiling covers UO 1-27 except the interest on the national debt, plus the pension system.

2025 for reference (revenue is Prel 2): UO 1-27 1 402 331.0, nettoutlåning -945.9, kassamässig korrigering 4 426.6, statens utgifter 1 405 811.7, revenue 1 303 865.2, saldo -101 946.5. Not checked against a published figure.

### Exact formula for the site

```
statensUtgifter(y) = Σ utfall(UO 1..27, y)
                   + utfall("Riksgäldskontorets nettoutlåning", y)
                   + utfall("Kassamässig korrigering", y)

statensInkomster(y) = Σ utfall(all inkomsttitlar, y)        // types 1000..8000, signs as in the file
saldo(y)            = statensInkomster(y) - statensUtgifter(y)
```

Excluded and shown only as a note: `Ålderspensionssystemet vid sidan av statens budget`, `Utgiftstak`, `Marginal till utgiftstaket`, `Förändring av anslagsbehållningar` (budget only, no outcome).

### Gross versus net revenue (2024)

Inkomsttyp 1000 Statens skatteinkomster nets out the tax that never reaches the state. By inkomsthuvudgrupp:

| Huvudgrupp                                        |     mn kr, 2024 |
| ------------------------------------------------- | --------------: |
| 1100 Direkta skatter på arbete                    |       769 314.2 |
| 1200 Indirekta skatter på arbete                  |       755 687.1 |
| 1300 Skatt på kapital                             |       389 823.9 |
| 1400 Skatt på konsumtion och insatsvaror          |       703 639.0 |
| 1500 Skatt på import                              |         8 480.1 |
| 1600 Restförda och övriga skatter                 |         2 131.7 |
| **Brutto (1100-1600)**                            | **2 629 076.0** |
| 1700 Avgående poster, skatter till EU             |        -8 480.1 |
| 1800 Avgående poster, skatter till andra sektorer |    -1 279 187.8 |
| 1900 Periodiseringar                              |       -10 084.1 |
| **Statens skatteinkomster (type 1000)**           | **1 331 324.1** |

The big avgående poster are title 1811 Kommunala skatter (-952 498.5) and 1812 Avgifter till AP-fonder (-326 689.3). The gross layer already contains negative lines too (skattereduktioner such as jobbskatteavdrag -181 291.2, in 1100). Type 7000 Avräkningar (-146 109.2, mainly VAT compensation and public service fee) is a second class of deduction outside type 1000. Because the file marks the deductions explicitly as huvudgrupp 1700/1800 and titlar, the epic's "gross by type plus an explicit negative row" can be done straight from the data, with no derived numbers. Total revenue 2024 = 1 331 324.1 (1000) + 47 576.6 (2000) + 1 240.5 (3000) + 386.9 (4000) + 21 943.2 (5000) + 16 387.0 (6000) - 146 109.2 (7000) = 1 272 749.1. Type 8000 has no rows in 2024; it exists in earlier years (2006: -13 672.2).

Share of GDP for 2024 with the SCB figure below (6 443 039 mn kr): expenditure 21.4 %, revenue 19.8 %, saldo -1.6 %.

## 3. Månadsutfall

- The monthly files are cumulative: `Månadsutfall utgifter januari 2006 - december 2024, definitivt.zip` contains all months from January 2006. Only the newest file is needed. Zip 1.8 MB, csv 9.5 MB, 24 181 data rows.
- The monthly links use **a different endpoint**: `https://www.statskontoret.se/OpenDataManadsUtfallPage/GetFile?documentType=Utgift&fileType=Zip&fileName=...&Year=2024&month=12&status=Definitiv`. Using the årsutfall endpoint (`OpenDataArsUtfallPage`) with the same query string **silently returns the annual file** instead of an error. The tool must check the header row. Landing page `/analys-och-statistik/oppna-data/manadsutfall/` lists the newest year, `?year=<y>` the others. December files exist as `preliminärt` and `definitivt`.
- Columns (37): `Utgiftsområde; Utgiftsområdesnamn; Anslag; Anslagsnamn; Anslagspost; Anslagspostsnamn; Anslagsdelpost; Anslagsdelpostsnamn; Myndighet; Organisationsnummer; År; Utfall januari ... Utfall december;` then the same eight `... utfallsår` columns. Same encoding and decimal comma as the annual files.
- Granularity: anslagspost is a 3-digit code (`001`, `010`), anslagsdelpost optional (3 digits, empty in 22 496 of 24 181 rows). Each row is one myndighet. 2024 has 1 375 rows (1 374 distinct post keys).
- **Sum check.** Summing `Utfall januari..december` gives exactly the annual outcome: UO 1-27 totals match to the last decimal in 2006, 2012, 2018, 2022, 2023 and 2024 (e.g. 2024: 1 364 651.1 both ways). Per anslag, joining on `Anslag utfallsår` matches for all anslag in 2006, 2015 and 2024 (the only unmatched keys are the three non-UO rows, which have different utfallsår codes `919601`, `929701`, `939801` in the monthly file; their values still equal the annual ones: kassamässig korrigering 14 343.21, nettoutlåning -1 972.86, ålderspension 366 581.95 for 2024). Joining on the restated `Anslag` column gives 24 false mismatches for 2024, because the monthly Dec-2024 file was restated at the 2024 release and the annual file at the 2025 release.
- Size and filtering: the whole history is one 1.8 MB download; filtering to recent years happens after download on the `År` column. One snapshot per run is cheap.
- **No budget per anslagspost** exists in the open data. The monthly files hold outcome only. Statens budget exists at anslag level in the annual file.
- The monthly revenue file exists too (`Månadsutfall inkomster ...`). Not needed for the explorer.

## 4. Regeringen "Statens budget som excel"

Downloaded `specifikation-av-budgetens-utgifter-och-inkomster-2026.xlsx` (BP 2026, submitted 2025-09-22, 62 KB) and `specifikation-av-andrade-ramar-for-utgiftsomraden-och-andrade-anslag-2026.xlsx` (spring ändringsbudget 2026, 31 KB). Link patterns under `/contentassets/<guid>/` (new) and `/globalassets/regeringen/dokument/finansdepartementet/exceldokument/...` (old), with inconsistent file names between years.

**BP 2026 layout.**

- Sheet `Utgifter` (570 rows): "Tusental kronor" (thousand kr, not mn kr). Column A UO number on UO rows (`1`..`27`), column B text with a leading local number (`1 Statschefen`, `1 Kungliga hov- och slottsstaten`), column C the amount. Three levels without explicit codes: UO, anslagsgrupp (a `N text` row whose amount is the sum of the rows below), anslag (`N text`). The designation is group:number, but must be reconstructed from the order, because group rows and anslag rows look the same. A last row `Summa anslag` is 1 543 317 501 tkr = the sum of the 27 UO rows (verified, no nettoutlåning, no kassamässig korrigering).
- Sheet `Inkomster` (320 rows): different layout (code and name move between columns A-C; labels in A for headline rows like `Skatt på arbete`, `Totala skatteintäkter`, `Statens skatteintäkter`), amount in column D, thousand kr. Same inkomsttyp/huvudgrupp/titelgrupp/titel codes as ESV plus extra summary rows. `Summa inkomster` 1 374 910 661 tkr for 2026 is included. Revenue is therefore included.
- Spring ändringsbudget: sheet `Blad1`, columns `Utgiftsområde | Anslagsnummer ("2:3") | name | Beslutad ram/anvisat anslag | Förändring | Ny ram/ny anslagsnivå`, only the changed anslag. Here the designation is explicit, so the layout differs from the BP file.
- Name match BP 2026 to ESV 2025: 471 of the 539 numbered rows (anslag and groups) match a 2025 anslag name exactly; the rest are renamed, new or group rows.
- **BP 2027 (election year, due mid-November 2026) is not published**: the page contains no "2027" and no new file. Re-check after the government is formed.

**Parsing cost.** An xlsx is a zip of XML with shared strings; I parsed it with 30 lines of Python stdlib. In Node there is no built-in unzip, so `tools/` would need a dependency (SheetJS `xlsx`, `exceljs` or `fflate`) or shelling out to `unzip`. The three sheet layouts differ and change between years (file names, sheet names, column positions), so the parser needs per-document handling and manual checks.

**Is it worth it? Not for v1.** ESV already provides budget and outcome per anslag and per inkomsttitel up to 2025. The xlsx adds only the current year's budget (2026) and, later, the 2027 proposal, with a lower-quality key (no anslag code), per-file layouts and thousand-kr units. Recommendation: defer `hemsida-rn4.7` (leave it open at low priority, or close as "not now"), and revisit when BP 2027 is published and there is demand for a "budgetår 2027" view. If needed for a single year it is cheaper to hand-enter UO-level totals from the proposition as a small reviewed JSON.

## 5. SCB PxWebApi v2

Base: `https://api.scb.se/OV0104/v2beta/api/v2/` (the path still says `v2beta`; `/config` reports apiVersion 2.3.2). `/config`: licence `https://creativecommons.org/share-your-work/public-domain/cc0/`, source attribution "Källa: SCB", `maxDataCells` 150 000, rate limit `maxCallsPerTimeWindow` 30 per `timeWindow` 10 (seconds), data formats `json-stat2`, `csv`, `px`, `xlsx`, `html`, `json-px`, CORS enabled.

| Series                                         | Table     | Period                         | Request                                                                                                                                                       |
| ---------------------------------------------- | --------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| KPI, fastställda årsmedeltal, totalt, 1980=100 | `TAB4352` | 1980-2025 (updated 2026-01-15) | `GET /tables/TAB4352/data?lang=sv&outputFormat=json-stat2&valueCodes[ContentsCode]=*&valueCodes[Tid]=*` (variables: `ContentsCode` = `000000KL` Index, `Tid`) |
| BNP löpande priser, mnkr                       | `TAB3610` | 1980-2024 (updated 2026-05-29) | `GET /tables/TAB3610/data?lang=sv&outputFormat=json-stat2&valueCodes[Anvandningstyp]=BNPM&valueCodes[ContentsCode]=000000RQ&valueCodes[Tid]=*`                |

Notes:

- Omitting `ContentsCode` returns HTTP 400 `Missing selection for mandantory variable`; every table needs an explicit selection for each mandatory variable (get them from `/tables/<id>/metadata`). `curl` needs `-g` for the bracket syntax. Use `json-stat2` in the tool; the csv output is wide (years as columns).
- Values checked: KPI 2005 280.40, 2006 284.22, 2020 335.92, 2022 371.91, 2023 403.70, 2024 415.15, 2025 417.98. GDP (mn kr) 2006 3 117 499, 2022 5 816 415, 2023 6 143 187, 2024 6 443 039.
- Alternatives: `TAB7052` KPI annual average with 2020=100, 2005-2025; `TAB5621` GDP aggregated, 1950-2024; `TAB3102` GDP quarterly to 2026K2. Search: `GET /tables?query=<text>&lang=sv&pageSize=N`.
- GDP 2025 is not in the annual table yet. Options: show "andel av BNP" through 2024 only, or sum four quarters of `TAB3102` (not verified here). Recommended: through the last annual year, labelled.
- Real prices: factor to price level of the latest year L = KPI(L) / KPI(y), e.g. 2024 to 2025 prices: 417.98 / 415.15 = 1.0068.

## Proposed JSON shape for `src/data/budget/`

Committed, compact, deterministic (sorted keys, one decimal). Series are arrays aligned on a shared `years` list (index i is `years[i]`), `null` for missing. A prototype built from the 2025 and Prel 2 files:

| File               | Content                                                | Size, minified | Gzipped |
| ------------------ | ------------------------------------------------------ | -------------: | ------: |
| `expenditure.json` | 814 anslag keys x 20 years x (budget, ändring, utfall) |         349 KB |   72 KB |
| `revenue.json`     | 298 inkomsttitlar x 20 years x (budget, utfall)        |         108 KB |   29 KB |
| `macro.json`       | KPI and GDP per year, plus totals                      |         < 3 KB |         |

Pretty-printed with the repo formatter the files will be 2-3 times larger on disk (about 0.7 MB and 0.25 MB), which is fine for git. Pages should import only what they need (the totals aggregate for `/budget`, a per-UO slice for UO pages) so the client island stays small; the full files are for build-time use in Astro.

```jsonc
// expenditure.json
{
  "years": [2006, 2007, "...", 2025],
  "release": "Årsutfall utgifter 1997 - 2025, definitivt",          // provenance
  "uo": [{ "nr": 1, "namn": "Rikets styrelse" }],                    // restated names, 27 entries
  "anslag": [
    {
      "kod": "0901011",            // restated code as in the file; suffixed for discontinued: "0501003 2024"
      "uo": 9,
      "beteckning": "1:11",        // derived; discontinued: "1:3"
      "namn": "…",
      "upphort": null,             // or 2024 (from the code suffix)
      "budget": [null, 12.3],      // Statens budget
      "andrad": [null, 0.0],       // Ändringsbudgetar
      "utfall": [null, 11.9]
    }
  ],
  "ovrigt": {                      // the non-UO rows
    "nettoutlaning": [/* utfall per year */],
    "kassamassigKorrigering": [],
    "alderspension": [],
    "utgiftstak": [],
    "marginal": []
  }
}

// revenue.json
{
  "years": [2006, "...", 2025],
  "release": "Årsutfall inkomster 2006 - 2025, andra preliminära",
  "status": { "2024": "preliminary", "2025": "preliminary" },       // omitted = final; see cadence
  "typ": [{ "kod": "1000", "namn": "Statens skatteinkomster" }],
  "huvudgrupp": [{ "kod": "1100", "typ": "1000", "namn": "…" }],
  "titelgrupp": [{ "kod": "1110", "huvudgrupp": "1100", "namn": "…" }],
  "titlar": [{ "kod": "1111", "titelgrupp": "1110", "namn": "…", "budget": [], "utfall": [] }]
}

// macro.json
{
  "kpi": { "base": "1980=100", "source": "SCB TAB4352", "values": { "2006": 284.22 } },
  "bnp": { "unit": "mn kr", "source": "SCB TAB3610", "values": { "2006": 3117499 } }
}
```

Totals (`statensUtgifter`, `statensInkomster`, `saldo`, per year) are derived in `src/lib/budget/` from these files with the formula above and tested against the 2024 numbers in this document, rather than stored a second time. Hierarchy tables in `revenue.json` keep names once instead of per row; the anslag file keeps one name per key (the latest). The `status` map has to be set by the ingestion tool, since the CSV has no status column.

## Gotchas

1. **Wrong endpoint, silent wrong file.** Annual and monthly downloads use different endpoints (`OpenDataArsUtfallPage` vs `OpenDataManadsUtfallPage`). Validate the header row of every download.
2. **Anslag code is not a stable identifier across releases.** Treat the code as unique only within one release, key time series on the restated code of the same file, and regenerate all years on refresh. Join the monthly file to the annual file on the `... utfallsår` columns.
3. **Discontinued anslag have a space-and-year suffix** (`0201003 2010`). A plain code and a suffixed code can share the 7 digits (`0501003` and `0501003 2024`) and are different anslag. URL slugs for discontinued anslag need the suffix (for example `1-3-2024`), and the epic's "one page per anslag in current nomenclature" means the 503 anslag of the latest year, with discontinued ones shown as rows on the UO page. 2006-2025 has 814 keys in total.
4. **Restated UOs apply to all years**, so a UO's time series differs from the figures that year's budget showed. Totals are unaffected.
5. **Non-UO rows carry their name in `Utgiftsområdesnamn`** and have an empty UO code; they use odd original codes (`919601` etc.) in the `utfallsår` columns.
6. **Empty is not zero** for several columns, and `Utfall` is empty for 713 anslag rows.
7. **Zip entry names are CP437-garbled** (`├Еrsutfall`); open the single entry, never match by name. Output filenames from `unzip` are locale dependent.
8. **Revenue finality is per type and level**, not per file: totals are cash-based and final at year end, title-level taxes are preliminary for about 1.5 years. The file carries no per-year status.
9. **Revenue is net of several deduction layers** (negative skattereduktioner in 1100, huvudgrupp 1700/1800/1900, type 7000). The revenue total is just the sum of all rows with their signs.
10. **Revenue title codes also have restated and original versions**: 22 of 242 rows in 2006 differ, none from 2015 on.
11. **SCB**: bracket syntax needs `curl -g`; every mandatory variable needs a selection; GDP lags KPI by a year.
12. **Politeness**: ESV and SCB are public-sector services; fetch sequentially, set a descriptive `User-Agent`, and cache. SCB allows 30 calls per 10 seconds.

## Changes to the epic design

- Monthly download endpoint differs and the annual endpoint silently returns the wrong file: ingestion validates headers (added to `hemsida-9ce.3`).
- Anslag identity: key on the restated code string, including the suffix for discontinued anslag, within a single release; join files on `utfallsår` columns. Route slugs for discontinued anslag include the suffix (decision for `hemsida-rn4` routes: anslag pages for the latest year's 503 anslag only, others as table rows).
- Totals formula confirmed as designed (UO 1-27 + nettoutlåning + kassamässig korrigering); the spike adds the exact revenue sum (all rows, signs as in the file) and the ceiling cross-check.
- Revenue status per year cannot be read from the data: ingestion takes it from configuration.
- `hemsida-rn4.7` (xlsx parsing) deferred; BP 2027 is not published yet.
- GDP lacks 2025, so "andel av BNP" ends one year before the latest budget year.
