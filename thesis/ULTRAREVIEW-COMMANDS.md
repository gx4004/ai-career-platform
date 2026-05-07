# How to call /ultrareview — leak-safe procedure

> Repo `https://github.com/gx4004/ai-career-platform.git` is **public**. We must never push thesis content. The procedure below uses a local-only branch that /ultrareview can scan without the work ever reaching GitHub.

---

## Pre-flight check

Before running anything, confirm you are at the repo root:

```bash
cd /Users/goncuegemen/Documents/trials/ai-career-platform
pwd  # should print the path above
git status --short
```

You should see a list of untracked files like:
- `?? thesis/`
- `?? backend/app/data/`
- `?? backend/app/services/quality_signals_v2.py`
- `?? backend/app/services/runtime_settings.py`
- `?? scripts/eval_scoring.py`
- `?? scripts/analyze_eval_results.py`

…plus modifications to existing files (`config.py`, `schemas/admin.py`, `routers/admin.py`, `services/resume_analyzer.py`, `services/job_matcher.py`).

---

## Step-by-step

### 1. Create a local-only branch

```bash
git checkout -b thesis-review-local
```

This branch lives only on your machine. Never push it.

### 2. Stage and commit

```bash
git add \
  thesis/ \
  backend/app/data/ \
  backend/app/services/quality_signals_v2.py \
  backend/app/services/runtime_settings.py \
  backend/app/services/resume_analyzer.py \
  backend/app/services/job_matcher.py \
  backend/app/schemas/admin.py \
  backend/app/routers/admin.py \
  backend/app/config.py \
  scripts/eval_scoring.py \
  scripts/analyze_eval_results.py

git status --short  # confirm everything is staged

git commit -m "WIP local: thesis draft + heuristic v2 — DO NOT PUSH"
```

### 3. Verify nothing is pushed yet

```bash
git log --oneline -5
git branch -vv  # local branches; thesis-review-local should NOT have a tracking branch
```

You should see your new commit at the top of `thesis-review-local`. The `-vv` listing should show no `[origin/...]` next to the new branch.

### 4. Run /ultrareview

In the Claude Code prompt (not bash):

```
/ultrareview
```

The no-arg form bundles the **current local branch** and reviews it without needing a GitHub remote. It runs multiple cloud agents in parallel and returns a multi-perspective review.

> **Do not** type `/ultrareview <PR#>` here — that variant pulls from a GitHub PR, which would only work if the branch had been pushed (which we are deliberately avoiding).

### 5. After the review completes

Read the report. Common possibilities:
- **Mostly green** — the round-2 codex review is the harder check; if /ultrareview agrees, you are in good shape for the supervisor draft.
- **New findings** — apply them, commit again on the same branch, run /ultrareview a second time if you want a final pass.

### 6. When you are done with the local branch

You can keep `thesis-review-local` indefinitely on your machine for revision history. To switch back to working on the production code:

```bash
git checkout main
```

To delete the local-only branch later (after the thesis is submitted):

```bash
git branch -D thesis-review-local
```

---

## What about /ultraplan?

There is no `/ultraplan` command in the standard Claude Code skill set. If you have a custom plugin that exposes it, the same leak-safe procedure applies (commit on a local-only branch first). Otherwise, /ultrareview alone is the right tool here — its output already includes prioritised next-step guidance.

## What about codex round 2?

A second codex adversarial review is running **right now in the background** to validate that the fixes from round 1 actually landed. When it completes, the new section will appear at the bottom of `thesis/CODEX-ADVERSARIAL-REVIEW.md` titled "Round 2 — verification". Read it before sending the draft to the supervisor.

## Recommended order tonight / tomorrow

1. Wait for codex round 2 to finish (running in background, will notify when done).
2. Read `CODEX-ADVERSARIAL-REVIEW.md` round-2 section to confirm fixes landed.
3. If round-2 is mostly green: run `/ultrareview` per the procedure above for an independent multi-agent perspective.
4. Address any remaining findings.
5. Run the eval harness once you have the synthetic dataset, fill the *to be filled* cells in Chapter 4.3.
6. Convert the thesis to Word (against `engineer_en.docx`).
7. Send the Word file to the supervisor with a short Polish cover note.

---

## ⚠️ Things that would leak the thesis if you do them by accident

- `git push origin thesis-review-local` — **never do this**.
- `git push --all` — pushes every local branch including this one.
- `git push origin HEAD` while on `thesis-review-local` — pushes this branch.
- Running any deploy command while on `thesis-review-local` — Railway watches the `deploy` branch but a misclick on the wrong branch could still trigger a build with thesis files.

If any of these happen by accident, force-delete the remote branch immediately:

```bash
git push origin --delete thesis-review-local  # if it leaked
```

…and rotate any secrets that may have been exposed (none should be — `.env` files are gitignored — but check before assuming).
