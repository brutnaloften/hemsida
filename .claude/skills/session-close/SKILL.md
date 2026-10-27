---
name: session-close
description: Close out a work session cleanly - tidy the workspace, commit and record what happened, write durable memory for the next session, and name the next task. Use when the user says session-close, "clean up and record everything", "wrap up", "I'm going to clear your context", or is otherwise ending a stretch of work. Runs on the main thread; do NOT dispatch it to a subagent.
---

# Session Close

Run this on the **main thread**. It is a handoff ritual: the next session starts
with an empty context and only what you wrote down. Assume the reader is a
competent stranger who was not here.

Work through all five steps. Report a short summary at the end — not a
narration of each step.

## 1. Tidy the workspace

```bash
git status --short
git worktree list
git branch --list
gh pr list --author @me
```

- **Commit any uncommitted work that is a real deliverable** (docs, code, data
  the session produced) on its bead's branch — never on `main`. Losing it to a
  context clear or a crash is the bigger risk than an untidy history. Leave
  alone: `.beads/issues.jsonl` churn, `.claude/settings.local.json`, and
  anything the user owns.
- **Remove finished worktrees** — manual ones in `.worktrees/` with
  `git worktree remove <path>` (or `bd worktree remove`). Check each is clean
  first. This keeps the branch — nothing is lost. Never `git branch -D` during
  cleanup. Leave `.claude/worktrees/` to Claude Code.
- **Check every work branch has an upstream**:
  `git rev-parse --abbrev-ref <branch>@{u}`. A worker reporting "pushed" is not
  evidence it pushed. Unpushed branches exist on one laptop only — push them
  (CLAUDE.md allows pushing branches) or say plainly why not.
- **Check every open PR**: CI state (`gh pr checks <n>`) and that its bead has
  the PR link in a `bd note`.
- **Back up the beads board with `bd dolt push`.** The board lives in the local
  Dolt DB and syncs via `refs/dolt/data` on the git remote. Verify it landed
  with `git ls-remote origin | grep dolt` (`refs/dolt/data` present) — a clean
  exit code is not proof on its own. If it fails, check `bd dolt remote list`
  first: bd keeps its own remote, separate from git's, and a stale entry there
  is the likeliest cause.
- Delete scratch files the session created.

## 2. Reconcile the beads board

- Close what is genuinely done (PR merged), with a `--reason` that says why.
  A bead whose PR is still open stays `in_progress`.
- Close what is **overtaken** — beads whose approach died even if their goal
  survives — and say where the goal went. Do not leave a dead bead open as a
  reminder.
- Move banked evidence (findings, verified facts, dead hypotheses) **into the
  surviving bead's description**, not just a comment on a closed one. The next
  agent reads the open bead.
- `bd list --json`, never bare `bd list` — it silently truncates.

## 3. Write durable memory

Memory goes in beads: `bd remember "..." --key <slug>`, searchable with
`bd memories <keyword>` and injected by `bd prime`. Do not use `MEMORY.md`.
Memory is for what the repo does **not** already record. Do not duplicate code
structure, git history, or CLAUDE.md.

Write or update:

- **A handoff memory** (`--key handoff`, overwritten each close) naming where
  work stands, what is unblocked, open PRs, and the things that must not be
  quietly undone (constraints a fresh agent would cheerfully violate).
- **Lessons** worth carrying: a wrong assumption that cost real time, a
  correction the user made, a workflow gotcha. Include the _why_.
- Update any memory this session made **stale or wrong** (`bd forget <key>`).
  Deleting a wrong memory beats leaving it.

## 4. Name the next task — required

Do not end without this. In the handoff memory, state explicitly:

- **The next bead ID to dispatch**, and that it is unblocked.
- Why it is next, in one line.
- Anything the implementer must not re-derive, with a pointer to where the
  evidence lives.

If several things are ready, name **one** as next and say why it wins. If
nothing is obvious, say that explicitly and list the open questions blocking
the choice — an honest "no obvious next step, here is what to decide" is a
real answer; silence is not.

## 5. Report

Lead with workspace state and the next task. Then, briefly: what was committed
and pushed, which PRs are open, what was closed, what was written to memory.
Flag anything you could **not** finish or that needs the user's decision — an
unpushed branch, a red PR, an unanswered question, a spend cap that expired.

## Rules

- **Never push to `main`.** Branches and PRs are fine; merging only in
  independent mode (see `auto-run`).
- **Never invent progress.** If a milestone was not reached, the handoff says
  so. An optimistic handoff costs the next session more than a bleak one.
- Record cost honestly when a session was expensive, including what the spend
  actually bought.
