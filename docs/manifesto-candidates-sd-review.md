# Review of Sverigedemokraterna 2022 manifesto candidates

Companion to `src/data/2022-2026/candidates/valmanifest-2022-sd.json` (bead hemsida-uun.4). Extraction and linking were done by an AI (Claude Code subagent on the user's subscription, no Anthropic API calls), following `EXTRACTION_RULES` in `tools/lib/manifesto-extract.ts`. 267 candidates, ids prefixed `val2022-sd-`, each with a proposed `link` to the Tidöavtalet (the party is a Tidö party, role `support`). Every verdict is `unassessed`. Promotion to promise files is a separate PR.

## Source

SD's 2022 programme is "Valplattform 2022. Inriktningsprogram för Sverigedemokraternas inflytande över svensk politik under nästa mandatperiod", 63 pages. It is not a short leaflet like KD's or L's manifesto but a programme of 48 policy sections, each ending in a "Sverigedemokraterna vill:" bullet list. The Swedish National Data Service (SND Vivill) archives it as the party's 2022 riksdag election manifesto, downloaded from the party's website.

- `url` is the SND copy (`https://snd.se/sv/vivill/file/sd/v/2022/pdf`), the same approach as `valmanifest-2022-s`. The original sd.se URL could not be found: guessed paths under `sd.se/wp-content/uploads/` returned 404. If someone knows it, replace `url` and keep the archive.
- `archive` is an existing Wayback snapshot (2026-05-17, 20260517111716) of that SND URL, checked byte for byte against the downloaded PDF (identical). No URL was submitted for archiving.
- `date` is 2022-04-11, the PDF creation date from the document metadata (Microsoft Word, created and modified 2022-04-11). It is not a publication date: the actual publication date was not found, so it is only an approximation and may be earlier than the real release. The election year (2022) is what the id prefix needs.

Page numbers are PDF pages (cover = 1), the same as `source.page`. The `section` field is the programme section heading. The PDF is extracted with PyMuPDF (`get_text("text", sort=True)`), which keeps bullet text in reading order; pdfminer.six gave the same words but scrambled the order of wrapped bullets. The PDF has no soft hyphens or ligature glyphs.

## Coverage

Types: budget 36, legislative 93, other_action 85, vague 47, outcome 3, inquiry 3. Proposed outcomes: weakened 58, included 55, not_addressed 154.

Candidates per section:

| Section                   | Candidates |
| ------------------------- | ---------- |
| Brott och straff          | 6          |
| Gängkriminalitet          | 7          |
| Brottsoffer               | 6          |
| Polisen                   | 6          |
| Terrorism                 | 4          |
| Integration               | 5          |
| Migration                 | 7          |
| Hedersproblematik         | 6          |
| Jämställdhet              | 6          |
| Ekonomi                   | 3          |
| Svenska jobb              | 6          |
| Småföretag                | 5          |
| Näringsliv                | 5          |
| Miljö                     | 7          |
| Klimat                    | 4          |
| Energi                    | 6          |
| Landsbygd                 | 5          |
| Bilen                     | 7          |
| Arbetsmarknadens villkor  | 7          |
| A-kassan                  | 3          |
| Offentligt slöseri        | 6          |
| Jakt                      | 5          |
| Jord- och skogsbruk       | 8          |
| Djurskydd                 | 6          |
| Bostäder                  | 5          |
| Infrastruktur             | 7          |
| Barnomsorg                | 6          |
| Skola och utbildning      | 8          |
| Ungdomsfrågor             | 6          |
| Pensioner                 | 5          |
| Äldrefrågor               | 7          |
| Familj                    | 7          |
| Sjukförsäkring            | 7          |
| Funktionsrätt             | 6          |
| Sjukvård                  | 7          |
| Psykisk ohälsa            | 6          |
| Kultur                    | 3          |
| Idrott                    | 2          |
| HBT+                      | 2          |
| Demokrati                 | 7          |
| Yttrandefrihet på nätet   | 2          |
| Utrikes                   | 3          |
| Norden och vårt närområde | 6          |
| Europa                    | 9          |
| Bistånd                   | 6          |
| Krisberedskap             | 7          |
| Försvar                   | 7          |

Selection rule: the "Sverigedemokraterna vill:" bullet lists (pp. 5-62) are the manifesto's own statement of commitments, so each bullet that states something to do, change, fund or achieve became one candidate. Bullets that only name a value or direction ("Bedriva en politik för hela Sverige", "Prioritera svenska medborgares intressen i den ekonomiska politiken", "Låta hela landet få del av välstånd", "Skapa förutsättningar för en livskraftig industri", "Prioritera svensk industri och konkurrenskraft", "Att flickor och pojkar ska ha samma livsutsikter, oavsett bakgrund", "Göra det svårare att exploatera den svenska välfärden", "Öka tryggheten i hela Sverige och i alla bostadsområden") were dropped; a few that name a policy area but give no assessable content were kept as `vague`. Each quote is the full bullet (or full sentence) verbatim from its page.

Skipped on purpose:

- Cover, table of contents and the introduction (pp. 1-4): framing and criticism of other parties.
- The prose of each section, which gives rationale and repeats the bullets. Prose-only commitments were not extracted separately, except one sentence on p. 5 (slopa straffrabatter och avtjäna hela straffet) that is not in the bullet list.
- Section "Utrikes" (p. 57) starts with a quoted paragraph that is a statement of values.

## Possible duplicates and overlaps

Ids are shown without the `val2022-sd-` prefix. The manifesto itself repeats several commitments in different sections; nothing was merged.

- `kravbaserad-integrationspolitik-gangen` (p6), `kravbaserad-integrationspolitik` (p11), `kravbaserad-integrationspolitik-arbete` (p18): the same bullet in three sections.
- `gor-det-lonsamt-att-arbeta` (p17) and `gor-det-mer-lonsamt-att-arbeta` (p18).
- `sank-skatten-pa-drivmedel` (p25), `sank-bensin-och-dieselpriset` (p26), `sank-skatten-pa-bensin-och-diesel` (p35).
- `stoppa-asylinvandringen-och-pausa-kvotflyktingar` (p6) and `stoppa-asylinvandring-fran-lander-utanfor-naromradet` (p12).
- `forbjud-heltackande-beslojning-i-offentliga-miljoer` (p14) and `forbjud-heltackande-slojor-i-offentliga-rummet` (p15); `forbjud-religios-beslojning-av-barn-i-skolan` (p38) is the school variant.
- `infor-tjanstemannaansvar` (p54) and `aterinfor-tjanstemannaansvaret` (p29).
- `statligt-helhetsansvar-for-personlig-assistans` and `samtliga-grundlaggande-behov-assistansgrundande` (p46).
- `kraftigt-forstark-elevhalsan` (p50) and `starka-insatser-for-ungas-psykiska-halsa` (p39).
- `bistandsmedel-for-att-stimulera-frivillig-atervandring` (p60), `aktiv-atervandringspolitik` (p11) and `uppmuntra-frivillig-aterundvandring` (p13).
- `stoppa-statligt-stod-till-extremistiska-organisationer` (p11) and `stoppa-bidrag-till-extremistiska-ideorganisationer` (p51).
- `gor-det-lonsamt-att-arbeta` / `oka-kraven-pa-icke-integrerade` are `vague`/broad and overlap with the Tidö benefit-and-work items.

## Linking to the Tidöavtalet

Links are editorial proposals made from the Tidö promise titles in `src/data/2022-2026/promises/tido-*.json`, not from re-reading the agreement text for every item. `included` means the agreement contains the commitment; `weakened` means it contains a smaller step (typically an inquiry, a narrower scope or a partial measure); `not_addressed` means no matching Tidö promise was found. No `strengthened` or `contradicted` outcome was proposed. Outcome labels describe the agreement only and imply no verdict.

The 50 links below were uncertain (the evidence did not settle the label, or the match is loose). Where in doubt the more conservative label was chosen (`weakened` rather than `included`, `not_addressed` rather than `weakened`). They need a human check:

- `kraftigt-upprustat-ratsvasende` -> weakened (`kriminalvarden-expanderas-kraftigt`)
- `slopa-straffrabatter-och-avtjana-hela-straffet` -> weakened (`avskaffa-mangdrabatt`, `ta-bort-straffreduktion-18-20-utred-straffrabatt-under-18`, `villkorlig-frigivning-undantag`)
- `utvisa-utlandska-kriminella-och-aterkalla-tillstand` -> weakened (`fler-utvisningar-pa-grund-av-brott`, `aterkalla-medborgarskap-dubbelt-medborgarskap`, `utvisning-bristande-vandel`, `utredning-utvidgade-mojligheter-aterkalla-uppehallstillstand`)
- `sank-straffmyndighetsaldern` -> weakened (`hemliga-tvangsmedel-under-15`, `ungdomskriminalitetsnamnder-och-bevistalan-under-15`)
- `hoj-skadestanden` -> weakened (`oversyn-brottsskadeersattning-skadestand`)
- `inskrankningar-av-rorelsefrihet-efter-straff` -> weakened (`vistelseforbud`)
- `forutsattningar-for-polisen-att-bekampa-brott` -> weakened (`hemliga-tvangsmedel-sou-2022-19`, `direktatkomst-register-brottsbekampande`, `tullverket-brottsbekampande-uppgifter`)
- `utvisa-terrordomda` -> weakened (`aterkalla-medborgarskap-dubbelt-medborgarskap`, `fler-utvisningar-pa-grund-av-brott`)
- `informera-nyanlanda-om-krav` -> included (`obligatorisk-samhallsintroduktion-och-samhallsorientering`)
- `stoppa-statligt-stod-till-extremistiska-organisationer` -> weakened (`utredning-utlandsk-finansiering-trossamfund`, `allmanna-arvsfonden-inriktning`)
- `prioritera-kvotflyktingar-fran-naromradet` -> weakened (`kvotflyktingar-900-per-ar`, `krav-unhcr-urval-kvotflyktingar`)
- `samordna-insatserna-mot-hedersforstryck` -> weakened (`insatser-hedersforstryck-kransningar-skolan`)
- `sarskilt-hedersbrott` -> weakened (`skarpt-hedersforstryck-lagstiftning`)
- `minska-kostnader-for-migration-bistand-eu-och-klimat` -> weakened (`asylsokandes-kostnadsansvar-fast-avgift`, `bistand-verktyg-mot-irreguljar-migration`, `oversyn-klimatstyrmedel-beraknings-konventioner`)
- `lattare-att-anstalla-och-battre-for-industrin` -> weakened (`lagre-anstallningskostnader-langtidsarbetslosa`, `lagre-administrativa-kostnader-foretag`)
- `forutsattningar-for-nyforetagande-och-entreprenorskap` -> weakened (`battre-villkor-sma-foretag-312-regler`, `forenklade-agarskiften-familjeforetag`)
- `arbetskraftsutbud-som-svarar-mot-arbetsmarknadens-behov` -> weakened (`skarpta-villkor-arbetskraftsinvandring-medianlon`, `undanta-yrkesgrupper-arbetstillstand`)
- `effektiv-klimatpolitik-med-globalt-perspektiv` -> weakened (`oversyn-klimatstyrmedel-beraknings-konventioner`, `fokusera-klimatstod-industri-laddinfrastruktur`)
- `forskning-for-lonsammare-fossilfri-energi` -> included (`ny-energiforskningsproposition`)
- `satsa-pa-atgarder-som-minskar-utslappen-mest-per-krona` -> weakened (`oversyn-klimatstyrmedel-beraknings-konventioner`)
- `mal-for-fossilfrihet-och-leveranssakerhet` -> weakened (`energipolitiskt-mal-fossilfritt`)
- `varna-det-kommunala-vetot-for-vindkraft` -> included (`tillaggsuppdrag-vindkraft-ersattning-kommuner`)
- `sank-skatten-pa-drivmedel` -> included (`lagre-drivmedelspriser`)
- `minska-anvandningen-av-dyra-biodrivmedel-fran-utlandet` -> weakened (`lagre-drivmedelspriser`)
- `oka-kraven-pa-icke-integrerade` -> weakened (`bryta-passiv-langtidsarbetsloshet`, `sankt-etableringsstod`)
- `stoppa-offentliga-medel-till-latsasjobb` -> weakened (`forenkla-arbetsmarknadspolitiska-insatser`)
- `stoppa-hetsjakten-pa-jagare-och-legala-vapeninnehavare` -> weakened (`bred-utredning-vapenlagen`)
- `oka-jordbrukets-konkurrenskraft-och-sjalvforsorjning` -> weakened (`djurvalfardsutredning-konkurrensforutsattningar-livsmedel`)
- `forenkla-regler-och-processer-for-planering-och-byggnation` -> weakened (`oversyn-bygglov-integrerade-solceller`)
- `sank-skatten-pa-bensin-och-diesel` -> included (`lagre-drivmedelspriser`)
- `hogre-krav-pa-fristaende-forskolor-och-tillsyn` -> included (`okade-befogenheter-skolinspektionen`, `skarpt-agarprovning-friskolor`)
- `prioritera-svenska-spraket-inom-barnomsorgen` -> weakened (`sprakforskola-utsatta-omraden-nyanlanda-barn`)
- `starka-insatser-for-ungas-psykiska-halsa` -> included (`reform-elevhalsan-elevhalsogaranti`, `nationell-strategi-psykisk-halsa-suicidprevention`)
- `oka-ekonomiskt-stod-till-mest-utsatta-aldre` -> weakened (`forslag-starka-pensionarernas-ekonomi`)
- `underlatta-privat-pensionssparande` -> included (`breddat-agande-boende-sparande-pension`)
- `forebyggande-socialtjanst-for-ungdomar-pa-glid` -> included (`ny-socialtjanstlag-brottsforebyggande`, `mellantvang-socialtjanstlagen`)
- `trygg-och-rattssaker-sjukforsakring` -> weakened (`sjukforsakring-rehabilitering-avstamningstillfallen`)
- `mer-resurser-till-forebyggande-arbete-och-rehabilitering` -> weakened (`sjukforsakring-rehabilitering-avstamningstillfallen`)
- `stoppa-valfardsbrottsligheten-inom-socialforsakringen` -> included (`ny-myndighet-valfardsutbetalningar-transaktionskonto`, `skarp-bidragsbrottslagen-foretagsstod`)
- `samtliga-grundlaggande-behov-assistansgrundande` -> weakened (`statligt-ansvar-personlig-assistans`)
- `bekampa-fusk-och-bedragerier-inom-lss` -> weakened (`skarp-bidragsbrottslagen-foretagsstod`, `ny-myndighet-valfardsutbetalningar-transaktionskonto`)
- `avskaffa-vardkoerna-och-infor-en-riktig-vardgaranti` -> weakened (`nationell-vardformedling`, `tjugofyra-timmarsgaranti-socialtjansten`)
- `nationellt-patientjournalsystem` -> weakened (`enhetlig-digital-infrastruktur-vard`)
- `tidigt-upptacka-och-behandla-psykisk-ohalsa` -> weakened (`gradvis-overgang-barn-vuxenvard-psykiatri-egeninskrivning`, `reform-elevhalsan-elevhalsogaranti`)
- `sammanhallning-kring-svensk-kultur-och-nationell-identitet` -> weakened (`svensk-kulturkanon`)
- `stoppa-bidrag-till-extremistiska-ideorganisationer` -> weakened (`utredning-utlandsk-finansiering-trossamfund`, `reform-folkbildningsradet-medelstilldelning`)
- `bekampa-islamism` -> weakened (`utredning-utlandsk-finansiering-trossamfund`)
- `bistandsmedel-for-att-stimulera-frivillig-atervandring` -> weakened (`stimulera-frivillig-aterundvandring-utredning`, `bistand-verktyg-mot-irreguljar-migration`)
- `effektivisera-och-utvardera-det-svenska-bistandet` -> weakened (`bistand-verktyg-mot-irreguljar-migration`)
- `villkora-bilateralt-bistand-med-mottagandesamverkan` -> included (`villkora-bistand-aterta-medborgare`, `eu-frysa-bistand-viseringar-icke-samarbetande-lander`)

## Verification

`node --experimental-strip-types tools/validate-manifesto-candidates.ts --source valmanifest-2022-sd --pages-text <pymupdf text>` reports 0 errors and 0 warnings (schema, unique ids, linked ids exist, every quote a verbatim substring of its cited page, no quote starts or ends mid-word).
