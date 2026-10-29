# Review of Kristdemokraterna 2022 manifesto candidates

Companion to `src/data/2022-2026/candidates/valmanifest-2022-kd.json` (bead hemsida-uun.3). Extraction and linking were done by an AI (Claude Code subagent on the user's subscription, no Anthropic API calls), following `EXTRACTION_RULES` in `tools/lib/manifesto-extract.ts`.

## Source

KD:s national manifesto "Redo för en ny regering. Valmanifest 2022" is a 12-page leaflet. The kristdemokraterna.se original is no longer online and has no Wayback snapshot, so the copy archived by SND Vivill (`https://snd.se/en/vivill/file/kd/v/2022/pdf`) is used. An existing Wayback snapshot of that URL (2026-02-15) was checked byte for byte against the downloaded PDF (identical). No URL was submitted for archiving.

The publication date could not be found (PDF metadata says 2021-02-05, which is clearly a template date). The source `date` is set to the election day, 2022-09-11, meaning "published no later than". Local and municipal KD manifestos are out of scope.

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
