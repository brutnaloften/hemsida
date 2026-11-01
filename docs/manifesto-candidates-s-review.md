# Review of Socialdemokraterna 2022 manifesto candidates

Companion to `src/data/2022-2026/candidates/valmanifest-2022-s.json` (bead hemsida-uun.5). Page numbers are PDF pages (cover = 1), the same as `source.page` in the candidate file.

Source: `valmanifest-2022-s` (Socialdemokraternas valmanifest 2022, "Vårt Sverige kan bättre"), 17 PDF pages (printed as spreads, so printed page labels do not match). Extraction was done by Claude Code on the user's subscription (no Anthropic API calls), following `EXTRACTION_RULES` in `tools/lib/manifesto-extract.ts`, and review was done by AI as decided for seeding. 109 candidates, ids prefixed `val2022-s-`. S is in opposition and not party to the Tidö agreement, so there are no links and no agreement evidence. Every verdict is `unassessed`, except the 6 `vague` ones, which are `not_assessable` as for L, M and KD.

## Source provenance (read before trusting the metadata)

- The party's own download link for the manifesto could not be found. `url` points at the copy held by the Swedish National Data Service's party-material archive (snd.se, Vivill), which serves the PDF directly. `archive` is a Wayback snapshot of that URL (2026-04-19, content type application/pdf).
- `date` (2022-08-22) is the PDF creation date in the file metadata, not a verified publication date.
- The PDF has no text layer problems, but it is laid out in two-page spreads, so page text was extracted with `pdf-parse` (poppler was not available). The extracted text used for quote checking is not committed. Column order on a few pages is shuffled by the extractor; quotes were chosen within one contiguous passage.

## Validation

`node --experimental-strip-types tools/validate-manifesto-candidates.ts --source valmanifest-2022-s --pages-text <text>` reports 0 errors and 0 warnings (schema, unique ids, every quote verbatim on its cited page). A few quotes are deliberately cut at a soft hyphen in the PDF text; they are still verbatim.

## Coverage

All five chapters are covered: crime and segregation (p4-6), welfare (p7-10), climate and energy (p11-13), economy (p13-14) and foreign and security policy (p15-17). Pages 1-3 (cover, imprint, introduction) contain no commitments. Value statements, criticism of other parties and "we will keep doing X" passages with no new commitment were skipped; a few commitments that are only direction statements are kept as `vague`.

## Notes

- Free summer public transport for young people appears on p12 and p14; it is kept once (p12, the fuller wording).
- Known overlaps kept as separate promises because the manifesto words them separately: the new reseavdrag on p12 (`nytt-reseavdrag-for-klimatsmarta-resor`) and cheaper commutes on p14 (`billigare-arbetsresor-for-lang-pendling`) are likely one reform; language requirements appear on p7 (permanent residence, staff in förskola and äldreomsorg) and p10 (everyone working in welfare, `sprakkrav-och-utbildning-for-alla-i-valfarden`, which overlaps the p7 staff requirement). Assess them together later.
- `ingen-fastighetsskatt` is a pledge not to introduce a tax and is typed `legislative` (the closest type; the outcome is "no such law passed").
- Some quotes end where the PDF text is shuffled by the extractor or breaks across a column (for example `fler-vampliktiga-och-modern-materiel`, whose sentence continues in a separate text block); they are verbatim but stop before the end of the sentence.
- Roles come from `TERM_ROLES`: S has no entry, so it defaults to `opposition`.
