# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Brutna Löften — a Swedish-language static site that tracks political promises. Built with Astro, deployed to GitHub Pages on push to `main`.

## Commands

- `pnpm dev` — dev server at localhost:4321
- `pnpm build` — production build (output: `dist/`)
- `pnpm preview` — preview production build
- `pnpm fmt` — format all files with oxfmt
- `pnpm fmt:check` — check formatting without writing (for CI)

oxfmt runs automatically via a PostToolUse hook after every Edit/Write.

## Architecture

**Astro (static) + React islands:** Pages are Astro components (`src/pages/`), laid out with `src/layouts/Layout.astro` (includes Navbar, Footer, global CSS). Interactive parts use React via `client:load`.

**Data flow:** Political promises live as individual JSON files in `src/data/promises/` (one file per promise, e.g. `kd-miljardinvesteringar-infrastruktur.json`). These are loaded as an Astro content collection via `src/content.config.ts` (glob loader, Zod-validated schema). Pages query with `getCollection("promises")` and pass data as props to React components.

**AI pipeline:** `pipeline/` contains a TypeScript pipeline that discovers political news, extracts promises, matches against existing data, evaluates status changes, and creates PRs. Run with `node --experimental-strip-types pipeline/discover.ts --dry-run`. Orchestrated via `.github/workflows/pipeline.yml` (manual trigger).

**Search:** `src/pages/search.astro` hydrates `SearchPage.tsx` as a React island. It uses uFuzzy for client-side fuzzy search over all promise fields. `PromiseCard.tsx` renders individual results.

**UI components:** `src/components/ui/` contains shadcn/ui-style primitives (Card, Badge, Input) using Tailwind CSS v4 with CSS-variable-based theming (`src/styles/globals.css`). Dark mode uses `prefers-color-scheme`.

**Path aliases:** `@/*` maps to `./src/*` (configured in tsconfig.json).

## Package manager

pnpm (pinned via `packageManager` field in package.json).


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:1105d646 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/core-concepts/sync-concepts.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->
