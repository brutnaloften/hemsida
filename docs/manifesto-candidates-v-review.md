# Review of Vänsterpartiet 2022 manifesto candidates

Companion to `src/data/2022-2026/candidates/valmanifest-2022-v.json` (bead hemsida-uun.6). Page numbers are PDF pages (cover = 1), the same as `source.page` in the candidate file.

Source: `valmanifest-2022-v` (Vänsterpartiets valplattform 2022), 17 PDF pages. Extraction was done by Claude Code on the user's subscription (no Anthropic API calls), following `EXTRACTION_RULES` in `tools/lib/manifesto-extract.ts`, and review was done by AI as decided for seeding. 61 candidates, ids prefixed `val2022-v-`. V is in opposition and not party to the Tidö agreement, so there are no links and no agreement evidence. Every verdict is `unassessed`, except the 13 `vague` ones, which are `not_assessable` as for L, M, KD and S.

## Source provenance (read before trusting the metadata)

- V's own election document for 2022 is called a "valplattform" (election platform), not a "valmanifest"; the Swedish National Data Service's party-material archive (snd.se, Vivill) lists it as such. It is the only V election document for the 2022 election in that archive, and `kind: manifesto` is the closest source kind. It is considerably shorter and more programmatic than the other parties' manifestos, so it yields fewer concrete commitments.
- The party's own download link could not be found. `url` points at the archive's copy, which serves the PDF directly. `archive` is a Wayback snapshot of that URL (2026-02-14).
- `date` (2022-02-15) is the PDF creation date in the file metadata, not a verified publication date. The document was thus finished well before the election.
- PDF page 1 is an image cover without text; page 2 onwards is running text with printed page numbers one lower than the PDF page. Page text was extracted with `pdfminer.six` for quote checking (it keeps soft hyphens and ligatures); an earlier `pdfjs-dist` extraction suggested stray spaces inside words, but the text layer shows none, so quotes are not limited to stretches that avoid them. The extracted text used for quote checking is not committed.

## Validation

`node --experimental-strip-types tools/validate-manifesto-candidates.ts --source valmanifest-2022-v --pages-text <text>` reports 0 errors and 0 warnings (schema, unique ids, every quote verbatim on its cited page, no soft hyphens, no mid-word cuts).

## Coverage

Pages 2-5 (introduction and the platform's framing) hold no concrete commitments apart from the climate investment programme on p5. Covered: climate and energy (p5-6), housing, social insurance and pensions (p6-8), work and labour law (p8-9), safety and crime, asylum and violence against women (p10-11), welfare, taxes and healthcare (p11-14), education and culture (p14-15) and foreign and security policy (p16). Value statements, criticism of other parties and description of problems were skipped. Many passages state a direction rather than a measure; those are kept as `vague`.

## Notes

- Quotes are verbatim on the cited page. Some are short because they are the shortest span that carries the commitment; read the description for the full commitment.
- Polish pass (bead hemsida-ern): `full-sysselsattning` was dropped (the sentence is a boast that V is the only party with a policy for full employment, not a pledge) and the quotes of `battre-a-kassa`, `svensk-alliansfrihet`, `arbetstidsforkortning-sex-timmars-arbetsdag` and `tandvardsforsakring-med-hogkostnadsskydd` were lengthened.
- `avskaffa-marknadsskolan` is split across p14 and p15 ("med start nästa" / "mandatperiod"); the quote is the part on p14.
- Likely overlaps to assess together later: `statligt-byggbolag-och-aktiv-markpolitik`, `sankta-hyror-och-klimatsmarta-renoveringar` and `statligt-ansvar-for-att-bygga-bort-bostadsbristen` (all housing supply); `mer-resurser-till-skolan` and `mer-resurser-till-skolan-for-elever-som-behover-stod`; `statliga-satsningar-pa-fornybar-energi`, `massivt-investeringsprogram-gron-industri`, `gron-teknik-och-infrastruktur` and `gron-omstallningsfond` (all the p5 green investment programme). `statligt-ansvar-for-att-bygga-bort-bostadsbristen` (p11) largely repeats the housing-supply promise on p7 (`statligt-byggbolag-och-aktiv-markpolitik`).
- `progressiv-fastighetsskatt` and `hojd-skatt-pa-arv-lyxvillor-och-aktievinster` are typed `legislative`; the platform names no rates.
- Roles come from `TERM_ROLES`: V has no entry, so it defaults to `opposition`.
