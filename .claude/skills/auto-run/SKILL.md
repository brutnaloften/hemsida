---
name: auto-run
description: Work autonomously until the board is empty - stop asking Andreas what to do next. Use when the user says auto-run, "keep going", "don't ask me", "work until you're done", or when auto-recovery wakes the session after a limit reset.
---

# auto-run

Andreas has turned this on deliberately. It is standing authorization: **work
until there is no more work.** Do not end a turn by asking which task to pick,
whether to proceed, or whether he wants you to continue. Pick, proceed, continue.

This is the "work independently on multiple tasks" mode from CLAUDE.md: you may
squash-merge your own PRs to `main` once CI is green and self-review is clean.

## The loop

1. `bd ready` — take the highest-priority unblocked bead. Ties: prefer the one
   that unblocks the most other work.
   - If beads are in progress (`bd list --status=in_progress`), resume those
     first. An open PR recorded in a `bd note` is where to pick up.
2. Investigate before delegating: read the actual files the bead touches, then
   log `bd comments add {ID} "INVESTIGATION: ..."`.
3. Claim it (`bd update {ID} --claim`) and dispatch a `bead-worker`. Beads that
   touch different files may run in parallel; otherwise run them in sequence.
   Verify the worker's claims yourself — check the PR diff, CI status
   (`gh pr checks`), and that the branch actually reached the remote.
4. Self-review the PR and fix the findings. When CI is green and review is
   clean, `gh pr merge --squash --delete-branch`, then `bd close {ID}`.
5. Go to 1. Do not stop to report between iterations beyond 1-5 terse lines.

When `bd ready` is empty and nothing is in progress: say so in one line, name
what you would do next, and stop. That is the only clean exit.

## What still stops you

Stop and ask **only** when:

- **The decision is a product-priority or editorial call** that changes what
  gets built or what the site claims — e.g. which promises count, how a
  verdict scale is defined, what a verdict on a specific promise should be.
  Verdicts are human-set by design; propose them in a PR, do not merge them.
- **The action is irreversible or outward-facing** — pushing to or
  force-pushing `main`, a history rewrite, deleting a remote branch that is not
  yours, changing repo or Pages settings.
- **Two readings of the request lead to materially different work** and you
  cannot pick one from the roadmap epics.

When you do stop, batch it: state everything blocked, what you need, and your
recommendation, in one message. Then keep working on anything not blocked by it.

## What is NOT a reason to stop

- "Which of these should I do first?" — pick the one that unblocks more.
- "Should I merge this?" — if CI is green and review is clean, merge it.
- "Do you want me to fix this too?" — if it is in the bead's scope, fix it.
  Otherwise file it with `--deps discovered-from:{ID}` and move on.
- "This took a while, should I continue?" — yes.
- A failed build, a red CI run, a worker that got it wrong — that is work, not
  a blocker. Fix it or file a bead and move on.
- An expensive debugging hunt — set yourself a stopping rule (a cap on
  dispatches), say what it is, and spend up to it before escalating.

## Reporting while auto-running: CAVEMAN

Nobody reads this. Spend no tokens on it. **Talk like a caveman.**

- **Max one line per unit of work.** Fragments, not sentences. Drop articles,
  pronouns, filler verbs. "Merged #53. Build green. Starting bzj.3."
- **Facts and numbers only.** Bead ID, PR number, verdict, count, next bead.
  Nothing else.
- **Zero explanation.** No why, no how, no trade-offs, no caveats, no "note
  that". If it worked, say it worked.
- **No preamble, no recap, no closing offer.** Never "Let me...", never
  "Summary:", never "Let me know if...".
- **Failures get one line too:** what broke + what you did. "bzj.2 CI red,
  fmt:check. Fixed, rerunning."

Full prose is allowed in exactly three cases, and only for the part that needs
it: a blocker needing Andreas (state it + recommendation), a correction to
something he believes, raw error/test output. Everything else: caveman.
