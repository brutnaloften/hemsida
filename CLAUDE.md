# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Brutna Löften — a Swedish-language static site that tracks political promises. Built with Astro, deployed to GitHub Pages on push to `main`.

## Commands

- `pnpm dev` — dev server at localhost:4321
- `pnpm build` — production build (output: `dist/`)
- `pnpm preview` — preview production build

No linter or test runner is configured.

## Architecture

**Astro (static) + React islands:** Pages are Astro components (`src/pages/`), laid out with `src/layouts/Layout.astro` (includes Navbar, Footer, global CSS). Interactive parts use React via `client:load`.

**Data flow:** Political promises live in `src/data/promises.json`. This file is loaded as an Astro content collection via `src/content.config.ts` (Zod-validated schema). Pages query it with `getCollection("promises")` and pass data as props to React components.

**Search:** `src/pages/search.astro` hydrates `SearchPage.tsx` as a React island. It uses uFuzzy for client-side fuzzy search over all promise fields. `PromiseCard.tsx` renders individual results.

**UI components:** `src/components/ui/` contains shadcn/ui-style primitives (Card, Badge, Input) using Tailwind CSS v4 with CSS-variable-based theming (`src/styles/globals.css`). Dark mode uses `prefers-color-scheme`.

**Path aliases:** `@/*` maps to `./src/*` (configured in tsconfig.json).

## Package manager

pnpm (pinned via `packageManager` field in package.json).
