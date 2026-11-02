# Frontend overhaul: UX and visual design

Bead `hemsida-081.7`, epic `hemsida-081`. Written 2026-11-02 from the design canvas approved by the owner the same day (private; boards Startsida, Partier, Partisida, Löftessida, Löftessida mobil, Visuellt system), the decisions banked in beads memories (`design-frontend-decisions`, `design-data-findings`) and the sibling beads `hemsida-081.3` to `.17`. The canvas is private, so this doc is the copy implementers work from. Style follows [budget-explorer.md](budget-explorer.md).

The canvas is a static mock-up. It was not checked against a running build, and no promise has Riksdag evidence or an assessment yet, so the timeline and assessment layouts are unverified (`hemsida-081.17`). Where the doc goes beyond the canvas, it says "proposed".

## Goals and journeys

The site tracks what parties promised and what became of it. Three kinds of visitor:

- **Voter or student** who arrives from a search or a shared link about one promise or one party. Needs: the exact quote, what has happened since, and our verdict (or an honest "not assessed yet").
- **Journalist** who compares parties or terms. Needs: same measure for every party, counts that come from data, links to Riksdag documents.
- **Returning reader** who wants to see what changed. Needs: assessment history, term switch that keeps the page type.

Core journeys:

1. Start -> search -> promise page.
2. Start -> party -> area -> promise page.
3. Partier -> compare parties by role and assessment status.
4. Promise page -> party page or agreement page (back-links).
5. Switch term on any term page and stay on the same page type.

Principles:

- The **assessment** (verdict, with written reasoning) is the main measure. Everything else is evidence.
- "Inte bedömt" says nothing about whether a promise is kept. The UI says so in plain words wherever it is the common state.
- Nothing about the Tidö agreement, party roles or term is hardcoded in UI code. It all comes from data (see [Term model](#term-model) and [Agreement layer](#agreement-layer)).
- Swedish UI text, static Astro, React islands only where interaction needs it, Tailwind v4 tokens, class-based dark mode.

## Information architecture

Header nav: **Partier, Löften, Budget, Om metoden**. The logo links to Start. "Löften" replaces "Sök". The mandate-period pill in the navbar is removed; the period bar replaces it.

| Page            | Purpose                                                                   | Term-dependent | Proposed URL                                   |
| --------------- | ------------------------------------------------------------------------- | -------------- | ---------------------------------------------- |
| Start           | Value proposition, search, key numbers, government formation, party cards | yes            | `/` (default term), `/<term>/`                 |
| Partier         | Comparison table of all parties by role                                   | yes            | `/<term>/partier`                              |
| Parti           | One party's promises in the term, grouped by area                         | yes            | `/<term>/partier/<id>`                         |
| Löfte           | One promise: quote, assessment, evidence timeline                         | no (term fact) | `/<term>/lofte/<id>` or existing `/lofte/<id>` |
| Löften          | Browse and search all promises (replaces Sök)                             | yes            | `/<term>/lofter` (and `/search` keeps working) |
| Överenskommelse | One agreement's points and how they map to manifesto promises             | yes            | `/<term>/overenskommelse/<slug>`               |
| Budget          | Year-based explorer, see [budget-explorer.md](budget-explorer.md)         | no             | `/budget/...`                                  |
| Om metoden      | Method, sources, how assessments are set                                  | no             | `/om-metoden`                                  |

URL details are proposed and owned by `hemsida-081.9`. Constraints: the term is a path segment so links keep context; GitHub Pages has no redirects, so the old `/partier/[party]` and `/lofte/[id]` stay as thin pages with a canonical link (or meta-refresh stubs); every link is built from `import.meta.env.BASE_URL` because `Layout.astro` sets `<base href>`.

## Term model

The mandate term (e.g. 2022-2026) is the top-level context.

- **One period bar** sits directly under the header on every term-dependent page (Start, Partier, Parti, Löften, Överenskommelse). Same component and placement everywhere.
- **One control**: a segmented control, one segment per term, each with the term in mono type and a subtitle. It becomes a dropdown on narrow screens or with more than three terms. Selected segment: white fill and 1 px ink outline, `aria-current="page"`. Touch target at least 44 px high.
- **Term in the URL.** Switching term stays on the same page type (Parti 2022-2026 -> Parti 2026-2030 for the same party; if the party has no data there, show the empty state below).
- **Subtitle varies by page:**
  - Overviews (Start, Partier, Löften): data status, "Löften insamlade" or "Insamling pågår".
  - Party page: the party's role in that term ("Regeringsparti", "Stödparti", "Opposition"). This replaces the old per-term tabs.
  - Promise page: no switcher at all; the term is shown as a fact in the sidebar ("Period 2022-2026").
- **Default term** = latest term with data. A newer term without data is still listed and labelled "Insamling pågår".
- **With one term** the bar still renders, so the layout does not shift when term two arrives.
- **Budget is year-based** and sits outside the term model: no period bar.
- **Roles belong to the term, never the party.** Government, support (stödparti) and opposition come from a per-term record (`hemsida-081.3`: `src/data/<term>/term.json` with per-party role, `agreements[]`, optional dated role changes). Party chips and groupings read the role from there.

## Agreement layer

A government agreement (e.g. Tidöavtalet) is an **optional, named layer**: zero, one or several per term. It is evidence about what the agreement text did with a manifesto promise. It is never an assessment and is never coloured or worded as good or bad.

Rules:

- Nothing in the UI mentions an agreement unless the term record lists one and (for per-party elements) the party stands behind it. With none, the agreement column, filter, badge, card and timeline step are absent, and the page says so in one plain line.
- Labels are built from **outcome + source `shortTitle`**, never the literal word "avtalet" or "Tidö". Today `AGREEMENT_OUTCOME_LABELS` in `src/schema/promise.ts` hardcodes "avtalet" and sources have only a long title; `hemsida-081.4` adds `shortTitle` (required for `government_agreement`) and one label helper.
- Outcome labels: `included` "Med i {namn}", `strengthened` "Skärpt i {namn}", `weakened` "Urvattnat i {namn}", `contradicted` "Motsägs av {namn}", `not_addressed` "Saknas i {namn}". Keep the badge to one line at 26 px height.
- Each agreement has **its own page** (decision `hemsida-081.6`): source with archive link, signatories, its points grouped by area and, per point, the manifesto promises it matched, plus manifesto promises it did not address. The 274 `tido-*` files appear only there. Party lists are manifesto-only and show just the per-promise badge with a link to the agreement page.
- Mid-term pledges outside a manifesto (KD Almedalen 2024, 4 promises) go in an "Övriga utfästelser" group at the end of the party page.
- The Start page explains the layer in "Från löfte till lag" with the step labelled "när det finns".

## Visual system

Concept: the reviewer's highlighter. Black text on white, one yellow highlight for what the parties actually said (quotes and the logo word "Löften"). Parties get neutral letter chips, no party colours. Colour is used only for status: violet for the agreement, a dedicated scale for the assessment.

### Fonts

- **Source Serif 4** (600/700, italic 500): headings, quotes, big numbers.
- **Inter** (400/500/600/700): UI, tables, labels, body.
- **IBM Plex Mono** (400/500): document ids, term labels, party chips, page references.

Load all three via `@fontsource` and remove the duplicate Inter load (Google Fonts `<link>` in `Layout.astro` plus `@fontsource-variable/inter`). Body is 17 px / 1.55 in Inter; list text 15-16 px; overlines 13-14 px, 600, uppercase, letter-spacing 0.08em.

### Colour tokens

Names are the canvas names; implementers map them to the existing shadcn CSS variables in `src/styles/globals.css` (`--background`, `--foreground`, `--muted`, `--muted-foreground`, `--border`) and add the new ones.

| Token          | Role                           | Light     | Dark      |
| -------------- | ------------------------------ | --------- | --------- |
| `--background` | Page ground                    | `#FFFFFF` | `#111317` |
| `--foreground` | Ink                            | `#14161A` | `#F2F2EE` |
| `--muted-fg`   | Secondary text                 | `#565B63` | `#A9ADB4` |
| `--muted`      | Surface (panels, period bar)   | `#F5F5F2` | `#1B1E23` |
| `--border`     | Rules                          | `#E2E2DC` | `#2C2F35` |
| `--highlight`  | Highlighter (quote, logo word) | `#FFE14D` | `#FFE14D` |

The highlight keeps dark ink text in both themes (`#14161A` on `#FFE14D`). Body secondary copy on the canvas also uses `#3A3E45` (light); fold it into `--muted-fg` or add `--foreground-soft`. Dashed outlines use `#8A8A84` (light) and `#6B6F76` (dark).

All text/background pairs must reach 4.5:1 in both themes (acceptance criterion of `hemsida-081.8`; the canvas values have not been measured). The existing `--chart-*` tokens that `globals.css` references but never defines (see E1 in budget-explorer.md) are defined in the same bead.

### Assessment badges (VerdictBadge)

Rounded (pill), 26 px in lists, 32-34 px in the assessment box. Neutral states have a **dashed border** so they never read as a finding; shape and border carry meaning, not only colour.

| Verdict          | Label             | Light (bg / text)     | Dark (bg / text)      | Notes         |
| ---------------- | ----------------- | --------------------- | --------------------- | ------------- |
| `unassessed`     | Inte bedömt       | none / `#3A3E45`      | none / `#C9CCD1`      | dashed border |
| `no_evidence`    | Inga belägg funna | `#F5F5F2` / `#3A3E45` | `#1B1E23` / `#C9CCD1` | dashed border |
| `not_assessable` | Ej bedömbart      | `#ECECE8` / `#3A3E45` | `#2C2F35` / `#D4D6DA` | solid         |
| `in_progress`    | Pågår             | `#DBEAFE` / `#1E3A8A` | `#172554` / `#BFDBFE` | solid         |
| `fulfilled`      | Uppfyllt          | `#166534` / `#FFFFFF` | `#052E16` / `#BBF7D0` | solid         |
| `partial`        | Delvis uppfyllt   | `#D9F99D` / `#365314` | `#1A2E05` / `#D9F99D` | solid         |
| `not_fulfilled`  | Ej uppfyllt       | `#FFEDD5` / `#7C2D12` | `#431407` / `#FED7AA` | solid         |
| `abandoned`      | Övergivet         | `#FEF3C7` / `#78350F` | `#451A03` / `#FDE68A` | solid         |
| `broken`         | Brutet            | `#991B1B` / `#FFFFFF` | `#450A0A` / `#FECACA` | solid         |

The enum keys above are indicative: map to the real verdict values in `src/schema/promise.ts` and replace `VERDICT_STYLES` in `src/lib/promise-labels.ts`. The canvas does not show a "not_assessable" pill beyond the table above; the same grey solid pill is used wherever it appears (162 promises today).

### Agreement badges (AgreementBadge)

Square corners (no radius), 26 px in lists, 32 px on the system board, violet. Label from the name-aware helper. Distinguishable without colour by fill, border style and weight.

| Outcome       | Light                                          | Dark                                                     |
| ------------- | ---------------------------------------------- | -------------------------------------------------------- |
| included      | bg/border `#5B21B6`, text `#FFFFFF`            | proposed: same fill, text `#FFFFFF`                      |
| strengthened  | bg/border `#5B21B6`, text `#FFFFFF`            | proposed: same as included                               |
| weakened      | bg `#EDE9FE`, border `#7C3AED`, text `#3B0764` | proposed: bg `#2E1065`, border `#A78BFA`, text `#EDE9FE` |
| contradicted  | as weakened but **dashed** border              | proposed: as weakened, dashed                            |
| not_addressed | ground bg, border `#C4B5FD`, text `#4C1D95`    | ground bg, border `#C4B5FD`, text `#DDD6FE`              |

Dark values for included, weakened and contradicted are not on the canvas (it only defines the light set plus the dark text of `not_addressed`); the proposed ones need a contrast check in `hemsida-081.8`. `included` and `strengthened` are visually identical on the canvas and differ only by label. Outcome words must read correctly in Swedish ("Skärpt i", "Motsägs av").

### Party chip (PartyChip)

Neutral letters in IBM Plex Mono: 44 px square on the system board, 40 px on cards, 72 px in the party header, 32 x 28 px inline on the promise page. Radius 8 px (6 px inline).

- **Filled** (`--foreground` background, `--background` text): government and support party in the selected term.
- **Outline** (2 px `--foreground` border): opposition.
- The role comes from the term record, never from the party. The same party can be filled in one term and outlined in the next.
- No party colours anywhere.

### Assessment-status bar

A 10 px bar on party cards, the Partier table and the party summary card. Until a party has assessed promises it renders a **dashed hatch** (`repeating-linear-gradient(135deg, #ECECE8 0 6px, #F7F7F4 6px 12px)` with a 1 px dashed `#A9A9A2` border) with the text "Inte bedömt ännu", so empty never looks like a result. When assessed, segments use the verdict colours above. The agreement split bar is a separate two-segment bar (`#5B21B6` included, `#A78BFA` weakened, remainder grey `#DCDCD6`) with the counts in text underneath ("57 med · 67 urvattnade · 132 saknas"). Bars are `aria-hidden`; the same numbers are in text.

### Timeline markers (TimelineMarker)

Vertical rule (2 px ink) with a marker per step, in date order:

| Step                                                 | Marker                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------- |
| Promise (valmanifest)                                | filled circle, 16 px, ink                                   |
| Agreement (only if present)                          | violet square, 14 px, 2 px `#5B21B6` border, `#EDE9FE` fill |
| Riksdag document (dir, SOU, Ds, prop, bet, SFS, mot) | ringed circle, 14 px, 3 px ink ring, ground fill            |
| Missing step ("ingen ... kopplad ännu")              | dashed circle, 12 px, 2 px dashed `#8A8A84`                 |

Each item has a mono meta line (`2022-04-11 · Valmanifest`), a title (`h3`), optional badge and description. Markers are decorative (`aria-hidden`); the meta line carries the type.

### Other components

- **Layout:** content max width 1200 px, 24 px side gutter (16 px on mobile). Cards: 1 px `--border`, radius 12 px. Primary button: ink fill, white text, 48-52 px high, radius 8 px. Inputs 44 px high, 1 px `#A9A9A2` border.
- **Header:** serif wordmark "Brutna Löften" with the yellow highlight on "Löften"; nav links with a 3 px ink underline on the current page; wrap, do not truncate (keeps the `hemsida-ea0` fix).
- **Quote block:** serif italic, `--highlight` background behind the quote text, quote marks inside the highlight; caption with page, PDF link and archive link.
- **Footer:** surface background, one-line description, links to Om metoden and the source repository.

## Page templates

Every page has: header, (period bar if term-dependent), breadcrumb (Start / Partier / name), `main`, footer. The exact copy is on the canvas; the structure is below.

### Start

1. Hero: overline with term and election, serif H1 ("Vad lovade partierna – och vad blev det av det?" with the second half highlighted), one-line value proposition, search form (`role="search"`, posts to Löften with `?q=`), and a key-numbers list on the right (promises, parties, assessed so far, Riksdag documents linked). **All numbers come from data**; the canvas figures (1 190, 8, 0, 0) are placeholders.
2. Government-formation box for the selected term: roles in three rows (Regering, Stödparti, Opposition) from the term record, next to the **agreement box**: the named agreement with date and point count and a one-line "belägg, inte bedömning" note, or "Ingen skriftlig överenskommelse" with a sentence saying promises are followed directly against Riksdag documents.
3. Status strip ("Var vi står just nu"): says plainly that "Inte bedömt" says nothing about whether a promise is kept; link "Så arbetar vi".
4. "Välj ett parti": party cards grouped by role (Regering, Stödparti, Opposition) with chip, name, role, promise count, "0 bedömda", hatch bar. The agreement split line (shortTitle chip plus counts) appears only for parties behind an agreement. Link "Jämför alla partier".
5. "Från löfte till lag": four steps in a row (Löftet, Överenskommelsen "när det finns", Riksdagen, Bedömningen).

### Partier

Caption-bearing table (`caption`, `scope` headers), inside a horizontally scrolling box on mobile. Columns: Parti (chip + name, link), Roll i perioden, Vallöften, Bedömning (status bar and "Inte bedömt ännu"), and, **only when the term has an agreement**, a column "I {shortTitle}" with the split bar and counts, or "Står inte bakom överenskommelsen" for parties outside it. Filter chips above: Alla partier / Regering / Stödparti / Opposition (`aria-pressed`; progressive enhancement, full table without JS). Legend for the agreement colours under the table when present. Two side panels: "Regeringsöverenskommelser" (agreement is not an assessment, or the none-this-term sentence) and "Roller byts mellan perioder".

### Parti

1. Header: breadcrumb, 72 px chip, serif H1 with the party name, one-line subtitle.
2. Summary row: **summary card** (term and role as overline, promises / assessed / not assessable, hatch bar, link to the manifesto source) and **agreement card** (only if the party stands behind an agreement: named link, date, split bar and counts; otherwise one plain line).
3. Body, two columns (sidebar stacks above the list on mobile): sidebar filters: search within the party, assessment checkboxes with counts, agreement outcome checkboxes (**only if the term has an agreement**), area select. List: result count and sort, then promises **grouped by area** (serif H2 with count, 2 px ink rule). Row: title, mono page reference, optional agreement badge, assessment badge; the whole row is one link, at least 44 px high.
4. "Visa fler områden (N kvar)" button: progressive loading, because a party can have 250+ promises across about 20 areas.
5. At the end, an "Övriga utfästelser" group for mid-term pledges, when the party has any.

The same template serves government, support and opposition parties; opposition just has no agreement elements.

### Löfte

Desktop: two columns (main, sidebar); mobile: one column.

Main:

1. Meta line: chip, party, role, "vallöfte 2022".
2. Serif H1 with the promise title.
3. Quote (`figure`): highlighted verbatim quote, caption with source, page, "Originalet (PDF)" and "Arkiverad kopia".
4. **Vår bedömning** box (2 px ink border): verdict badge, reasoning, date, history link. In the `unassessed` state the box says we have not set an assessment yet, that it will come when Riksdag documents are linked, with a written reasoning, and implies nothing.
5. **Vad har hänt?** timeline with the intro "Belägg i tidsordning. Belägg är fakta ur dokument; bedömningen ovan är vår tolkning av dem." Steps: manifesto, agreement (if any, with badge, name, page and a card linking to the agreement point), then Riksdag steps (Direktiv, SOU/Ds, Proposition, Betänkande, SFS, motion), each shown as a dashed "ingen ... kopplad ännu" step when missing. Votes on a betänkande are a collapsible per-party table ("Så röstade partierna": ja, nej, avstår, frånvarande). Budget evidence (`BudgetEntry`) joins the timeline.

Sidebar: **Om löftet** (typ, område, utskott, period, roll), **Bedömningshistorik** (empty text, link to changes in GitHub), **Saknas något?** (link "Föreslå en källa" to a prefilled GitHub issue), **Liknande löften från andra partier** (only if the data supports it; otherwise omit the block).

Mobile (390 px): header with menu button, breadcrumb "back to party", chip row, 32 px H1, quote, assessment box, timeline stays left-aligned with the rule at 6 px inset, votes in a `details`, full-width "Föreslå en källa" button. No layout shift; long titles wrap.

### Löften

Fuzzy search (uFuzzy, kept) with filters: term via the period bar, party, area, assessment, agreement outcome (when the term has one). Result rows are the same list rows as on the party page, plus the party chip. Filter state in the URL; `?q=` from the Start search; `/search` keeps resolving. Must handle all 1 468 promise files without jank and be keyboard accessible.

### Överenskommelse

Generated only for terms that have agreements. Shows the source with archive link, signatories, points grouped by area with the manifesto promises each point matched (the agreement evidence already stores `promises[]`), and the manifesto promises it did not address. Every `tido-*` promise must be reachable, with back-links to party pages. Detailed layout is left to `hemsida-081.15`; use the Parti list row and the AgreementBadge.

## Empty states and edge cases

| Case                               | Behaviour                                                                                                                        |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Nothing assessed (today)           | Hatch bar and "Inte bedömt ännu"; numbers show 0; status strip explains it means nothing about fulfilment                        |
| Term without data                  | Segment labelled "Insamling pågår"; term pages show "Löften för perioden samlas in" and a link back to the latest term with data |
| Party without promises in the term | Row in Partier with "Inga löften insamlade"; party page shows the role and a link to the other term                              |
| Promise without evidence           | Timeline shows manifesto step plus dashed missing steps; verdict `unassessed` or `no_evidence`                                   |
| Term with `agreements: []`         | No agreement column, filter, badge, card or step; one plain sentence on Start, Partier and Parti                                 |
| Party outside the agreement        | "Står inte bakom överenskommelsen" in Partier; no agreement card or badges on its page                                           |
| Long promise titles                | Wrap in lists and H1; never truncate the title; badges stay on one line                                                          |
| 250+ promises on a party page      | Group by area, "Visa fler områden"                                                                                               |

## Scenarios

The Start, Partier and Parti pages are verified against three fixtures (term-record variants; `hemsida-081.10` and `.16`). The canvas has a `scenario` toggle for the same three.

1. **Tidöavtalet 2022-2026** (real data). Government M, KD, L; support SD; opposition S, V, C, MP; agreement `tidoavtalet` (short title "Tidöavtalet", 14 Oct 2022, 274 points). Start shows the agreement box and agreement split on the four party cards; Partier has the extra column "I Tidöavtalet" with "Står inte bakom överenskommelsen" for S, V, C, MP; Parti M shows "57 med · 67 urvattnade · 132 saknas"; badges read "Med i Tidöavtalet", "Urvattnat i Tidöavtalet", "Saknas i Tidöavtalet".
2. **No agreement** (`agreements: []`). Same numbers, no agreement UI at all; Start shows "Ingen skriftlig överenskommelse"; Partier has no extra column and explains it in the panel; Parti shows the plain line; filters omit the agreement fieldset; the timeline has no agreement step.
3. **Differently named agreement.** Everything in scenario 1, but the name and short title come from the source (e.g. "Exempelavtalet"): badges read "Med i Exempelavtalet", column header "I Exempelavtalet". A test or story asserts that no "Tidö" or "avtalet" string appears outside data.

## Data findings

From the design pass (all filed as beads):

- **No per-term record of roles or agreements** (`hemsida-081.3`). Roles are repeated inside every promise file; agreement evidence only points at a source id. The site cannot state who governed, represent a term with no or several agreements, or show a government change mid-term.
- **Sources lack `shortTitle`** and `AGREEMENT_OUTCOME_LABELS` hardcode "avtalet" (`hemsida-081.4`).
- **`area` is free text** (`hemsida-081.5`): Moderaterna have 70 distinct values, with duplicates across parties (Skola/Skolpolitik, Rättsväsende/Rättsväsendet, Migration/Migrationspolitik, Energi/Energipolitik). Party pages and Löften group and filter by area, so a controlled list of about 15-25 areas must land first.
- **Placement of agreement points and mid-term pledges** was open; decided in `hemsida-081.6` (see [Agreement layer](#agreement-layer)).
- **No promise has Riksdag evidence or an assessment yet**; timeline and assessment layouts are unverified until `hemsida-4np.6` lands (`hemsida-081.17`).
- Counts at the time: 1 190 `val2022` promises + 274 `tido-*` + 4 KD = 1 468 files; verdicts 1 306 unassessed, 162 not assessable; agreement outcomes 432 not addressed, 206 weakened, 164 included.
- `globals.css` references `--chart-*` variables it never defines, and Inter is loaded twice (both fixed in `hemsida-081.8`).

## Decisions made

1. Term is the top-level context, one period bar, term in URL, roles per term.
2. Agreement is an optional named layer, never an assessment, labels from data.
3. Assessment is the main measure; neutral states are dashed.
4. Neutral party chips; no party colours.
5. Black on white with a yellow highlighter; Source Serif 4, Inter, IBM Plex Mono.
6. Agreement points get their own page; party lists are manifesto-only; "Övriga utfästelser" at the end of the party page.

## Open decisions

- Final URL scheme for term-scoped routes and what to do with `/partier/[party]`, `/lofte/[id]`, `/search` (`hemsida-081.9` decides; stubs with canonical link are the proposal).
- Dark-mode values for agreement badges and the assessment-status bar (proposed above, not on the canvas).
- Whether `strengthened` should look different from `included`.
- Controlled area list: fixed enum vs. registry file, and alignment with Riksdag utskott (`hemsida-081.5`).
- Whether "Liknande löften från andra partier" can be backed by data at all; omit until it can.
- Pagination vs. progressive loading on large party pages (`hemsida-081.12`).

## Implementation map

| Bead             | Delivers                                                                   |
| ---------------- | -------------------------------------------------------------------------- |
| `hemsida-081.3`  | Term record (roles, agreements, role changes), schema, collection, tests   |
| `hemsida-081.4`  | `shortTitle`, name-aware agreement labels                                  |
| `hemsida-081.5`  | Controlled area vocabulary                                                 |
| `hemsida-081.8`  | Tokens, fonts, VerdictBadge, AgreementBadge, PartyChip, TimelineMarker     |
| `hemsida-081.9`  | Navbar, footer, PeriodBar, term-scoped URLs                                |
| `hemsida-081.10` | Start                                                                      |
| `hemsida-081.11` | Partier                                                                    |
| `hemsida-081.12` | Parti                                                                      |
| `hemsida-081.13` | Löften                                                                     |
| `hemsida-081.14` | Löfte                                                                      |
| `hemsida-081.15` | Överenskommelse                                                            |
| `hemsida-081.16` | QA: 390 px and 1280 px, light and dark, keyboard, axe, the three scenarios |
| `hemsida-081.17` | Check the timeline against real Riksdag evidence                           |

`hemsida-081.1` (UX audit and design direction proposal) is superseded by this doc and can be closed after it merges.
