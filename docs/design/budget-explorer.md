# Budget explorer: UX design

Bead `hemsida-rn4.10`, epic `hemsida-rn4`. Written 2026-11-01 by the ux-designer agent, from the user's "UX DIRECTION 2026-11-01" note on the epic, the data in `src/data/budget/` (ESV årsutfall 2006–2025) and the current site code. It is the basis for rewriting `hemsida-rn4.3`, `.4` and `.5`; see [Bead rewrites](#bead-rewrites).

No budget page exists yet, so this doc does not review rendered pages. It was not checked in a browser. All figures below were computed from the committed JSON (2025 unless stated).

## Goal

A visitor (a voter, a journalist, a student) who lands on `/budget` from a search or a shared link should be able to answer three questions without knowing what an utgiftsområde or an inkomsttitel is:

1. **How big is it, and does it balance?** How much the state spent and took in during a year, and the difference.
2. **Where does the money go, and where does it come from?** The big parts first, with drill-down for anyone who wants detail.
3. **What does that mean for me?** An optional, clearly labelled estimate in kronor based on their own salary.

Experts (journalists, students) also need exact figures, budget versus outcome, time series and fixed prices. That goes in **Avancerat läge**, which must not get in the way of the first three questions.

The user's decisions in the epic note are fixed here: treemap as the primary graphic, revenue at the same scale as spending, percent by default, an optional salary estimate, and advanced mode for the rest. This doc works out how to deliver them, and flags one place where the data makes a literal reading impossible (see [F1](#f1-revenue-cannot-be-a-same-scale-treemap-of-the-raw-tree)).

## Findings

### Data facts that shape the design

**F1. Revenue cannot be a same-scale treemap of the raw tree.** In 2025 the positive inkomsttitlar add up to 3 382 mdkr and the negative ones to −2 078 mdkr, giving 1 304 mdkr net. The negatives sit at every level:

| Level                 | Negative items 2025                                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| inkomsttyp            | 7000 Avräkningar m.m. i anslutning till skattesystemet −155,5 (and 8000, −14 in 2006)                                               |
| huvudgrupp under 1000 | 1700 Avgående poster, EU −9,1; 1800 Avgående poster, andra sektorer −1 323,7; 1900 Periodiseringar −17,0                            |
| titelgrupp under 1100 | 1140–1160 (jobbskatteavdrag −201,5, allmän pensionsavgift −163,9, hushållsarbete −30,4, …), −418 in total                           |
| titel                 | 1811 Kommunala skatter −984,5; 1812 Avgifter till AP-fonder −339,2; 1261 Premiepension −52; 7222 Momskompensation kommuner −91,8; … |

If the revenue treemap draws every positive item as a box at the same scale as spending, it is 2.4 times the size of spending and suggests a large surplus where there is a deficit. If it is drawn at net size, the boxes cannot be true to scale. The fix is in [P2](#p2-same-scale-balance-view): net the one top-level negative (type 7000) into the tax box, which is justified by its official name, and use a "minus strip" at every drilled level.

**F2. Spending has negatives too, and they are not always small.** The other items in "statens utgifter" (Riksgäldskontorets nettoutlåning + kassamässig korrigering) were +3,5 mdkr in 2025 but −115 in 2022, −101 in 2021 and +104 in 2009. UO 26 Statsskuldsräntor was negative in 2021. 1–8 anslag per year are negative. The treemap therefore needs one signed-value rule for all levels, not a special case for revenue.

**F3. Saldo flips sign over the period.** There were surpluses in 2006–08, 2011, 2016–19 and 2021–23, and deficits in the other years (−221 mdkr in 2020). The design must handle both directions the same way.

**F4. Highly uneven sizes.** UO 25 is 12,4 % of spending, UO 5 is 0,19 %. UO 16 has 104 anslag, the largest at 8 % of the UO and the smallest at 0,004 %. UO 25 and 27 have one dominant anslag (96–100 %). At 320 px most anslag boxes would be under 10 × 10 px, so small items must be grouped.

**F5. Long names.** The longest UO name is 72 characters ("Samhällsplanering, bostadsförsörjning och byggande samt konsumentpolitik") and the longest anslag name is 117. Labels must clamp, and the full name must be available in a tooltip, the detail header and the table.

**F6. Payload is small if split well.** Measured from the committed JSON: all names (UO, anslag, groups, titlar) are 62 kB raw / 16,5 kB gzipped. One year of outcome values for every anslag and titel is 6 kB / 2,1 kB gzipped. All 20 years are 122 kB / 36 kB gzipped. Shipping names plus one year by default, and fetching other years on demand, keeps the island data under 20 kB gzipped.

**F7. Restated nomenclature makes keys stable across years** (docs/budget-data.md, "Restated versus utfallsår"). The same node id means the same thing in every year of one release. That is what makes a later year comparison (`rn4.12`) possible without redesign.

### Existing site and bead issues

| #   | Where                                                                 | Problem                                                                                                                                                                                                                                                                                                          |
| --- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | `src/styles/globals.css:52-61`                                        | `--color-chart-1..5` point to `--chart-1..5`, which are never defined in `:root` or `.dark`. Any `bg-chart-1` would render transparent. The budget colours need real tokens (see [P6](#p6-colour-system)).                                                                                                       |
| E2  | `AGENTS.md:41`                                                        | Says dark mode uses `prefers-color-scheme`. In practice it is class-based: `.dark` on `<html>` set by the inline script in `src/layouts/Layout.astro:35-41`, plus `ThemeToggle`, with `@custom-variant dark` at `globals.css:6`. Budget tokens must follow `.dark`.                                              |
| E3  | `src/layouts/Layout.astro:29-34` and `globals.css:4`                  | Inter is loaded twice, from Google Fonts and from `@fontsource-variable/inter`. That costs more bytes than the whole budget island would. Out of scope here; filed as a suggestion below.                                                                                                                        |
| E4  | `src/components/Navbar.astro:6-10`                                    | No "Budget" link. There are 3 links today; a 4th still fits the desktop row and the mobile menu.                                                                                                                                                                                                                 |
| E5  | `src/lib/promise-labels.ts:46-69`                                     | Verdicts use blue, green, lime, orange, amber, red and muted grey. Agreement outcomes use violet. If budget boxes used these hues, a green or red box could read as "good" or "bad". Budget colours must avoid them (see [P6](#p6-colour-system)).                                                               |
| E6  | `src/lib/budget-evidence.ts:3-20`, `src/components/BudgetEntry.astro` | Promise pages format amounts as "mn kr" with a trailing "nominellt", but the budget explorer will default to mdkr and percent. The two need one shared formatter (`src/lib/budget/format.ts`), and BudgetEntry should link to the anslag page once it exists (that is `9ce.4`).                                  |
| E7  | `hemsida-rn4.3` design                                                | Prescribes "BarList", "no chart library" and a "small aggregate JSON". The user's direction supersedes all three. The "existing charts/tables/time series/price toggle" that should move into advanced mode do not exist yet; they were only planned in rn4.3/4.4/4.5. So advanced mode is new work, not a move. |
| E8  | `hemsida-rn4.4` design                                                | Routes `/budget/utgifter/<uo>` hardcode the state level (see the coordinator's constraint) and say "one page per anslag in current nomenclature", while the design says pages for discontinued anslag too. Resolved in [P1](#p1-routes-and-url-scheme).                                                          |
| E9  | `src/lib/budget/data.ts:146-168`                                      | `revenueTree()` returns signed sums only. The treemap needs, per node, the positive children and the negative children as separate lists, plus the synthetic "Skatter, netto" node. That is new view-model code, not a change to the data layer.                                                                 |
| E10 | `src/layouts/Layout.astro:27`                                         | `<base href>` is set, and relative links depend on it. Treemap links and pushState URLs must be built from `import.meta.env.BASE_URL`, as Navbar does, and never assume the site is served from `/`.                                                                                                             |

## Proposal

### P0. Concepts and words (use these exact terms everywhere)

| Concept                                                              | Swedish on the site                                               | Notes                                                             |
| -------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| Statens utgifter (UO 1–27 + nettoutlåning + kassamässig korrigering) | **Utgifter**, in full **statens utgifter**                        | Never "kostnader".                                                |
| Statens inkomster (net, all titlar)                                  | **Inkomster**, in full **statens inkomster**                      |                                                                   |
| Saldo < 0                                                            | **Underskott**                                                    | Always with "Staten lånade mellanskillnaden." in the explanation. |
| Saldo > 0                                                            | **Överskott**                                                     | "Överskottet användes till att betala av på statsskulden."        |
| Negative items in a view                                             | **Avdrag**, heading "Dras av"                                     | One component, the minus strip, used at every level.              |
| Avgående poster (1700/1800)                                          | "**Går vidare till kommuner, regioner, pensionssystemet och EU**" | The official term is shown in the table and in a tooltip.         |
| Synthetic top-level revenue node (typ 1000 + 7000 + 8000)            | **Skatter, netto**                                                | See P2.                                                           |
| Grouped small items                                                  | **Mindre poster (N st)**                                          | Presentational only, see P4.                                      |
| Preliminary year                                                     | **Preliminärt**                                                   | Badge, see P9.                                                    |
| Salary estimate                                                      | **Din uppskattade del**                                           | Never "din skatt" (see P8).                                       |

### P1. Routes and URL scheme

**Decision: the drill position lives in the path, and view options live in the query. Every drill level is a real static page that also works without JavaScript. One React island handles drilling client-side with `history.pushState`, so typed-in state (such as the salary) survives a drill.**

Why the path and not the hash:

- Shared links need a real page. Search results, link previews (`og:title` "Försvar och samhällets krisberedskap 2025 – statens budget") and no-JS readers all get the right level.
- The treemap boxes can be plain `<a href>` elements. Middle-click, "open in new tab", screen-reader link lists and copying a link all work for free.
- It keeps the `rn4.4` idea of one page per UO and anslag, which `9ce.4` already links to from promise pages.

Why the island still intercepts clicks: a full page load would wipe the salary input, because nothing is stored (rn4.11). The island renders the same markup the static page has, so intercepting a click is a progressive enhancement. It pushes the real URL and re-renders. Back and forward use `popstate`.

**Level-agnostic prefix.** Per the coordinator's constraint, the government level is a path segment and is never implied:

```
/budget/                                      landing: renders the stat balance view (default level), canonical → /budget/stat/
/budget/stat/                                 balance view (spending + revenue at the same scale)
/budget/stat/utgifter/                        spending treemap: 27 UO
/budget/stat/utgifter/9/                      UO 9: its anslag
/budget/stat/utgifter/9/1-11/                 anslag 9 1:11: leaf detail page
/budget/stat/utgifter/5/1-3-2024/             discontinued anslag (suffix slug, see docs/budget-data.md gotcha 3)
/budget/stat/inkomster/                       revenue treemap, top level (Skatter, netto + typ 2000–6000)
/budget/stat/inkomster/skatter/               inside "Skatter, netto": huvudgrupper + minus strip
/budget/stat/inkomster/1100/                  huvudgrupp → titelgrupper
/budget/stat/inkomster/1140-1160/             titelgrupp (range codes are valid slugs)
/budget/stat/inkomster/1111/                  titel: leaf detail page
```

Later, without changing any of the above:

```
/budget/kommun/<kommunkod>/...                e.g. /budget/kommun/0180/ (Stockholm)
/budget/region/<regionkod>/...
```

The revenue path is flat (`/inkomster/<kod>`), not nested, because ESV codes are unique across levels and the breadcrumb comes from the tree. That keeps URLs short and stable if ESV ever regroups titlar.

**Query parameters** (all optional; defaults are omitted from the URL):

| Param       | Values            | Default   | Notes                                                                              |
| ----------- | ----------------- | --------- | ---------------------------------------------------------------------------------- |
| `ar`        | 2006…latest       | latest    | The static HTML is for the latest year. The island fetches other years.            |
| `visa`      | `procent`, `mdkr` | `procent` | `kr` (salary) is **never** put in the URL; see P8.                                 |
| `avancerat` | `1`               | off       | Opens advanced mode. Shareable, so a journalist can send a link to the table view. |
| `priser`    | `fasta`           | löpande   | Only in advanced mode.                                                             |
| `jamfor`    | a year            | –         | **Reserved** for `rn4.12`. Do not use it for anything else.                        |

**Pages to generate:** 1 + 1 + 1 + 27 UO + 814 anslag (every restated key, so a box from 2008 never links to a 404) + 1 + 1 (skatter) + about 110 revenue groups + 298 titel leaf pages ≈ 1 250 static pages. They are small. `rn4.4` already asks for the build-time increase to be reported; keep that.

**Data endpoints** (static Astro endpoints, built once and cached by the browser across pages):

```
/budget/data/stat/names.json        node ids → names, hierarchy, slugs          ~16 kB gz
/budget/data/stat/2025.json         node ids → utfall for one year (+ budget for advanced)   ~2–4 kB gz each
```

The page passes only the current view (about 30 nodes) as island props. The island fetches `names.json` and the selected year file on first interaction or when idle. Nothing ships every year up front.

### P2. Same-scale balance view

This is the `/budget/stat/` page and the answer to "does it balance?".

**Layout rule.** There are two columns of **equal width**. Each column's **height is proportional to its total** (the same mdkr per pixel in both), and both are top-aligned. The shorter side is filled to the same height with a **hatched saldo box**: "Underskott" in the revenue column, or "Överskott" in the spending column. The saldo is then the size of that box. The visitor sees it as the extra length of one column, which is easier to judge than an area difference, and it is labelled with the amount, so nobody has to judge it at all.

**Making both columns all-positive, exactly.** The balance view uses these items, and their areas are true to scale:

- **Utgifter column**: one box per UO with a positive outcome.
- **Inkomster column**:
  - **Skatter, netto** = typ 1000 + typ 7000 + typ 8000. Types 7000 ("Avräkningar m.m. _i anslutning till skattesystemet_") and 8000 ("Utgifter som redovisas som krediteringar på _skattekonto_") are by their official names adjustments to taxes, so netting them into taxes is not an editorial choice. 2025: 1 349,4 − 155,5 + 0 = 1 193,9. It has been positive in every year 2006–2025.
  - One box each for typ 2000, 3000, 4000, 5000 and 6000 (always positive in 2006–2025).
- **Övriga poster, netto** = nettoutlåning + kassamässig korrigering + the sum of any negative UO (F2). This is a single neutral box with a dotted outline:
  - if it is positive, it goes in the utgifter column: "Övriga poster (lån och kassamässiga justeringar)";
  - if it is negative, it goes in the inkomster column as "Övriga poster (minskar utgifterna)". This keeps the saldo exact (`I − (U + adj) = (I − adj) − U`). The column header still shows the official totals, and the box tooltip says: "I statens redovisning minskar de här posterna utgifterna. Här visas de på inkomstsidan så att båda sidorna kan ritas som ytor."
- The **saldo box** is hatched, as described above.

Tests must assert that both columns plus the saldo box are equal for every year, and that the headline numbers equal `totalsForYear()`.

**Percent in the balance view**: spending boxes show a share of statens utgifter, revenue boxes a share of statens inkomster, and the saldo box shows "x % av utgifterna".

### P3. Drill views (one template for every level and side)

When the visitor drills in, the clicked box **zooms to fill the canvas**. Same-scale comparison only applies to the balance view; the drilled views each show one side.

**Signed children rule (all levels, both sides, every year):**

- Children with outcome **> 0** become boxes.
- Children with outcome **< 0** go into the **minus strip** below the treemap. The strip is never part of the area.
- Children with outcome **= 0** or `null` are left out of the treemap and listed in the table as "–".
- Under the strip, an equation line makes the arithmetic visible:
  `Inbetalt 2 714,4 mdkr − dras av 1 520,5 mdkr = 1 193,9 mdkr (skatter, netto)` (2025: huvudgrupper 1100–1600 plus 7100 as boxes; 1700, 1800, 1900 and 7200 in the strip)
- The strip is also drawn as a **proportion bar** at full width: the solid part is what remains and the hatched part is what is deducted. In "Skatter, netto" for 2025 56 % of the bar is hatched, which shows at a glance that more than half of the taxes collected through the state's accounts go to kommuner and the pension system. That is one of the most informative facts on the page, and it is presented as data, not as a claim.

**Percent base in drill views:** a box's percent is its share of **the sum of the boxes in this view** (gross where there are deductions). The caption above the treemap always names that base, for example "Andel av 102,0 mdkr (utgiftsområde 16)" or "Andel av 2 714,4 mdkr som betalades in, före avdrag". The tooltip and the detail header add the share of the whole side ("0,3 % av statens utgifter").

### P4. Treemap layout and labelling

- **Algorithm:** `d3-hierarchy` `treemap()` with `treemapSquarify` (ratio 1.5 to 1.618), `paddingInner` 2 px and no outer padding. Children are sorted by value, descending. Order is stable across years by node id when values tie.
- **Rendering:** absolutely positioned HTML `<a>` elements inside a `position: relative` container, **not SVG**. This gives native focus rings, text wrapping, `line-clamp` and real links. Positions are percentages of the container, so the layout works with zero JS.
- **Two aspect ratios, one DOM:** layouts are computed at build time for a **portrait frame (3:4, used below 640 px)** and a **landscape frame (16:9, from 640 px)**. Each box carries both as CSS custom properties (`--x --y --w --h` and `--mx --my --mw --mh`), and a media query picks one. The container uses `aspect-ratio`. The island recomputes the same layouts with the same function after a year switch.
- **Grouping small items into "Mindre poster":** in any view, children with less than **1 % of the view** are merged into one box called "Mindre poster (N st)" once there are at least 3 of them. Otherwise they stay as boxes. That box drills to a sub-view of just those items, URL `?mindre=1` on the same path, with breadcrumb "… › Mindre poster". Apply the same rule there (recursively). At 320 × 427 px, 1 % is about 1 370 px², about 37 × 37 px, which is close to the 44 px tap-target guidance. The table always lists every item individually.
- **Label tiers** (measured on the rendered box; the island measures, the SSR uses the layout's pixel size at the reference widths 360 and 1100):

| Box size (px) | Shows                                                                        |
| ------------- | ---------------------------------------------------------------------------- |
| ≥ 120 × 64    | Name (`line-clamp-2`, 14 px/600), value line (13 px), e.g. "11,7 %"          |
| ≥ 64 × 36     | Name (`line-clamp-1`, 12 px/600) and value (12 px)                           |
| ≥ 36 × 22     | Value only (12 px tabular)                                                   |
| smaller       | Nothing. The full text is in the accessible name, the tooltip and the table. |

- **Name shortening:** UO boxes show the UO name without the "Utgiftsområde N" prefix, and the number is in the tooltip and table. A `shortName` map (hand-written, about 10 entries, for example UO 18 "Bostäder och samhällsplanering", UO 10 "Sjukdom och funktionsnedsättning") is used only in box labels. The full official name is everywhere else. It lives in `src/lib/budget/labels.ts`, which also holds the revenue explanations from `rn4.5`.
- **Tooltip / info:** on hover or focus (desktop) a small popover shows the full name, the percent of the view and of the side, mdkr, kr if a salary is entered, and "Klicka för att se vad det består av" (or "Öppna detaljsidan" for a leaf). On touch there is no hover: a tap drills directly (per the user's decision). Nothing is lost, because the next view's header shows the same information. Long-press is not used.
- **Leaves:** anslag and titlar have no children yet, so a click opens the leaf detail page (P5). When `rn4.6` adds anslagsposter, the anslag becomes a group with no URL change.

### P5. Page templates

**Shared frame for every budget page** (from 320 px; `container mx-auto px-4 md:px-6 max-w-5xl`):

```
┌──────────────────────────────────────────────────────────────┐
│ Navbar (Partier · Budget · Om metoden · Sök)                 │
├──────────────────────────────────────────────────────────────┤
│ Budget › Staten › Utgifter › Hälsovård, sjukvård …           │  breadcrumb <nav aria-label="Brödsmulor">
│                                                              │
│ H1  Hälsovård, sjukvård och social omsorg                    │  text-2xl md:text-3xl font-bold
│ Lead 116,3 miljarder kronor 2025, 8,3 % av statens utgifter. │  text-muted-foreground
│                                                              │
│ [År ▾ 2025]  [Procent | Miljarder kr]  [Vad betalar jag? ▸]  │  controls row; wraps on mobile
│                                                              │
│ Andel av 116,3 mdkr (utgiftsområde 9)                         │  caption = percent base
│ ┌──────────────────────┬───────────┬──────┐                  │
│ │ Bidrag till läke-    │ Sjukvårds-│ Stat-│                  │  treemap
│ │ medelsförmånerna     │ insatser  │ ligt │                  │
│ │ 35 %                 │ 21 %      │ …    │                  │
│ ├────────────┬─────────┼──────┬────┴──────┤                  │
│ │ …          │ …       │ …    │ Mindre    │                  │
│ │            │         │      │ poster(18)│                  │
│ └────────────┴─────────┴──────┴───────────┘                  │
│ Dras av: (minus strip, only when there are negatives)        │
│                                                              │
│ ▸ Visa som tabell                     [ ] Avancerat läge     │
│                                                              │
│ Om siffrorna: källa, utfall, löpande priser, preliminärt …   │  small print + CC0 credit
└──────────────────────────────────────────────────────────────┘
```

**`/budget/stat/` balance view, desktop (≥ 768 px):**

```
H1  Statens budget 2025
Lead  Staten gav ut 1 405,8 miljarder kronor och tog in 1 303,9 miljarder.
      Underskottet blev 101,9 miljarder kronor. [Preliminärt]

  Utgifter 1 405,8 mdkr              Inkomster 1 303,9 mdkr [Preliminärt]
 ┌──────────────┬────────┐          ┌──────────────────────────────┐
 │ Bidrag till  │ Försvar│          │                              │
 │ kommuner     │ 11,7 % │          │ Skatter, netto               │
 │ 12,4 %       ├────────┤          │ 91,6 %                       │
 ├───────┬──────┤ Sjuk-  │          │                              │
 │ Hälso-│ Utbi-│ dom    │          │                              │
 │ vård  │ ldn. │ 8,6 %  │          ├──────┬──────┬────────────────┤
 │ 8,3 % │ 7,3 %├────────┤          │Stat. │ EU   │ …              │
 │  …    │  …   │ …      │          │verks.│      │                │
 │       │      │        │          ├──────┴──────┴────────────────┤
 │       │      │        │          │////// Underskott 101,9 //////│  hatched
 └───────┴──────┴────────┘          └──────────────────────────────┘
  → Utforska utgifterna              → Utforska inkomsterna

▸ Visa som tabell        [ ] Avancerat läge
```

In the balance view the column headers ("Utgifter", "Inkomster") are links to `/budget/stat/utgifter/` and `/budget/stat/inkomster/`. Clicking a box drills straight to that UO or revenue group, skipping the side level, which is one click fewer for the common case.

**Mobile (320–767 px):** the two columns stay **side by side** (each about 140 px wide at 320 px), because side by side is the whole point of this view. The balance view uses the portrait layout per column. Only the 4–6 largest boxes get labels, and those labels are percent only plus a 1-line clamped name if it fits. Below the columns, a compact ranked list ("Största utgifterna": the top 5 with percent) gives the readable version, followed by the table toggle. The drill views on mobile are full width with the portrait layout.

**Leaf page** (`/budget/stat/utgifter/9/1-11/`, `/budget/stat/inkomster/1111/`): breadcrumb, H1 = full name, the lead sentence (pattern: "<X> miljarder kronor <år>. Det är <a> % av utgiftsområde <n> och <b> % av statens utgifter."), a single horizontal **share bar** (the leaf within its parent) instead of a one-box treemap, the year selector, advanced mode (series, budget vs utfall), then slots: "Löften som gäller detta anslag" (`9ce.4`) and "Anslagsposter" (`rn4.6`), each rendered only when non-empty. A discontinued anslag shows "Upphörde efter 2024." under the H1. If the selected year has no value: "Anslaget fanns inte 2008." with a link to the last year it existed.

### P6. Colour system

**Principle: colour separates boxes; it never means good or bad.** Meaning is carried by position, labels, the hatch pattern and the dotted outline. Each side gets one hue family, and adjacent boxes alternate between 4 lightness steps, assigned by index in size order (`i % 4`). The 2 px gaps in the background colour do the main separation work. Hues avoid the verdict and agreement palette (E5): **slate-teal for utgifter** and **sand/stone for inkomster**. No red, green, blue, orange, amber or violet.

New tokens in `src/styles/globals.css` (`:root` and `.dark`, HSL triplets like the existing ones), exposed through `@theme inline` as `--color-budget-*`:

| Token                     | Light (HSL)         | Dark (HSL)          | Use                                                |
| ------------------------- | ------------------- | ------------------- | -------------------------------------------------- |
| `--budget-out-1`          | 187 30% 82%         | 187 30% 22%         | Utgifter box fill, step 1                          |
| `--budget-out-2`          | 187 26% 74%         | 187 26% 28%         | step 2                                             |
| `--budget-out-3`          | 187 22% 88%         | 187 22% 18%         | step 3                                             |
| `--budget-out-4`          | 187 18% 78%         | 187 18% 25%         | step 4                                             |
| `--budget-in-1..4`        | 35 30% 82/74/88/78% | 35 25% 22/28/18/25% | Inkomster, same lightness pattern                  |
| `--budget-box-foreground` | 240 10% 3.9%        | 0 0% 98%            | Label text on every fill                           |
| `--budget-hatch`          | 240 4% 46%          | 240 5% 65%          | Stripe colour for saldo box and minus strip        |
| `--budget-other`          | 240 4.8% 95.9%      | 240 3.7% 15.9%      | "Övriga poster" and "Mindre poster" fill (= muted) |

Contrast requirement for the implementer to verify (with a test computing the ratios): label text on every fill is **≥ 4.5 : 1** in both modes. With these lightness values, near-black text on L 74–88 % and near-white text on L 18–28 % pass comfortably, but check after any tweak. Box borders are not needed for contrast because the gap is the background colour.

**Non-colour cues:**

- Saldo box: 45° diagonal stripes (`repeating-linear-gradient`, `--budget-hatch` at 35 % opacity, 6 px period), a solid label "Underskott" / "Överskott" and the amount. It is never only a colour.
- Minus strip: the same stripes, a "−" prefix on every amount, and the heading "Dras av".
- "Övriga poster" and "Mindre poster": the `--budget-other` fill and a **dotted** 1 px outline, which marks them as groupings.
- Focus: `outline: 2px solid hsl(var(--ring)); outline-offset: -2px` (inset, so focus is visible inside the 2 px gap).
- Hover: `filter: brightness(0.95)` in light mode and `1.15` in dark mode, plus the tooltip. Under `prefers-reduced-motion` there is no zoom animation; otherwise there is a 200 ms cross-fade, not an animated zoom.

### P7. Keyboard and screen reader access; the table alternative

- Every box is an `<a>` with an accessible name that holds all the information: `aria-label="Försvar och samhällets krisberedskap: 11,7 procent av statens utgifter, 163,5 miljarder kronor"`. With a salary entered it adds ", ungefär 4 300 kronor av din uppskattade del". The visual label is `aria-hidden` to avoid reading it twice.
- The boxes are wrapped in `<ul role="list" aria-label="Utgifter 2025, största först">` with one `<li>` per box, in **size order**, so Tab and a screen-reader list both go largest first, which matches visual importance. Up to about 20 boxes per view (thanks to the grouping), so plain Tab order is fine and no roving tabindex is needed.
- Breadcrumb: `<nav aria-label="Brödsmulor"><ol>…`, with `aria-current="page"` on the last item.
- Drilling client-side moves focus to the new H1 (`tabindex="-1"`), updates `document.title`, and announces through a polite live region: "Visar Hälsovård, sjukvård och social omsorg, 34 poster."
- **Table alternative = the same data as the treemap, always in the HTML.** A `<details>` with the summary "Visa som tabell" (closed by default, open by default when `avancerat=1`). It contains a real `<table>` with `<caption>` (same text as the treemap caption), and the columns Namn (a link), Andel (%), Miljarder kronor, and with a salary "Din del (kr)". All children are listed, including the grouped small ones and the minus-strip rows (as negative numbers, in a `<tbody>` headed "Dras av"), then a total row. Numbers are right-aligned with `tabular-nums`. This is the WCAG text alternative for the graphic, and the base of advanced mode.
- The treemap container has `role="img"`-free semantics (it is a list of links). A short visually hidden paragraph before it says "Ytorna är proportionella mot beloppen. Samma uppgifter finns i tabellen nedan."

### P8. Salary input ("Vad betalar jag?")

**Placement:** a third control in the controls row is a disclosure button, `Vad betalar jag?`. It opens a panel under the controls, not a modal, so the treemap stays visible.

**Flow:**

```
[closed]  --click "Vad betalar jag?"-->  [panel open, empty]
[panel open] --type salary, blur/Enter or "Räkna"--> [estimate shown, display switches to kr, "kr" segment appears in toggle]
[estimate shown] --drill / change year / open a leaf--> [panel collapses; estimate kept (localStorage), recomputed with that year's parameters]
[estimate shown] --"Rensa"--> [panel open, empty, display back to procent]
[any] --page reload, new tab or later visit--> [estimate restored from localStorage, panel closed]
```

**Panel copy (Swedish):**

```
Vad betalar jag till staten?

Månadslön före skatt   [ 35 000 ] kr
                       [Räkna]

Ungefär 9 800 kronor per år av det du och din arbetsgivare betalar går till
statens budget (uppskattning för 2025).

  Statlig inkomstskatt         0 kr
  Arbetsgivaravgifter (statens del)  …
  Moms på det du köper         …
  – Jobbskatteavdrag           …          ← only if rn4.11 includes it (see open questions)

▸ Ändra antaganden
    Andel av lönen efter skatt som du handlar för   [ 60 ] %
    Genomsnittlig moms på det du handlar             [ 19 ] %

Så räknar vi
Det här är en grov uppskattning, inte din faktiska skatt. Den bygger på
skattereglerna för 2025 och antagandena ovan. Kommunalskatten räknas inte
med, eftersom den går till kommunen och regionen, inte till staten.
Beloppen i rutorna visar hur din del skulle fördelas om den följde samma
proportioner som statens utgifter. Uppgiften sparas bara i din
webbläsare på den här enheten och skickas aldrig någonstans. Knappen Rensa
tar bort den.

[Rensa]
```

Rules:

- Monthly input (`inputmode="numeric"`, spaces allowed, "35 000" and "35000" both parse), shown as monthly because that is how most people know their salary. The result is per year, and the unit is always written out.
- Results are **rounded to the nearest 100 kr** for the total and the nearest 10 kr per box, always shown with "ungefär"/"≈". Boxes below 10 kr show "< 10 kr".
- **Per år / per månad (decision 2026-11-01, hemsida-rn4.23):** a radio pair `per år` / `per månad` inside the panel next to the Rensa button (not in the boxes, because of mobile space). Default per år. It applies to every personal kr amount: the panel breakdown and headline, "Din del" in boxes, the leaf page line, the table column ("Din del (kr per månad)") and the aria text, which names the period ("Din del: ungefär 820 kronor per månad"). The estimate is always computed per year; per månad is the yearly amount divided by 12. **Monthly rounding: nearest 10 kr for the total, the parts and the boxes** (the monthly total is a few hundred kr, so 100 kr would be too coarse); below 10 kr it shows "< 10 kr". The choice is stored as `period` in the same localStorage entry (an entry saved before the switch has no `period` and loads as per år); Rensa keeps it.
- Box values in kr mode = `din del × box share of the side total` (shares of statens utgifter). The copy above states this exactly. On the inkomster side, kr mode shows the same breakdown as the panel. The three boxes the person's money mostly enters through (Skatter, netto, and inside it 1100/1200/1400) get a small "Din del: ≈ X kr" line, and other boxes stay in percent. In the balance view the saldo box in kr mode shows nothing personal, just the mdkr and the percent, to avoid implying "your share of the debt".
- **Never put the salary in the URL**, and never send it anywhere. The URL keeps `visa=procent` when a salary is entered, so a copied link never leaks it.
- **Persistence (decision 2026-11-01, hemsida-ktr):** the monthly salary, the applied value and the two assumptions are kept in `localStorage` under the single key `brutnaloften:salary-estimate:v1` (`src/lib/budget/salary-storage.ts`), so the estimate survives leaf pages (full page loads), reloads and later visits. Never in `sessionStorage`. Every access is wrapped in try/catch and the stored value is validated with Zod; corrupt or old values are ignored. "Rensa" removes the key. The panel's open state is never stored: it is closed on load and collapses on every navigation (drill, leaf, year change), because it takes a lot of space on mobile.
- If the selected year has no tax parameters in rn4.11, use the nearest year and say so: "Skatteregler för 2023 saknas, uppskattningen använder 2024 års regler."
- **Level-agnostic API** (for the coordinator's constraint): the model returns one figure per level, `estimateContribution(input, year): { stat: Breakdown; kommun?: Breakdown; region?: Breakdown }`. The UI shows the one for the current root. For `kommun` and `region` the kommunalskatt rate comes from the future kommun picker, so the API takes it as an optional input (`kommunalskattesats?`). rn4.11 implements only `stat`.

### P9. Year selector and "Preliminärt"

- Native `<select>` labelled "År" (accessible and good on mobile), with options newest first. Preliminary years read "2025 (preliminärt)".
- Changing the year keeps the drill path and updates `?ar=`. If the current node has no value that year (a discontinued anslag, or one that did not exist yet), the view climbs to the nearest ancestor that has one and shows a dismissible notice: "Det här anslaget fanns inte 2008. Visar utgiftsområde 5 i stället."
- **Preliminärt badge:** the existing `Badge` with `variant="outline"` and the text "Preliminärt". It appears next to the "Inkomster" column header and the saldo figure in the balance view, and next to the H1 on any revenue page, when `meta.yearStatus.revenue[year] === "preliminary"`. The badge is a `<button>` (or a Popover trigger) explaining: "Siffrorna för skatterna är inte slutliga. Ekonomistyrningsverket justerar dem i upp till ett och ett halvt år efter budgetåret. Saldot kan därför ändras något." Spending is final for all years today; the same badge appears on spending if that ever changes.
- Later (rn4.7): budget years without outcome will appear as "2026 (budget, inte utfall)", and the lead sentences switch to "planerar att ge ut". The select already supports labels per option, so this is a data change only.

### P10. Advanced mode ("Avancerat läge")

A switch (`role="switch"`, label "Avancerat läge") next to "Visa som tabell". It is in the URL as `avancerat=1`. Turning it on:

1. Opens the table and adds the columns **Statens budget**, **Ändringsbudgetar**, **Utfall** and **Skillnad mot budget** (spending; revenue has budget and utfall only).
2. Adds the **Priser** segmented control: "Löpande priser" / "Fasta priser (KPI, 2025)".
3. Adds a **time series** under the treemap for the current node: outcome 2006–latest, plus budget as a dashed line, with preliminary years drawn with an open marker and labelled in the legend. On the balance view it shows inkomster vs utgifter over time, plus "andel av BNP" as a small table under it (only through the last GDP year; it says "BNP för 2025 är inte publicerad ännu").
4. Shows the codes (UO number, anslag "1:11", ESV code "0901011", inkomsttitel "1111") in the table and the detail headers.

The treemap itself does not change in advanced mode. Advanced mode adds detail and never hides the simple view.

**Time series chart:** a hand-written SVG line chart (about 120 lines). A charting library is not justified for one line chart. It renders in Astro (zero JS) for the static latest-year page, and the island renders the same component after year or price changes. `rn4.8` (government bands) plugs in here later.

### P11. First 30 seconds on `/budget`

1. **0–3 s:** the H1 "Statens budget 2025" and one sentence with the three numbers: "Staten gav ut 1 405,8 miljarder kronor och tog in 1 303,9 miljarder. Underskottet blev 101,9 miljarder kronor." This is server-rendered, so it is there before any JS.
2. **3–10 s:** the two columns. The hatched box makes the deficit visible without reading. The largest boxes ("Bidrag till kommuner 12,4 %", "Försvar 11,7 %", "Skatter, netto 91,6 %") are readable.
3. **10–30 s:** a one-line hint above the columns, "Klicka på en ruta för att se vad den består av.", and the "Vad betalar jag?" button as the obvious personal hook.

Below the fold: "Om siffrorna" (sources, CC0 credit to Statskontoret/ESV and SCB, what utfall means, why ålderspensionssystemet is left out, löpande priser by default, and what avgående poster are). Each item is 1–3 sentences.

**Copy for "Om siffrorna"** (implementer pastes):

> **Var kommer siffrorna ifrån?** Utfallet för statens budget kommer från Ekonomistyrningsverkets öppna data, som publiceras av Statskontoret (CC0). Prisomräkningen bygger på konsumentprisindex från SCB (CC0).
>
> **Utfall, inte plan.** Siffrorna visar vad staten faktiskt betalade ut och tog in under året, inte vad som stod i budgetpropositionen.
>
> **Pensionerna vid sidan av budgeten.** Den allmänna ålderspensionen betalas ur AP-fonderna och ingår inte i statens budget. Därför finns den inte med här.
>
> **Avgående poster.** En del av de skatter som staten tar in går direkt vidare, till exempel kommunalskatten till kommuner och regioner och pensionsavgifterna till AP-fonderna. De räknas bort innan man kommer fram till statens inkomster, och de visas som "Dras av" när du klickar dig in i skatterna.
>
> **Löpande priser.** Beloppen gäller i det årets kronor. Med Avancerat läge kan du räkna om dem till dagens penningvärde.

### P12. Kommun and region later (constraints only, not designed)

- **Level switch:** a segmented control at the top of `/budget/` ("Staten · Din kommun · Din region") once data exists. `/budget/` then becomes a chooser, and `/budget/stat/` keeps its URL.
- **Kommun picker:** a native `<select>` grouped by län (290 options) plus a "type to filter" input, URL `/budget/kommun/<kod>/`. The salary panel then also shows "Kommunalskatt till <kommun>: ≈ X kr".
- **Flow between levels:** in the stat view the UO 25 "Allmänna bidrag till kommuner" box and the "Kommunala skatter" deduction in the minus strip get a secondary link, "Följ pengarna till kommunerna →", to `/budget/kommun/`. In a kommun view the "Statsbidrag" revenue box links back to `/budget/stat/utgifter/25/`. A real flow graphic (a 3-column Sankey: state → transfers → kommuner/regioner) fits here, when there are two levels to connect, which is a stronger reason for a Sankey than the single-level one.
- **What the code must not hardcode now:** the root label ("Staten") and the side totals' names come from a `BudgetLevel` descriptor (`{ id: 'stat', name: 'Staten', outLabel: 'Statens utgifter', inLabel: 'Statens inkomster' }`), not from string literals in components. Treemap, Breadcrumb, MinusStrip, BalanceView and DataTable take generic `BudgetNode` trees:

```ts
type BudgetNode = {
  id: string; // stable across years within one release: "uo:9", "anslag:0901011", "rev:1100", "rev:skatter"
  name: string; // full official name
  shortName?: string; // box label only
  href: string; // built from BASE_URL + level + side + slug
  value: number | null; // signed, mn kr, for the selected year
  children?: BudgetNode[];
  kind?: "group" | "leaf" | "other" | "smaller" | "saldo";
};
```

### P13. Sankey: not now

Recommendation: **no Sankey in this epic.** Reasons:

1. The treemap pair already answers "in vs out". At the state level a Sankey adds one thing: a link from each revenue type to each spending area. That link does not exist in the data, because money is not earmarked, so drawing it would invent a flow.
2. A readable Sankey needs about 8 hand-grouped policy areas (the epic note says so), which is an editorial grouping we would have to defend.
3. It is weak on mobile at 320 px.

Keep it for the multi-level case (P12), where the flows (state → kommuner via UO 25 and kommunalskatt) are real recorded transfers. Do not add `d3-sankey` now.

### P14. Island and payload budget

- **One island**, `BudgetExplorer.tsx`, hydrated with `client:idle` (the SSR markup is complete and usable before hydration). The balance view is a mode of the same island, not a second one.
- **Dependencies:** `d3-hierarchy` only (the treemap plus squarify, tree-shaken, about 4–5 kB gz). No `d3-scale` or `d3-shape`; the line chart is hand-written.
- **Budget:** at most 30 kB gz of island JS (excluding React, which other pages already load) and **at most 20 kB gz of data on first load** (current-view props + `names.json`; the year file only on year change). The `rn4.3` PR states the measured numbers.
- Layout math lives in a pure module shared by Astro (build time) and the island, so the SSR markup and the hydrated markup match and there is no layout shift.

## Cut or merge

- **Cut `BarList`** (rn4.3) as the main overview. The treemap replaces it. The mobile "Största utgifterna" top-5 list in P5 is a plain `<ol>`, not a chart component.
- **Cut the separate expandable `RevenueTree.tsx`** (rn4.5). Revenue uses the same treemap and drill template as spending. A second tree interaction for the same concept breaks "same concept looks the same everywhere".
- **Merge the "table alternative" and advanced mode's table** into one `DataTable` with optional columns.
- **Merge the separate UO-page and anslag-page layouts** (rn4.4) into the one drill template plus a leaf variant.
- **Cut the top-level "Utgifter" and "Inkomster" pages as required stops.** They exist (`/budget/stat/utgifter/`), but the balance view drills straight to UO or revenue type.
- **Defer the Sankey** (P13) and `d3-sankey`.
- **Do not build** a price toggle outside advanced mode, and do not show "andel av BNP" anywhere but advanced mode on the balance view.

## Priority list

Each item is sized for one bead. The files are listed. Items 1–2 must land first; 3 and 4 can then run in parallel (disjoint files), and 5–7 after them.

1. **Budget view model and layout library (new bead, before rn4.3).**
   - Pure, tested modules:
     - `src/lib/budget/view.ts`: `BudgetNode`, `BudgetLevel`, the signed-children split, "Mindre poster" grouping, balance items (Skatter netto, Övriga poster netto, saldo box) and the slug ↔ id mapping for UO, anslag and revenue codes, including suffixed discontinued anslag.
     - `src/lib/budget/treemap.ts`: d3-hierarchy squarify for the two frames, label tier.
     - `src/lib/budget/format.ts`: `12,3 %`, `163,5 mdkr`, `< 0,1 %`, kr rounding.
     - `src/lib/budget/labels.ts`: short names.
   - Tests:
     - for every year, both balance columns plus the saldo box are equal, and the totals equal `totalsForYear`;
     - children plus the minus strip equal the parent;
     - slug round-trips;
     - format cases.
   - Add the dependency `d3-hierarchy`.
2. **rn4.3 (rewritten): balance view, shared explorer island and tokens.**
   - New files:
     - `src/pages/budget/index.astro` and `src/pages/budget/stat/index.astro`;
     - in `src/components/budget/`: `BudgetExplorer.tsx` (island: drill with pushState, year fetch, visa toggle), `Treemap.tsx`, `BalanceView.tsx`, `MinusStrip.tsx`, `DataTable.tsx`, `Breadcrumbs.astro`, `YearSelect.tsx`, `PrelimBadge.tsx`;
     - `src/pages/budget/data/stat/names.json.ts` and `[year].json.ts`.
   - Changes:
     - `src/styles/globals.css` (budget tokens, plus fix E1 by defining `--chart-1..5` or removing them);
     - `src/components/Navbar.astro` (Budget link).
3. **rn4.4 (rewritten): spending drill pages.**
   - `src/pages/budget/stat/utgifter/index.astro`, `[uo]/index.astro` and `[uo]/[anslag].astro` (all 814 keys).
   - Leaf template `src/components/budget/LeafDetail.astro` with empty slots for 9ce.4 and rn4.6.
4. **rn4.5 (rewritten): revenue drill pages.**
   - `src/pages/budget/stat/inkomster/index.astro` and `[kod].astro` (groups and titlar, plus `skatter`).
   - Revenue explanations in `src/lib/budget/labels.ts` (or `revenue-labels.ts`) with a coverage test.
5. **Advanced mode (new bead).**
   - Changes to `DataTable.tsx` (budget, ändring and skillnad columns).
   - New `src/components/budget/TimeSeriesChart.tsx` (SVG) and `PriceToggle.tsx`, plus `src/lib/budget/real.ts` (KPI, GDP share) with tests.
   - The switch and its URL param go in `BudgetExplorer.tsx`.
6. **rn4.11 (unchanged scope, plus the level-agnostic API in P8):** the contribution model in `src/lib/budget/personal.ts` with tests.
7. **Salary panel UI (new bead, depends on 6 and 2).** `src/components/budget/SalaryPanel.tsx`, the kr display mode in Treemap, DataTable and the aria labels, and the copy from P8.
8. **Docs and cleanup (new chore bead, small).** Fix the dark-mode sentence in `AGENTS.md:41` (E2). Optionally drop the duplicate Google Fonts load in `src/layouts/Layout.astro:29-34` (E3) after checking that the fontsource weights cover 400–700.

## Bead rewrites

Paste-ready replacements for the orchestrator. Fields are given as **Description / Design / Acceptance**.

### New bead: "Budget view model and treemap layout (pure lib)"

- **Description:** Level-agnostic view model for the budget explorer per `docs/design/budget-explorer.md` P1–P4 and P12: `BudgetNode` and `BudgetLevel` types; building the stat spending tree (UO → anslag) and revenue tree (Skatter netto [1000+7000+8000] → huvudgrupper → titelgrupper → titlar; typ 2000–6000 direct) for a year; the signed-children split (positive → boxes, negative → minus strip, zero/null → table only); grouping of children under 1 % of a view into "Mindre poster (N st)" when there are 3 or more; the balance view items (Övriga poster netto placed on the side where it is positive, saldo box); squarified layouts for the portrait 3:4 and landscape 16:9 frames; label tiers; Swedish number formatting; slug ↔ id mapping.
- **Design:** Files `src/lib/budget/{view,treemap,format,labels}.ts` + tests. Add the dependency `d3-hierarchy` (treemap and squarify only). There is no React or Astro code in this bead. Ids look like `uo:9`, `anslag:0901011`, `anslag:0501003 2024`, `rev:1100` and `rev:skatter`. hrefs are built from `import.meta.env.BASE_URL` + `budget/<level>/<side>/<slug>/`. There are no "stat"/"statens" string literals outside the `stat` level descriptor.
- **Acceptance:**
  - for every year 2006–latest: the utgifter column + övriga (if on that side) + saldo box equals the inkomster column + övriga (if on that side) + saldo box, and the headline totals equal `totalsForYear(year)`;
  - for every group node and year: the box values + the minus-strip values = the node value (within 0,1 mn kr);
  - "Skatter, netto" is positive in every year;
  - the slug round-trip covers multi-digit anslag numbers, suffixed discontinued codes and revenue range codes (`1140-1160`);
  - format tests: `12,3 %`, `< 0,1 %`, `1 405,8 mdkr`, non-breaking spaces;
  - pnpm build, fmt:check, test and typecheck are green.

### hemsida-rn4.3 (rewrite): "Budget balance view /budget and the explorer island"

- **Description:** First budget page, per `docs/design/budget-explorer.md` P2, P5–P7, P9, P11 and P14. `/budget/` and `/budget/stat/` show the same-scale balance view for the latest year: an H1, a lead sentence with utgifter, inkomster and underskott/överskott, two equal-width treemap columns whose heights are proportional to their totals, a hatched saldo box, the Preliminärt badge, a "Visa som tabell" table alternative and "Om siffrorna" with the CC0 credit. A year selector switches client-side. Clicking a box drills to `/budget/stat/utgifter/<uo>/` or `/budget/stat/inkomster/<kod>/`, client-side with pushState when JS is available. Adds "Budget" to the Navbar.
- **Design:**
  - New files:
    - `src/pages/budget/index.astro` (canonical → `/budget/stat/`) and `src/pages/budget/stat/index.astro`;
    - in `src/components/budget/`: `BudgetExplorer.tsx` (one island, `client:idle`), `Treemap.tsx` (absolutely positioned `<a>` boxes; CSS custom properties for both frames; media query at 640 px), `BalanceView.tsx`, `MinusStrip.tsx`, `DataTable.tsx`, `Breadcrumbs.astro`, `YearSelect.tsx`, `PrelimBadge.tsx`;
    - static endpoints `src/pages/budget/data/stat/names.json.ts` and `[year].json.ts`.
  - Changes:
    - `src/styles/globals.css`: the budget tokens from P6, and define or remove `--chart-1..5`;
    - `src/components/Navbar.astro`.
  - Reuse `Badge` and `Popover` from `src/components/ui/`.
  - **Not** in this bead: advanced mode, the salary panel or the time series.
- **Acceptance:**
  - `/budget/` and `/budget/stat/` build statically and render the treemap and table with JS disabled;
  - the year select changes all figures and `?ar=`, and a deep link with `?ar=2020` opens 2020 (a surplus/deficit check in both directions: 2022 överskott, 2020 underskott);
  - box links resolve to the pages of rn4.4/rn4.5 (or are listed as pending in the PR if those are not merged yet);
  - keyboard: Tab reaches every box in size order, focus is visible, and a client-side drill moves focus to the H1 and announces the view in the live region;
  - label text contrast ≥ 4.5:1 on every budget fill in both modes (unit test over the token values);
  - the island JS and the first-load data sizes are reported in the PR (targets ≤ 30 kB and ≤ 20 kB gz);
  - checked at 320 px and in dark mode (screenshots in the PR);
  - pnpm build, fmt:check, test and typecheck are green.

### hemsida-rn4.4 (rewrite): "Spending drill pages: utgiftsområden and anslag"

- **Description:** Static pages for the spending side using the explorer island from rn4.3: `/budget/stat/utgifter/` (27 UO), `/budget/stat/utgifter/<uo>/` (that UO's anslag, with the minus strip when an anslag is negative and the "Mindre poster" grouping) and `/budget/stat/utgifter/<uo>/<anslag>/` leaf pages for **all 814 restated anslag keys** (slug `1-11`, discontinued `1-3-2024`). Breadcrumbs go Budget › Staten › Utgifter › UO › anslag. The leaf page has the lead sentence, a share bar, "Upphörde efter <år>" for discontinued anslag, the "fanns inte <år>" fallback, and empty slots "Löften som gäller detta anslag" (9ce.4) and "Anslagsposter" (rn4.6) that render nothing when empty.
- **Design:** Files `src/pages/budget/stat/utgifter/index.astro`, `src/pages/budget/stat/utgifter/[uo]/index.astro`, `src/pages/budget/stat/utgifter/[uo]/[anslag].astro` and `src/components/budget/LeafDetail.astro`. Use the view model and components; do not add a new layout. Per-page island props are limited to the current view. URL change versus the old design: everything sits under `/budget/stat/` (update the 9ce.4 description to link there).
- **Acceptance:**
  - all pages build, and every box and table link on every UO page resolves;
  - the UO 9 2025 values match the raw CSV (stated in the PR);
  - switching year on a UO page keeps the path, and switching to a year where the anslag is missing climbs to the UO with the notice;
  - the build-time increase is reported in the PR;
  - pnpm build, fmt:check, test and typecheck are green.

### hemsida-rn4.5 (rewrite): "Revenue drill pages"

- **Description:** Static pages for the revenue side using the explorer island: `/budget/stat/inkomster/` (Skatter netto + typ 2000–6000), `/budget/stat/inkomster/skatter/` (gross huvudgrupper 1100–1600 and 7100 as boxes; 1700, 1800, 1900 if negative, 7200 and 8000 in the minus strip with the equation line and the proportion bar), `/budget/stat/inkomster/<kod>/` for every typ, huvudgrupp and titelgrupp, and leaf pages for every titel. Plain-Swedish one-line explanations are shown under the H1 for every typ and huvudgrupp, and in the minus strip for the avgående poster (copy in P0/P11).
- **Design:** Files `src/pages/budget/stat/inkomster/index.astro`, `src/pages/budget/stat/inkomster/[kod].astro` and `src/lib/budget/revenue-labels.ts` (+ test). Reuse `LeafDetail.astro` from rn4.4 if it is merged; otherwise coordinate (it is the only shared file). Do **not** build a separate RevenueTree component.
- **Acceptance:**
  - every page builds for the latest year, and for every node and year the boxes + strip = node (covered by the view-model test);
  - an explanation exists for every typ and huvudgrupp code in the latest year (the test fails if one is missing);
  - `/inkomster/skatter/` for 2025 shows the "Dras av" strip with "Går vidare till kommuner, regioner, pensionssystemet och EU" and the equation line;
  - the Preliminärt badge appears for 2024 and 2025;
  - pnpm build, fmt:check, test and typecheck are green.

### New bead: "Budget advanced mode (Avancerat läge)"

Depends on rn4.3. Scope per P10: a switch with `?avancerat=1`; extra table columns (statens budget, ändringsbudgetar, utfall, skillnad); a löpande/fasta priser control (`?priser=fasta`, KPI to the latest year); an SVG time series for the current node (utfall plus dashed budget, preliminary years marked); the balance view shows inkomster vs utgifter over time plus andel av BNP through the last GDP year; codes shown. Files: `src/components/budget/{TimeSeriesChart,PriceToggle}.tsx`, `src/lib/budget/real.ts` (+ test), and edits to `DataTable.tsx` and `BudgetExplorer.tsx`. Acceptance: the link with `?avancerat=1&priser=fasta` restores the state; real.ts is tested against the KPI factor in docs/budget-data.md (2024→2025 is 1,0068); the chart has a text summary and the table is the alternative.

### New bead: "Salary panel: Vad betalar jag?"

Depends on rn4.11 and rn4.3. Scope per P8: the disclosure panel, monthly input, an editable assumptions section, the breakdown, kr display mode in boxes, table and aria labels, the honesty copy verbatim, state kept in localStorage (single key) across drills, leaf pages and visits, never in the URL, and the "nearest year's rules" fallback. Files: `src/components/budget/SalaryPanel.tsx`, plus edits to `Treemap.tsx`, `DataTable.tsx` and `BudgetExplorer.tsx`. Acceptance: no salary value appears in `location.href` or `sessionStorage`, and `localStorage` holds it only under the documented key (test); rounding rules; screen reader announces the result.

### hemsida-rn4.11 (addendum, not a rewrite)

Expose `estimateContribution(input, year)` returning `{ stat: Breakdown }`, with optional `kommun`/`region` reserved and an optional `kommunalskattesats` input. See P8 and the open questions on what the state's share of arbetsgivaravgifter and jobbskatteavdrag means.

### New chore bead: "Docs: dark mode is class-based; remove duplicate Inter load"

Covers E2 and E3 (`AGENTS.md:41`, `src/layouts/Layout.astro:29-34`).

## Open questions (for the user)

1. **Netting rule for the balance view (F1/P2).** Is it acceptable to show **"Skatter, netto" = typ 1000 + 7000 + 8000** as one box at the top, with the deductions shown in a "Dras av" strip one click in? It is the only way to have revenue at the same scale as spending with true-to-scale boxes. The alternative, all gross boxes, makes revenue look 2.4 times as large as spending.
2. **Where negative "övriga poster" go.** In years like 2021–2022 nettoutlåning is −100 mdkr. I propose showing it as a box on the inkomster side, "minskar utgifterna", so the saldo stays exact and every box is positive. The header totals stay official. Fine, or would you rather have a strip under the spending column, at the cost of the "same height" comparison?
3. **Salary model content (for rn4.11).** (a) Arbetsgivaravgifter include ålderspensionsavgift (10,21 %), which goes to the AP-fonder (avgående post 1812), not to the state. Should only the state's part count? I propose yes. (b) Jobbskatteavdrag is booked against state revenue (titel 1153), so it reduces what a wage earner contributes to the _state_ budget, often below zero before moms. Should it be included? Including it is more accurate but may surprise people ("I pay negative state tax"); leaving it out overstates the contribution. I lean towards including it, with one sentence of explanation.
4. **Discontinued anslag pages.** Generate leaf pages for all 814 keys (my proposal, so no box ever links to a 404), or only the 490 active ones, with discontinued anslag as table rows without a link?
5. **`/budget/` vs `/budget/stat/`.** Is the `stat` segment acceptable now, for future-proofing, even though it is the only level for a while?
6. **Touch interaction.** You chose click to drill. On phones that means no way to read a small box's figure without drilling, apart from the table. Keep it, or switch to tap-to-select with an info bar and an "Öppna" button on touch devices only?
