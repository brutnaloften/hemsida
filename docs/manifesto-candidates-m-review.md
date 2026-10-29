# Review of Moderaterna 2022 manifesto candidates

Companion to `src/data/2022-2026/candidates/valmanifest-2022-m.json` (bead hemsida-uun.2). Page numbers are PDF pages (cover = 1), the same as `source.page` in the candidate file.

Source: `valmanifest-2022-m` (Moderaternas valmanifest 2022, "Så får vi ordning på Sverige", 40 pages), original at moderaterna.se with an existing Wayback snapshot as `archive`. Extraction and linking were done by Claude Code subagents on the user's subscription (no Anthropic API calls), following `EXTRACTION_RULES` in `tools/lib/manifesto-extract.ts` and the L precedent. 256 candidates, ids prefixed `val2022-m-`. Every verdict is `unassessed` on the candidates.

Verification: `node --experimental-strip-types tools/validate-manifesto-candidates.ts --source valmanifest-2022-m --pages-text tools/out/valmanifest-2022-m.txt` reported 0 errors before promotion (schema, unique ids, every quote verbatim on its cited page). Type split: legislative 120, other_action 62, budget 49, outcome 15, inquiry 6, vague 4.

## Coverage and skipped

- Pages 1-3 (cover, table of contents, introduction), the statistics boxes and charts, and page 40 contain no commitments and were skipped. Candidates cover pages 4-39.
- The "Över 50 reformer" sentence on p10 is a package summary, not a concrete commitment, and was dropped in review.
- Review found that about 70 quotes had stopped at the first PDF line of a wrapped bullet and extended them to the end of the bullet.

## Duplicates dropped

The manifesto repeats some bullets in two chapters. One copy of each was dropped (candidate and promise):

- `val2022-m-aldrefridsbrott`: kept the fuller p15 wording (it was the `-2` entry and now has the base id).
- `val2022-m-obligatorisk-sprakforskola`: kept p26, dropped the p34 repeat.
- `val2022-m-minska-delade-turer`: kept p9, dropped the p32 repeat.
- `val2022-m-nationell-samordning-utbildningsplatser`: kept p8, dropped the p35 repeat.

## Vague promises

4 candidates are typed `vague` and promoted as `not_assessable` with a reason, as in the L promotion (`docs/data-model.md`): `val2022-m-stopp-for-betygsinflation`, `val2022-m-kortare-utbildningar-yrkesutbildning`, `val2022-m-varna-fria-forskningen`, `val2022-m-nolltolerans-hedersbrott`.

## Linking

Links target the promoted `tido-*` promises. 29 proposals carry an "Osäker:" rationale (kept at the weaker label). Label corrections made in review against the Tidö text:

- `underlatta-ersattning-brottsoffer`: included -> weakened (Tidö only says the rules are reviewed).
- `starka-vardens-medarbetare`: not_addressed -> weakened (workforce survey and national commitment).
- `jamstalldhet-hbtq-samhallsorientering`: not_addressed -> weakened (mandatory samhällsorientering).
- `se-over-elprisomraden`: weakened -> included.
- `stoppa-bidrag-till-hbtq-hat`: -> weakened (arvsfonden inquiry).
- `olaga-frihetsbegransning-nytt-brott`: -> weakened (honour-oppression legislation).
- `starka-jordbruket-livsmedelsproduktion`: -> weakened (competitiveness review).
- `fortsatt-industriklivet`: included -> weakened (the Tidö text only focuses the climate support on industry).

Outcome counts: included 57, weakened 67, not_addressed 132.
