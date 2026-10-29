# Review of Kristdemokraterna 2022 manifesto candidates

Companion to `src/data/2022-2026/candidates/valmanifest-2022-kd.json` (bead hemsida-uun.3). Extraction and linking were done by an AI (Claude Code subagent on the user's subscription, no Anthropic API calls), following `EXTRACTION_RULES` in `tools/lib/manifesto-extract.ts`.

## Source

KD:s national manifesto "Redo för en ny regering. Valmanifest 2022" is a 12-page leaflet. The source uses the party's own PDF on kristdemokraterna.se. The `archive` field is an existing Wayback snapshot of it (2026-10-01, 20261001075755), checked byte for byte against the downloaded PDF (identical). No URL was submitted for archiving. The SND Vivill copy (`https://snd.se/en/vivill/file/kd/v/2022/pdf`) was used for the first extraction and has the same text and page numbers; all 59 quotes validate on both PDFs.

The source `date` is 2022-08-11, the document creation date (the timestamp in the download URL decodes to the same day). Local and municipal KD manifestos are out of scope.

Page numbers are PDF pages (cover = 1), the same as `source.page`. The `section` field is the chapter heading.

## Coverage

59 candidates. The manifesto has four proposal chapters, each with a bullet list:

| Chapter     | Pages | Candidates |
| ----------- | ----- | ---------- |
| Sjukvård    | 4-5   | 14         |
| Trygghet    | 6-7   | 16         |
| Hjärtlandet | 8-9   | 16         |
| Äldre       | 10-11 | 13         |

Skipped on purpose:

- Cover and party leader's letter (pp. 1-3): analysis, criticism and values, with no commitments beyond the chapters. The letter's "Vi prioriterar vården / äldsta och yngsta / lantbruket / tryggheten" are statements of priority.
- Chapter introductions (pp. 4, 6, 8, 10): analysis of problems.
- The "Vårdköer ska bort" slogan and chart (p. 4).
- Page 12: a list of further policy areas (Fler jobb, Bra skola, En stram migration, Minskade klimatutsläpp, ...) that only names topics. The manifesto states KD also goes to election on proposals in these areas but gives none. This is the largest gap in the document, not in the extraction. Follow-up: KD:s own longer policy documents (not the manifesto) would be needed to cover those areas.

## Possible overlaps and soft items

- `fler-poliser-och-hojda-polisloner` (p7) and `fler-poliser-med-lokal-narvaro` (p9): the second adds local presence.
- `utbyggd-primarvard` (p9) and `fler-vardcentraler-pa-landsbygden` (p5) are close.
- `foraldrastodsprogram-till-alla-foraldrar` (p5) and `obligatoriskt-foraldrastod-i-alla-kommuner` (p7) are close.
- `stram-migrationspolitik`, `varna-vattenkraften` are typed `vague`.
- Sexualbrott (p7) is split into four candidates (general, 25 years, chemical castration, life for child rape) since each is a separate sentence-level commitment.
