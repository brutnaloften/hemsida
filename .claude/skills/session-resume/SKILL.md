---
name: session-resume
description: Pick up work at the start of a session - load the handoff, verify it still matches reality, then dispatch the next task. Use when the user says session-resume, "let's continue", "where were we", "what's next", or opens a fresh context expecting work to carry on. The companion to session-close. Runs on the main thread; do NOT dispatch it to a subagent.
---

# Session Resume

The companion to `session-close`. That skill wrote a handoff for a competent
stranger; you are that stranger. Your job is to load it, **check it is still
true**, and then **get the next task moving** — orientation is the setup, not
the deliverable.

Work through all five steps in one turn. Keep steps 1-3 cheap: they are
orientation, not investigation. If they take more than a handful of tool calls,
you are doing the implementer's job instead of dispatching it.

## 1. Read the handoff first

`bd prime` injects memories at session start; the handoff is `bd recall
handoff`. That is where the last session put the next task, and the constraints
a fresh agent would otherwise cheerfully violate. `bd memories <keyword>` finds
the rest.

**Treat memory as dated, not authoritative.** It records what was true when
written. If it names a file, function, flag, bead or PR, verify that still
exists before recommending anything built on it. A confidently-followed stale
memory is worse than no memory.

## 2. Check the board against it

```bash
bd ready
bd list --json --status open     # never bare `bd list` — it truncates silently
bd show <the bead the handoff names>
```

Confirm the named next bead still exists, is still open, and is still
unblocked. If the handoff and the board disagree, **the board wins** — then say
so in your report, because it means something moved after the handoff was
written.

Read that bead's comments and notes before anything else. Prior sessions bank
evidence, dead hypotheses and explicit "do not re-derive this" notes there.
Re-deriving them is the single most expensive mistake available at this point.

## 3. Verify the workspace matches the story

```bash
git status --short
git log --oneline -5
git worktree list
gh pr list --author @me
```

Look for the gap between what the handoff claims and what is actually here:
uncommitted work, a worktree left behind, a PR that never merged or went red, a
bead marked `in_progress` with nothing to show. To check whether a branch
reached the remote, compare hashes with `git ls-remote` — a missing upstream or
a stale `git branch -r` proves nothing.

Also skim recent changes in `docs/` (e.g. `docs/data-model.md`). The project is
mid-transition away from the news-discovery pipeline; older docs and older
beads may describe a world that no longer exists, and following them wastes a
session.

## 4. Decide the next action

Name **one** thing to do next and why, with the bead ID. Prefer what the
handoff named unless step 2 or 3 contradicted it — if it did, say what changed.
An open PR with red CI or unfixed review findings usually beats starting new
work.

Before dispatching, restate for the implementer:

- what is already banked and must not be re-investigated, with where it lives
- any constraint that must not be quietly undone
- any spend cap or stopping rule still in force from the previous session

If nothing is obviously next, say that plainly and list the decisions blocking
the choice. Do not manufacture a task to look useful.

## 5. Act, then report

**Default to acting.** Do not stop to ask "shall I start?" — if steps 1-4
produced a clear next action, create the bead if one is needed, claim it, and
dispatch a `bead-worker` in this same turn, then report what you dispatched.
The user invoked resume because they want work to continue; making them type
"yes, go" is a wasted round trip. Reversible work (a branch, a worktree, a
bead, a PR, a dispatch) is decided, not asked about.

Report after dispatching. Lead with: where things stand in two or three lines,
what you dispatched and why, then anything that genuinely needs the user's
decision.

**Stop and ask instead of dispatching** only when: the choice is a
product-priority or editorial call (what gets built, what a verdict should
be); it is irreversible or outward-facing (pushing to `main`, a force-push, a
history rewrite); or two readings of the situation lead to materially
different work. Bundle those questions and attach a recommendation. If the
user's own message arrived with a different priority than the handoff assumed,
**their message wins** — resume against that.

Resuming does not by itself grant independent mode: merge PRs only if the user
has said to work independently (or invoked `auto-run`).

## Rules

- **Never invent progress.** If the last session did not finish something, say
  it did not. Check the bead and the PR, do not infer from an
  optimistic-sounding summary.
- **Do not re-run design work already recorded in a bead.** If the description
  carries a full design, the implementer needs none from you.
- Keep orientation small. Large outputs read on the main thread are paid for
  for the rest of the session.
