# Review of Miljöpartiet 2022 manifesto candidates

Companion to `src/data/2022-2026/candidates/valmanifest-2022-mp.json` (bead hemsida-uun.7). Page numbers are PDF pages (cover = 1), the same as `source.page` in the candidate file.

Source: `valmanifest-2022-mp` (Miljöpartiet de grönas valmanifest 2022, "Alla ska med när Sverige ställer om"), 12 PDF pages, of which pages 3-10 carry the content (page 2 and 11 are blank, 12 is the web address). Extraction was done by Claude Code on the user's subscription (no Anthropic API calls), following `EXTRACTION_RULES` in `tools/lib/manifesto-extract.ts`, and review was done by AI as decided for seeding. 112 candidates, ids prefixed `val2022-mp-`. MP is in opposition and not party to the Tidö agreement, so there are no links and no agreement evidence. Every verdict is `unassessed`, except the 15 `vague` ones, which are `not_assessable` as for L, M, KD and S.

## Source provenance (read before trusting the metadata)

- The party's own download link could not be verified. `url` points at the copy held by the Swedish National Data Service's party-material archive (snd.se, Vivill), which serves the PDF directly. `archive` is a Wayback snapshot of that URL (2024-05-15, content type application/pdf).
- `date` (2022-08-18) is the PDF creation date in the file metadata, not a verified publication date.
- Page text was extracted with `pdf-parse` (poppler was not available) and is not committed. Soft hyphens (U+00AD) in the PDF text were avoided in quotes; the candidate file contains none.

## Validation

`node --experimental-strip-types tools/validate-manifesto-candidates.ts --source valmanifest-2022-mp --pages-text <text>` reports 0 errors and 0 warnings (schema, unique ids, every quote verbatim on its cited page, no mid-word cuts).

## Coverage

All 19 chapters are covered: climate and energy (p3-4), nature, transport, consumption and animals (p4-5), welfare, housing, health, school and culture (p5-7), democracy and equality (p7-9), crime and preparedness (p9-10), aid, security and asylum (p10). The introduction and the "Vi vill:" lead-ins contain no commitments of their own. Background analysis and criticism of other parties were skipped; direction statements that are commitments but too unspecific to assess are kept as `vague`.

## Notes

- Quotes that stop at a line break (`... och`, `... att`) are verbatim but end before the sentence does, because the manifesto's bullets are wrapped across lines; they never cut a word.
- Some bullets are phrased as a position rather than a measure ("Staten borde sälja SAS", "att Sverige verkar för en ekocidlagstiftning"). They are kept with the closest type.
- Overlaps kept as separate promises because the manifesto words them separately: `skydda-30-procent-av-sveriges-natur` and `skydda-30-procent-av-varldens-hav`; `fler-och-battre-betalda-poliser` and `storsatsa-pa-forebyggande-arbete-i-utsatta-omraden`; the two bistånd commitments on p10 (`over-1-procent-av-bni-till-bistand`, `inga-pengar-fran-bistand-till-flyktingmottagande`).
- Roles come from `TERM_ROLES`: MP has no entry, so it defaults to `opposition`.
