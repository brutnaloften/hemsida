# Review of Centerpartiet 2022 manifesto candidates

Companion to `src/data/2022-2026/candidates/valmanifest-2022-c.json` (bead hemsida-uun.8). Page numbers are PDF pages (cover = 1), the same as `source.page` in the candidate file; printed page numbers are one higher than the PDF page (PDF page 7 is printed page 8).

Source: `valmanifest-2022-c` (Centerpartiets valmanifest 2022, "För Sveriges bästa"), 25 PDF pages. Extraction was done by Claude Code on the user's subscription (no Anthropic API calls), following `EXTRACTION_RULES` in `tools/lib/manifesto-extract.ts`, and review was done by AI as decided for seeding. 105 candidates, ids prefixed `val2022-c-`. C is in opposition and not party to the Tidö agreement, so there are no links and no agreement evidence. Every verdict is `unassessed`, except the 23 `vague` ones, which are `not_assessable` as for L, M, KD, S and V.

## Source provenance (read before trusting the metadata)

- This is the party's full national election manifesto (a "valmanifest", not a shorter platform). It is organised as priority themes, each followed by a "reformagenda" bullet list; the bullet lists are where nearly all commitments live.
- `url` is the PDF linked from the party's press page "Centerpartiets valmanifest: För Sveriges bästa" (centerpartiet.se, dated 2022-08-05). The file name on the party site is `Valmanifest 2022 Utskrift ny.pdf`; the numeric part of the URL shows it was re-uploaded to the site later than 2022. `archive` is a Wayback snapshot of that URL (2026-10-01).
- `date` (2022-08-12) is the PDF creation date in the file metadata (title "SOR271813_Valmanifest Centerpartiet 2022_web", last modified 2022-08-18), not a verified publication date. The press page announcing the manifesto is dated 2022-08-05, a week earlier, so the manifesto text was public by then; the PDF used here may be a slightly later print of it.
- Not used: the snd.se (Vivill) copy of C's 2022 manifesto is an image-only "Print To PDF" file without a text layer, so it cannot be checked mechanically. Local and regional C manifestos for 2022 (Linköping, Västra Götaland and others) are separate documents and are out of scope.
- The text layer has some stray spaces inside words around double letters ("stra ff", "e ff ektiv", "o ff entlig", "di ff erentierade") and the odd line-break hyphenation. Page text was extracted with `pdfjs-dist` (poppler was not available). Quotes were chosen from stretches free of such artifacts, and line-break hyphens were removed (for example "bottentrålning"). The extracted text used for quote checking is not committed.

## Validation

`node --experimental-strip-types tools/validate-manifesto-candidates.ts --source valmanifest-2022-c --pages-text <text>` reports 0 errors and 0 warnings (schema, unique ids, every quote verbatim on its cited page, no soft hyphens, no mid-word cuts).

## Coverage

Pages 2-6 (contents, introduction, priorities) hold no commitments beyond the one on not cooperating with Sverigedemokraterna (p5). Covered: climate and energy (p7-8), rural policy (p10-11), gender equality and violence against women (p11-13), business, jobs and integration (p15-16), household and state economy (p16-17), health and care (p18-19), liberal democracy and rule of law (p20-21) and the "samhällskontrakt" chapter on defence, crime and schools (p22-23). Value statements, criticism of other parties, descriptions of problems and boasts about past achievements (such as the pension increase and the arbetsmarknadsreform) were skipped. Many bullets state a direction without a measure; those are kept as `vague`.

## Notes

- Several quotes end at a word boundary or start mid-sentence because the surrounding words contain extraction artifacts. Examples: `hojt-straff-for-sexualbrott-och-kvinnofridskrankning` ("för sexualbrott, grov fridskränkning och grov kvinnofridskränkning." - the verb "höja straffen" sits in the artifact-ridden stretch and is stated only in the description), `nej-till-visitationszoner-och-preventiv-avlyssning` (the full list is in the description; the quote ends at the first comma), `bredda-och-fordjupa-investeraravdraget`, `starkare-skydd-for-personer-i-demokratibarande-yrken`.
- `se-over-amorteringskravet`: the quote supports "se över amorteringskravet" (inquiry); the description also notes that the same page says the strengthened requirement should be abolished when rates normalise, which cannot be quoted cleanly.
- Likely overlaps to assess together later:
  - Violence against women and honour oppression: `kriminalisera-kontrollerande-beteende` and `kriminalisera-oskuldskontroller`; `handlingsplaner-mot-vald-och-hedersforstryck` and `nationell-franvarostatistik-for-att-upptacka-hedersvald`.
  - Care: `enkel-vag-in-vid-stressrelaterad-ohalsa` (p13) and `battre-psykiatri-och-kortare-bup-koer` (p19); `samma-barnmorska-genom-graviditet-och-forlossning` (also stated on p18).
  - Preschool: `forskola-och-fritidsverksamhet-for-alla` is stated twice (p12 and p13); only the p13 bullet is kept.
  - Police: `polistathet-till-eu-snittet-och-oppna-polisstationer` is also stated on p9 and p22 (reopening rural police stations); one candidate covers all three.
  - Wind power and local benefit: `ersattning-och-lokal-nytta-av-vindkraft` and `kriskommission-och-snabbare-vindkraftstillstand`; `rensa-upp-regler-pa-landsbygden`, `reformera-strandskyddet` and `cirkular-ekonomi-med-regelforenklingar`.
  - Schools: `kvalitetskrav-for-vinstutdelning-och-ratssaker-betygssattning`, `stang-daliga-skolor`, `skarpt-krav-pa-utlandska-skolagare-och-aktivt-skolval` and `hogst-halften-av-skolplatserna-efter-kotid`; `betygsinflationen-ska-ordnas-upp` overlaps the betyg part.
  - Skill supply and jobs: `forenkla-nystartsjobb-och-bredda-etableringsjobb`, `intensivar-for-snabbare-integration`, `utrikesfodda-kvinnor-in-pa-arbetsmarknaden`.
  - Taxes: `sank-det-totala-skattetrycket`, `inga-skattehojningar-som-skadar-jobb-sparande-eller-boende` and `sank-skatten-pa-jobb-och-foretagande` are overlapping general stances.
- `ej-samarbete-med-sverigedemokraterna` is typed `other_action` (comparable to the corresponding S promise) and is a statement about future conduct that can only be assessed after the term.
- Roles come from `TERM_ROLES`: C has no entry, so it defaults to `opposition`.
