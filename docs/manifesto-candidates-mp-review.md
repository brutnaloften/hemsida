# Review of Miljöpartiet 2022 manifesto candidates

Companion to `src/data/2022-2026/candidates/valmanifest-2022-mp.json` (bead hemsida-uun.7). Page numbers are PDF pages (cover = 1), the same as `source.page` in the candidate file.

Source: `valmanifest-2022-mp` (Miljöpartiet de grönas valmanifest 2022, "Alla ska med när Sverige ställer om"), 12 PDF pages, of which pages 3-10 carry the content (page 2 and 11 are blank, 12 is the web address). Extraction was done by Claude Code on the user's subscription (no Anthropic API calls), following `EXTRACTION_RULES` in `tools/lib/manifesto-extract.ts`, and review was done by AI as decided for seeding. 113 candidates, ids prefixed `val2022-mp-`. MP is in opposition and not party to the Tidö agreement, so there are no links and no agreement evidence. Every verdict is `unassessed`, except the 15 `vague` ones, which are `not_assessable` as for L, M, KD and S.

## Source provenance (read before trusting the metadata)

- The party's own download link could not be verified. `url` points at the copy held by the Swedish National Data Service's party-material archive (snd.se, Vivill), which serves the PDF directly. `archive` is a Wayback snapshot of that URL (2024-05-15, content type application/pdf).
- `date` (2022-08-18) is the PDF creation date in the file metadata, not a verified publication date.
- Page text was extracted with pdfminer.six (keeps soft hyphens) and is not committed. The PDF draws U+00AD as a visible hyphen ("hälso­ och", "hbtqi­flyktingar"); quotes write it as "-" ("hälso- och", "hbtqi-flyktingar"). The candidate file contains no U+00AD.

## Validation

`node --experimental-strip-types tools/validate-manifesto-candidates.ts --source valmanifest-2022-mp --pages-text <text>` (run against pdfminer text, with the promoted promise files out of the data dir) reports 0 errors and 2 loose-match warnings, no mid-word cuts. The soft-hyphen quotes ("hälso- och", "hbtqi-flyktingar", "sex- och samlevnad") now match strictly, because `normalizeText` also tries U+00AD as a visible hyphen. The 2 remaining are quotes that only match ignoring spaces and hyphens, for known reasons: `radda-kustens-ekosystem` (the PDF has a space before the full stop, "miljöer ."), and `nationell-strategi-mot-hemloshet-och-bostadsstiftelse` (the PDF has the spacing artifact "hemlös heten"; the quote has "hemlösheten").

## Coverage

All 19 chapters are covered: climate and energy (p3-4), nature, transport, consumption and animals (p4-5), welfare, housing, health, school and culture (p5-7), democracy and equality (p7-9), crime and preparedness (p9-10), aid, security and asylum (p10). The introduction and the "Vi vill:" lead-ins contain no commitments of their own. Background analysis and criticism of other parties were skipped; direction statements that are commitments but too unspecific to assess are kept as `vague`.

## Notes

- Every quote runs to the end of its bullet or sentence. One exception: the family-policy bullet continues on the next page ("... och stärka rättigheterna för / stjärnfamiljer"), so `konsneutral-familjepolitik` quotes only the first clause on page 8 and does not capture the stjärnfamilj part. The Nato/Turkey bullet is two promises (`inte-anpassa-utrikespolitiken-for-natomedlemskap`, `inte-salja-vapen-till-turkiet`), each quoting its own clause.
- Some bullets are phrased as a position rather than a measure ("Staten borde sälja SAS", "att Sverige verkar för en ekocidlagstiftning"). They are kept with the closest type.
- Overlaps kept as separate promises because the manifesto words them separately: `skydda-30-procent-av-sveriges-natur` and `skydda-30-procent-av-varldens-hav`; `fler-och-battre-betalda-poliser` and `storsatsa-pa-forebyggande-arbete-i-utsatta-omraden`; the two bistånd commitments on p10 (`over-1-procent-av-bni-till-bistand`, `inga-pengar-fran-bistand-till-flyktingmottagande`).
- Roles come from `TERM_ROLES`: MP has no entry, so it defaults to `opposition`.
- Polish pass (bead hemsida-sp8): the em dashes ("—") in the quotes of `dubbla-pappornas-foraldraledighet`, `minska-flygets-utslapp-hojd-flygskatt`, `samtyckeskultur-och-likvardig-sex-och-samlevnadsundervisning` and `statlig-laddinfrastruktur` were restored to match the PDF. The stjärnfamilj part of the family-policy bullet stays untracked: it spans p.8-9, so no single-page verbatim quote exists.
