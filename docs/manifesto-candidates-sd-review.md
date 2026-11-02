# Review of Sverigedemokraterna 2022 manifesto candidates

Companion to `src/data/2022-2026/candidates/valmanifest-2022-sd.json` (bead hemsida-uun.4). Extraction and linking were done by an AI (Claude Code subagent on the user's subscription, no Anthropic API calls), following `EXTRACTION_RULES` in `tools/lib/manifesto-extract.ts`. 254 candidates, ids prefixed `val2022-sd-`, each with a proposed `link` to the Tidöavtalet (the party is a Tidö party, role `support`). Every verdict is `unassessed`. Promotion to promise files is a separate PR.

## Source

SD's 2022 programme is "Valplattform 2022. Inriktningsprogram för Sverigedemokraternas inflytande över svensk politik under nästa mandatperiod", 63 pages. It is not a short leaflet like KD's or L's manifesto but a programme of 48 policy sections, each ending in a "Sverigedemokraterna vill:" bullet list. The Swedish National Data Service (SND Vivill) archives it as the party's 2022 riksdag election manifesto, downloaded from the party's website.

- `url` is the SND copy (`https://snd.se/sv/vivill/file/sd/v/2022/pdf`), the same approach as `valmanifest-2022-s`. The original sd.se URL could not be found: guessed paths under `sd.se/wp-content/uploads/` returned 404. If someone knows it, replace `url` and keep the archive.
- `archive` is an existing Wayback snapshot (2026-05-17, 20260517111716) of that SND URL, checked byte for byte against the downloaded PDF (identical). No URL was submitted for archiving.
- `date` is 2022-04-11, the PDF creation date from the document metadata (Microsoft Word, created and modified 2022-04-11). It is not a publication date: the actual publication date was not found, so it is only an approximation and may be earlier than the real release. The election year (2022) is what the id prefix needs.

Page numbers are PDF pages (cover = 1), the same as `source.page`. The `section` field is the programme section heading. The PDF is extracted with PyMuPDF (`get_text("text", sort=True)`), which keeps bullet text in reading order; pdfminer.six gave the same words but scrambled the order of wrapped bullets. The PDF has no soft hyphens or ligature glyphs.

## Coverage

Types: budget 34, legislative 86, other_action 85, vague 44, outcome 3, inquiry 2. Proposed outcomes: weakened 67, included 31, not_addressed 156.

Candidates per section:

| Section                   | Candidates |
| ------------------------- | ---------- |
| Brott och straff          | 6          |
| Gängkriminalitet          | 6          |
| Brottsoffer               | 6          |
| Polisen                   | 6          |
| Terrorism                 | 4          |
| Integration               | 4          |
| Migration                 | 6          |
| Hedersproblematik         | 5          |
| Jämställdhet              | 6          |
| Ekonomi                   | 3          |
| Svenska jobb              | 4          |
| Småföretag                | 5          |
| Näringsliv                | 5          |
| Miljö                     | 7          |
| Klimat                    | 4          |
| Energi                    | 6          |
| Landsbygd                 | 3          |
| Bilen                     | 6          |
| Arbetsmarknadens villkor  | 7          |
| A-kassan                  | 3          |
| Offentligt slöseri        | 6          |
| Jakt                      | 5          |
| Jord- och skogsbruk       | 8          |
| Djurskydd                 | 6          |
| Bostäder                  | 5          |
| Infrastruktur             | 6          |
| Barnomsorg                | 6          |
| Skola och utbildning      | 8          |
| Ungdomsfrågor             | 5          |
| Pensioner                 | 5          |
| Äldrefrågor               | 7          |
| Familj                    | 7          |
| Sjukförsäkring            | 7          |
| Funktionsrätt             | 6          |
| Sjukvård                  | 7          |
| Psykisk ohälsa            | 7          |
| Kultur                    | 2          |
| Idrott                    | 2          |
| HBT+                      | 2          |
| Demokrati                 | 6          |
| Yttrandefrihet på nätet   | 2          |
| Utrikes                   | 2          |
| Norden och vårt närområde | 6          |
| Europa                    | 9          |
| Bistånd                   | 6          |
| Krisberedskap             | 7          |
| Försvar                   | 7          |

Selection rule (this list was extended after review with `standardiserad-uppfoljning-av-sjalvmordsnara`, p50, which was missed at first): the "Sverigedemokraterna vill:" bullet lists (pp. 5-62) are the manifesto's own statement of commitments, so each bullet that states something to do, change, fund or achieve became one candidate. Bullets that only name a value or direction ("Bedriva en politik för hela Sverige", "Prioritera svenska medborgares intressen i den ekonomiska politiken", "Låta hela landet få del av välstånd", "Skapa förutsättningar för en livskraftig industri", "Prioritera svensk industri och konkurrenskraft", "Att flickor och pojkar ska ha samma livsutsikter, oavsett bakgrund", "Göra det svårare att exploatera den svenska välfärden", "Öka tryggheten i hela Sverige och i alla bostadsområden") were dropped; a few that name a policy area but give no assessable content were kept as `vague`. Each quote is the full bullet (or full sentence) verbatim from its page.

Skipped on purpose:

- Cover, table of contents and the introduction (pp. 1-4): framing and criticism of other parties.
- The prose of each section, which gives rationale and repeats the bullets. Prose-only commitments were not extracted separately, except one sentence on p. 5 (slopa straffrabatter och avtjäna hela straffet) that is not in the bullet list.
- Section "Utrikes" (p. 57) starts with a quoted paragraph that is a statement of values.

## Duplicates and overlaps

The manifesto repeats several commitments in different sections. Following `EXTRACTION_RULES` ("merge sentences that restate the same one") and the M precedent, repeats were dropped and the fullest version kept. Ids without the `val2022-sd-` prefix:

- `kravbaserad-integrationspolitik` (p11) kept; the same bullet on p6 and p18 dropped.
- `sank-bensin-och-dieselpriset` (p26) kept; the p25 and p35 "sänk skatten på drivmedel" bullets dropped.
- `gor-det-lonsamt-att-arbeta` (p17) kept; "göra det mer lönsamt att arbeta" (p18) dropped.
- `forbjud-heltackande-slojor-i-offentliga-rummet` (p15) kept; "förbjuda heltäckande beslöjning i offentliga miljöer" (p14) dropped. `forbjud-religios-beslojning-av-barn-i-skolan` (p38) is the school variant and kept.
- `aterinfor-tjanstemannaansvaret` (p29) kept; "införa tjänstemannaansvar" (p54) dropped.
- `stoppa-asylinvandringen-och-pausa-kvotflyktingar` (p6) kept; p12 "stoppa asylinvandringen från länder utanför närområdet" and p57 "stoppa migrationsrörelser" dropped.
- `uppmuntra-frivillig-aterundvandring` (p13) kept; "skapa en aktiv återvandringspolitik" (p11) dropped. The aid variant (p60) is kept separately.
- `stoppa-statligt-stod-till-extremistiska-organisationer` (p11) kept; "stoppa bidrag till extremistiska idéorganisationer" (p51) dropped.
- `rusta-upp-vag-och-jarnvagsnatet` (p35) kept; "förbättra underhållet av vägar och järnväg" (p25) and "rusta upp vägnätet" (p26) dropped.
- `starka-yttrandefriheten-pa-internet` (p56) kept; "värna yttrandefriheten på nätet" (p39) dropped.

Remaining near-overlaps that were kept because they differ in scope: `statligt-helhetsansvar-for-personlig-assistans` and `samtliga-grundlaggande-behov-assistansgrundande` (p46); `kraftigt-forstark-elevhalsan` (p50) and `starka-insatser-for-ungas-psykiska-halsa` (p39); `bevara-inrikesflyget-och-bromma-flygplats` (p25) and `bevara-regionala-flygplatser-som-beredskapsflygplatser` (p36); `bekampa-islamism` (p55) and `bekampa-internationell-terrorism-och-islamism` (p57).

## Linking to the Tidöavtalet

Links are editorial proposals. After review (PR #141), every included and weakened link was re-checked against the text of the Tidöavtalet and each note was rewritten to state only what the agreement says. Rules applied: an item that the agreement says "ska utredas", "ska övervägas", "ska ses över" or "ska tas fram förslag" is `weakened` at best; an unrelated link was removed and the candidate set to `not_addressed`; no mention is `not_addressed`. `included` means the agreement commits to the measure; `weakened` means a smaller step (inquiry, narrower scope, partial measure). No `strengthened` or `contradicted` outcome was proposed. Outcome labels describe the agreement only and imply no verdict.

Items still worth a human look (loose match, kept conservative):

- `starka-insatser-for-ungas-psykiska-halsa` -> included (`reform-elevhalsan-elevhalsogaranti`, `nationell-strategi-psykisk-halsa-suicidprevention`)
- `stoppa-valfardsbrottsligheten-inom-socialforsakringen` -> included (`ny-myndighet-valfardsutbetalningar-transaktionskonto`, `skarp-bidragsbrottslagen-foretagsstod`)
- `standardiserad-uppfoljning-av-sjalvmordsnara` -> weakened (`uppfoljning-patienter-suicidalt-beteende`)
- `bekampa-islamism` -> weakened (`utredning-utlandsk-finansiering-trossamfund`)

## Verification

`node --experimental-strip-types tools/validate-manifesto-candidates.ts --source valmanifest-2022-sd --pages-text <pymupdf text>` reports 0 errors and 0 warnings (schema, unique ids, linked ids exist, every quote a verbatim substring of its cited page, no quote starts or ends mid-word).
