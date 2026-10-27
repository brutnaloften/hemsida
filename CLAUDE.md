# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Brutna Löften — a Swedish-language static site that tracks political promises. Built with Astro, deployed to GitHub Pages on push to `main`.

**Direction (in transition):** promises are collected once per term from a fixed source (starting with Tidöavtalet, 2022–2026), then tracked against official Riksdag documents from data.riksdagen.se. Each promise gets an objective evidence timeline (dir, SOU, prop, bet/votering, SFS) plus a human-set verdict with reasoning. Data stays as files in git so every verdict change goes through a reviewable PR. The old news-discovery pipeline is being retired.

## Roadmap

The roadmap lives in beads as epics with child tasks and dependencies. `bd list --type epic` shows the epics, `bd ready` shows what can be started. Current order: cleanup → data model v2 → Tidö promises → Riksdag integration → website → 2026–2030 term → budget → later epics.

## Commands

- `pnpm dev` — dev server at localhost:4321
- `pnpm build` — production build (output: `dist/`)
- `pnpm preview` — preview production build
- `pnpm fmt` — format all files with oxfmt
- `pnpm fmt:check` — check formatting without writing (for CI)
- `pnpm test` — run unit tests with vitest
- `pnpm typecheck` — `astro sync && tsc --noEmit` for the site (CI also runs it in `tools/`)

oxfmt runs on staged files in the pre-commit hook (lint-staged).

**Git hooks:** husky owns `core.hooksPath` (set by `pnpm install`). Each husky hook in `.husky/` also calls `bd hooks run <hook>`. Don't run `bd hooks install` — it repoints `core.hooksPath` and bypasses husky.

## Architecture

**Astro (static) + React islands:** Pages are Astro components (`src/pages/`), laid out with `src/layouts/Layout.astro` (includes Navbar, Footer, global CSS). Interactive parts use React via `client:load`.

**Data flow:** Political promises live as individual JSON files in `src/data/<term>/promises/`, e.g. `src/data/2022-2026/promises/` (one file per promise, e.g. `kd-miljardinvesteringar-infrastruktur.json`). These are loaded as an Astro content collection via `src/content.config.ts` (glob loader, Zod-validated schema). Pages query with `getCollection("promises")` and pass data as props to React components.

**Data model v2 (in progress, epic `hemsida-bzj`):** data is grouped by term (`src/data/2022-2026/promises/`) with a `sources` collection for origin documents (`src/data/sources/`), evidence references inside each promise file, and one shared Zod schema in `src/schema/promise.ts` (tested in `promise.test.ts`), imported by the site and re-exported to tooling via `tools/lib/schema.ts`. Data model decisions are in `docs/data-model.md`. The promise files are still v1 shape (`legacyPromiseSchema`) until `hemsida-bzj.5` migrates them.

**Tooling:** `tools/` is a separate pnpm package (own `package.json`, run with `node --experimental-strip-types`, type-check with `pnpm typecheck` inside `tools/`). `tools/lib/` holds infrastructure kept from the retired news-discovery pipeline: `claude.ts` (`createClient`, `loggedParse`, `isTransientApiError`), `resume.ts` (resumable per-item runs that skip transient API errors), `pr.ts` (one PR per change, `execFileSync` for git) and `json.ts` (Zod-schema-as-single-source pattern, JSON I/O).

**Search:** `src/pages/search.astro` hydrates `SearchPage.tsx` as a React island. It uses uFuzzy for client-side fuzzy search over all promise fields. `PromiseCard.tsx` renders individual results.

**UI components:** `src/components/ui/` contains shadcn/ui-style primitives (Card, Badge, Input) using Tailwind CSS v4 with CSS-variable-based theming (`src/styles/globals.css`). Dark mode uses `prefers-color-scheme`.

**Path aliases:** `@/*` maps to `./src/*` (configured in tsconfig.json).

**CI:** `.github/workflows/ci.yml` runs build, typecheck, `fmt:check` and tests for the site, then typecheck for `tools/`. `deploy.yml` publishes to GitHub Pages on push to `main`.

## Package manager

pnpm (pinned via `packageManager` field in package.json).

## Development workflow

- **Work comes from beads.** Pick from `bd ready` and claim with `bd update <id> --claim` before starting. One bead = one branch = one PR. File follow-up work you discover as new beads (`--deps discovered-from:<id>`).
- **Branches:** never commit to `main`. Name branches `<type>/<bead-id>-<slug>`, e.g. `feat/hemsida-bzj.2-shared-schema`.
- **Commits:** Conventional Commits (`feat(scope): …`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`). The bead ID goes in the PR body, not in commit messages.
- **PRs:** Claude owns PRs end to end — opens them, keeps CI green, and fixes review findings. The user does not review. PR body: bead ID, what changed, how it was verified. No Claude attribution line or session link in PR bodies.
- **Merging:** do not merge to `main` unless the user has said to work independently on multiple tasks. In that mode, squash-merge once CI is green and review is clean, then move on to the next ready bead.
- **Review before merging:** run the `code-reviewer` subagent on bead PRs before merging and fix what it finds. Trivial changes (typos, docs-only tweaks) can skip it.
- **Done = bead closed.** Close a bead when its PR is merged. If the PR is waiting on the user, leave the bead `in_progress` and record the PR link with `bd note`.
- **Quality gates before opening a PR:** `pnpm build`, `pnpm fmt:check`, and `pnpm test`.
- **Tests:** prefer tests for new logic (schemas, tooling, data transforms). UI-only changes may rely on `pnpm build`.
- **Data changes:** once seeding is done, every promise or verdict change gets its own PR. During initial seeding (e.g. the Tidöavtalet import) bulk PRs are fine.
- **Language:** code, comments, commits, PRs and beads in English; everything shown on the site in Swedish.
- **Authority:** Claude may commit, push branches, open/update/close PRs and close beads without asking. Never push to or force-push `main`; never merge outside independent mode.

## Subagents

- **`architect`** (Opus, `.claude/agents/architect.md`): breaks an epic down into child beads with dependencies, acceptance criteria and design notes. Read-only on code; it only writes beads. Run it on an epic before implementation starts.
- **`bead-worker`** (Sonnet, `.claude/agents/bead-worker.md`, `isolation: worktree`): implements one claimed bead end to end and opens a PR.
- **`code-reviewer`** (Opus, `.claude/agents/code-reviewer.md`, `isolation: worktree`): reviews one PR — re-runs the gates, checks the diff against the bead, then code quality — and posts its verdict as a PR comment. Read-only on code.
- The main session orchestrates: it picks ready beads, claims them, and spawns a `bead-worker` for each, then a `code-reviewer` on each PR before merging. Workers don't claim — the orchestrator already did, which avoids races.
- Only run beads in parallel when they touch different files; otherwise run them in sequence.
- **Context budget:** keep each subagent under ~300k tokens of context unless the work genuinely cannot be split. Size beads and prompts accordingly: tell large tasks (bulk triage, many files) to do the highest-value slice first and file follow-up beads for the rest, rather than clearing everything in one run. Balance this against agent count: don't split into many tiny beads and reviews just to stay under the budget.
- Worktrees share the beads database with the main checkout (via the git common dir), so `bd` works unchanged inside them.
- A fresh worktree has no `node_modules` or husky hooks: run `pnpm install` first.

## Worktrees

- Manual worktrees (for working on several things at once) go in `.worktrees/<name>` at the repo root: `bd worktree create .worktrees/<name> --branch <branch>` or `git worktree add .worktrees/<name> -b <branch>`. Remove with `bd worktree remove .worktrees/<name>` or `git worktree remove .worktrees/<name>`.
- Claude Code subagent worktrees stay in Claude Code's default `.claude/worktrees/`, where it handles locking and cleanup itself.
- Both directories are gitignored, which also keeps them out of oxfmt; TypeScript skips dot-directories.

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
