# Review of Liberalerna 2022 manifesto candidates

Companion to `src/data/2022-2026/candidates/valmanifest-2022-l.json` (bead hemsida-chv.6). Nothing has been deleted or merged; every editorial call is left to the reviewer (hemsida-chv.8). Page numbers are PDF pages (cover = 1), the same as `source.page` in the candidate file; the printed page number in the manifesto is the PDF page minus 1.

Extraction was done by a Claude Code subagent on the user's subscription (no Anthropic API calls), reading the PDF text page by page and following `EXTRACTION_RULES` in `tools/lib/manifesto-extract.ts`. 233 candidates, ids prefixed `val2022-l-`, `link` empty (linking is hemsida-chv.7). Every verdict is `unassessed`. The `section` field is `<chapter heading> > <point number>. <point heading>`.

Verification: `node --experimental-strip-types tools/validate-manifesto-candidates.ts --source valmanifest-2022-l --pages-text tools/out/valmanifest-2022-l.txt` reports 0 errors (schema, unique ids, every quote verbatim on its cited page). Type split: legislative 105, other_action 76, vague 27, budget 15, outcome 6, inquiry 4.

## Coverage of numbered points

The manifesto has 75 numbered points (pp. 4-19). Every one is covered by at least one candidate; no numbered point was skipped.

| Chapter     | Points | Pages |
| ----------- | ------ | ----- |
| Skolan      | 1-14   | 4-5   |
| Integration | 15-22  | 6-7   |
| Tryggheten  | 23-32  | 8-9   |
| Klimatet    | 33-41  | 10-11 |
| Jobben      | 42-51  | 12-13 |
| Välfärden   | 52-59  | 14-15 |
| Demokratin  | 60-69  | 16-17 |
| Omvärlden   | 70-75  | 18-19 |

Skipped on purpose (not numbered points): the cover, the party leader's letter (pp. 2-3) and the introductory text of each chapter. They are analysis and criticism of opponents, with no commitments beyond what the numbered points repeat.

Parts of numbered points that were not turned into a candidate:

- Point 6 "Nej till lottning": the rejection of lotteries and of manipulating school areas is one candidate together with the commitment to make school choice compulsory and coordinated (`obligatoriskt-samordnat-skolval`).
- Point 4: "friheten att välja skola är här för att stanna" is a value statement.
- Point 52: "Bristyrken ska bli drömjobb" is a slogan and was skipped.
- Point 70: the slogan "Ensam är inte stark utan bara ensam" (p. 18) was skipped.
- Point 22: the sentence about positive spirals is rationale and was not extracted.

## Possible duplicates and overlaps

Ids are shown without the `val2022-l-` prefix.

| Ids                                                                                                                                                              | Pages       | Issue                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `sank-skatten-pa-sparande`<br>`sank-skatten-pa-sparande-for-att-bygga-upp-buffert`<br>`forsta-300000-kronorna-pa-isk-skattefria`                                 | 13, 17, 13  | Lower taxation of savings appears in point 48 and again in the feminism point 64; the ISK exemption is the concrete form.                      |
| `skattefria-forsta-100000-kronorna`<br>`nytt-brett-jobbskatteavdrag`<br>`sank-skatten-pa-lagsta-lonerna-med-1000-kronor`                                         | 6, 12, 12   | Three tax cuts on earned income with overlapping aims; the 100 000 kronor exemption (p6) may be the same reform as the broad jobbskatteavdrag. |
| `skolgang-fri-fran-separatistisk-paverkan`<br>`ta-tillbaka-makten-fran-separatister`                                                                             | 6, 6        | Same sentence in point 16; both are vague.                                                                                                     |
| `stopp-religiosa-friskolor`<br>`forbud-utlandska-icke-demokratiska-agare`<br>`skolgang-fri-fran-separatistisk-paverkan`                                          | 5, 5, 6     | Overlapping school-sector measures against religious and separatist influence.                                                                 |
| `forstatliga-skolan`<br>`statlig-skolpeng`<br>`statliga-skolakuter`<br>`flytta-finansieringsansvaret-for-skola-och-lss-till-staten`                              | 4, 4, 4, 13 | State takeover of schools is repeated in point 49 as a financing change; the skolpeng and skolakut are first steps of the first.               |
| `sank-extraskatten-pa-el`<br>`sank-elmomsen`                                                                                                                     | 11, 11      | Same quote used for both (two taxes in one sentence); keep split or merge.                                                                     |
| `europeisk-koldioxidskatt`<br>`klimattullar`                                                                                                                     | 11, 11      | Same quote used for both (one sentence).                                                                                                       |
| `sank-arbetsgivaravgiften-for-smaforetagare`<br>`sank-arbetsgivaravgiften-for-att-anstalla-unga`                                                                 | 13, 13      | Same quote used for both.                                                                                                                      |
| `hogre-straff-for-sexualbrott`<br>`skarpta-straff-vapenbrott-valdtakt-utpressning`                                                                               | 9, 8        | Both raise penalties for sexual offences.                                                                                                      |
| `skarpta-straffen-for-hedersrelaterade-brott`<br>`bredda-kriminaliseringen-oskuldskontroller-uppfostringsresor`<br>`utvisning-ska-alltid-provas-vid-grova-brott` | 7, 7, 9     | Honour-crime measures spread across points 21 and 31.                                                                                          |
| `battre-villkor-och-hogre-loner-for-poliser`<br>`na-33000-poliser`                                                                                               | 8, 8        | The pay measure is a means to the 33 000 target.                                                                                               |
| `ungdomsfangelser`<br>`forlang-maximal-vardtid-sluten-ungdomsvard`<br>`fler-sarskilda-ungdomshem`<br>`ingen-ko-till-akut-omhandertagande-av-unga-valdsutovare`   | 9           | Four parts of point 29; the last is an outcome statement tied to the others.                                                                   |
| `fler-sarskilda-undervisningsgrupper`<br>`tusen-fler-speciallarare`                                                                                              | 4, 4        | The speciallärare funding is the means for the undervisningsgrupper.                                                                           |
| `fler-verktyg-for-stok-och-oordning`<br>`fler-sarskilda-undervisningsgrupper`<br>`okad-ratt-for-larare-att-agera-mot-elever`                                     | 7, 4, 5     | Order and discipline measures in three places.                                                                                                 |
| `okad-ratt-for-larare-att-agera-mot-elever`<br>`tydliggor-i-skollagen-att-lararen-bestammer`                                                                     | 5, 5        | Both from point 8; the second is the legal form of the first.                                                                                  |
| `sprakkunskaper-for-all-personal-i-aldreomsorgen`<br>`nedsatt-forsorjningsstod-om-man-inte-lar-sig-svenska`                                                      | 15, 6       | Different measures; listed because both are language requirements, likely not duplicates.                                                      |
| `reform-av-foraldraforsakringen-och-flerbarnstillagget`<br>`ny-foraldraforsakring`                                                                               | 13, 17      | Parental insurance reform in both point 45 (aim: work) and point 64 (aim: equality).                                                           |
| `statliga-lanegarantier-omfattar-karnkraft`<br>`modernisera-regelverken-for-karnkraft`<br>`mojliggor-fler-nya-reaktorer`                                         | 10          | Closely related sub-points of point 34.                                                                                                        |
| `bred-oversyn-av-vardens-organisering-och-finansiering`<br>`staten-tar-storre-ansvar-for-sjukvardens-strategiska-planeri`                                        | 14, 14      | The review is the route to the state taking more responsibility.                                                                               |
| `pensionsgas`<br>`sank-skatten-pa-pensioner`<br>`aterinfor-avdrag-for-privat-pensionssparande`                                                                   | 15          | Three pension-income measures in point 59 with different instruments.                                                                          |
| `fossilfri-kollektivtrafik-2030`<br>`fossilutslappen-fran-transportsektorn-ska-bort`                                                                             | 11, 11      | The 2030 target is a part of the broader aim.                                                                                                  |
| `stark-eu-som-frihandelsunion-med-fordjupad-inre-marknad`<br>`fler-frihandelsavtal-med-omvarlden`<br>`handels-och-framjandepolitik-for-en-friare-varld`          | 19          | Trade policy repeated in points 73 and 75.                                                                                                     |
| `okat-ekonomiskt-politiskt-och-militart-stod-till-ukraina`<br>`helhjartat-stod-till-ukraina`<br>`snabbspar-for-ukrainskt-eu-medlemskap`                          | 18, 18, 19  | Support for Ukraine in points 72-73.                                                                                                           |

## Vague or hard to track

Candidates typed `vague` (27 in total):

`battre-arbetsmiljo-lararna`, `avlastning-karriar-fortbildning-lon-lararna`, `jamstalld-skola-trygga-flickor-och-pojkar`, `stod-att-sikta-hogre-an-godkant`, `bygg-ut-forskolan-satsa-pa-svenska-spraket`, `ta-tillbaka-makten-fran-separatister`, `skolgang-fri-fran-separatistisk-paverkan`, `tryggare-kvarter-med-fler-agda-bostader`, `battre-skydd-och-stod-for-valdsutsatta-kvinnor`, `riktiga-klimatskatter`, `ingen-satsning-pa-hoghastighetsjarnvag`, `varna-allemansratten-och-skogsbruket`, `myndigheter-battre-stod-och-tydligare-forvantan-att-forsorja`, `konkurrenskraftiga-och-lattforstaliga-skattenivaer`, `likvardiga-villkor-och-skatter-i-hela-landet`, `fungerande-vagnat`, `goda-arbetsvillkor-fler-kollegor-och-bra-loneutveckling-i-va`, `minska-detaljstyrning-och-byrakrati-i-varden`, `tandvardens-finansiering-liknar-annan-sjukvard-steg-for-steg`, `brett-programutbud-i-public-service`, `oka-trycket-pa-arbetsgivare-att-erbjuda-jamstallda-loner`, `regelverk-och-upphandlingar-som-oppnar-for-ideburna-aktorer`, `asylratten-varnas-den-med-skal-ska-stanna`, `alla-skolor-star-upp-for-alla-manniskors-lika-varde`, `tatare-samverkan-mot-inre-och-yttre-hot`, `ny-vardesstyrd-utrikespolitik`, `handels-och-framjandepolitik-for-en-friare-varld`.

Also worth a look although typed otherwise:

- `ingen-satsning-pa-hoghastighetsjarnvag` is a negative commitment (not to fund high-speed rail); consider whether it counts as a promise.
- `kommunala-vetot-mot-vindkraft-ska-besta`, `starkt-besittningsskydd` and `varna-allemansratten-och-skogsbruket` are commitments to keep the status quo.
- Several `outcome` candidates (`inga-utsatta-omraden-2030`, `na-33000-poliser`, `fossilfri-kollektivtrafik-2030`) have a measurable target but no stated means.
- `bistand-en-procent-av-bni` and `forsvarsanslag-2-procent-av-bnp-2025` are budget targets that depend on the budget year; both were typed `budget`.
- Point 18 `nedsatt-forsorjningsstod-om-man-inte-lar-sig-svenska`: the manifesto sentence lacks a verb ("i normalfallet kunna få"); the quote is verbatim, including the typo.

## Items that bundle several commitments

These candidates were kept as one because the manifesto states them as one sentence or clause with one instrument, but a reviewer may want to split them:

- `skarpta-straff-vapenbrott-valdtakt-utpressning` (p8): three offence types in one clause.
- `staten-tar-storre-ansvar-for-sjukvardens-strategiska-planeri` (p14): four areas (planning, highly specialised care, preparedness, competence supply).
- `forfattningsdomstol` (p16) and `skydd-i-lag-for-public-services-oberoende` (p16): a single institutional change each.
- `ny-dagersattning-med-krav-pa-motprestation` (p12): a new benefit plus the counter-performance requirement.
- Long points were split into one candidate per instrument: point 38 (transport) into seven candidates, point 47 (taxes on knowledge and work permits) into seven.
- `okat-ekonomiskt-politiskt-och-militart-stod-till-ukraina` (p18): economic, political and military support in one sentence.
- `behovsbostader` (p13): a new housing system with an example target group.
- Split on purpose, sharing a quote: `sank-elmomsen`/`sank-extraskatten-pa-el`, `europeisk-koldioxidskatt`/`klimattullar`, `sank-arbetsgivaravgiften-for-smaforetagare`/`sank-arbetsgivaravgiften-for-att-anstalla-unga`.

## Data notes

- Two typos in the manifesto text are preserved in quotes: "skollaget" (p5, point 8) and "att i här i Sverige" (p17, point 65).
- Page text was extracted with pdf.js (no `pdftotext` on the machine); the validator was run with `--pages-text` on that file. Re-running with poppler's `pdftotext` is expected to give the same result because quotes are normalised for whitespace, hyphenation and dashes.
