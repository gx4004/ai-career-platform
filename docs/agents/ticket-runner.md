# Ticket Runner Prompt

Copy-paste dispatch prompt for handing one backlog ticket to a fresh coding agent.
One ticket per agent per fresh context (per `/to-tickets`: work the frontier —
any ticket whose blockers are all closed).

## Dispatch prompt template

```text
Implement GitHub issue #<N> in this repository.

Before writing any code:

1. Read AGENTS.md and follow its source-of-truth precedence.
2. Run `git status` and `git log --oneline -5`. You must start from a clean,
   current `chapter2`. Create a work branch `feat/<issue-slug>` off `chapter2`.
   Never commit to `chapter2`, `main`, or `deploy` directly.
3. Run `gh issue view <N>` and read the full body. Then:
   - If the body has a PROVISIONAL/deferred banner, verify its gate has actually
     closed (roadmap status, referenced D-entries, shipped dependencies). If the
     gate is still open, STOP and report — do not implement a deferred ticket.
   - Check every issue in "Blocked by" is CLOSED (`gh issue view <blocker>`).
     If any is open, STOP and report.
4. Read the parent spec issue linked under "Parent", the decision-log entries
   (docs/decisions.md) and ADRs (docs/adr/) the ticket cites, and the matching
   CONTEXT.md terminology section. Use those terms in code, tests, and the PR.

Implementation:

5. Follow /implement: use /tdd at the seams the parent spec's Testing Decisions
   name; run typechecks and single test files as you go, the full suites once at
   the end (frontend: pnpm typecheck && pnpm test && pnpm build; backend:
   pytest; migrations: alembic upgrade head against PostgreSQL, not SQLite).
6. Respect standing constraints: shared tool pipeline for tool endpoints, Zod and
   Pydantic schemas mirrored, append-only ToolRun history, telemetry allowlist
   (never resume/JD/generated/evidence content), and everything in CLAUDE.md's
   "What NOT to Do".

Finishing:

7. Tick the acceptance criteria you satisfied in the issue body; if one cannot be
   satisfied, say why in an issue comment instead of silently skipping it.
8. Run /code-review on your work and address findings.
9. Open a PR to `chapter2` titled after the ticket, with body sections:
   Summary / How verified (exact commands + results) / Issue reference
   ("Closes #<N>"). Wait for CI (Frontend, Backend, E2E). A single E2E failure on
   an unrelated Portfolio transition test is a known flake — rerun the exact job
   once; any other failure is yours to fix.
10. Do not merge the PR and do not close the parent spec issue. Report: what
    shipped, what was verified, anything discovered that contradicts the docs
    (record contradictions in docs/state.md per AGENTS.md).
```

## Dispatch order (the frontier)

Consult `docs/roadmap.md` statuses first — they are the truth. As of 2026-07-10:

- **Startable now:** R6 tracer issues #104–#108 (activation instrumentation —
  unblocks R7/R9 evidence gates), R8 #119–#124 (quality evals), R9 #127 only
  (dormant ad-path removal — safe cleanup; #128+ stay gated).
- **Human decision work, not agent tickets:** finishing the R3 re-grill (which
  unblocks R5 and the whole R11+ chain), D-NEXT-2, D-NEXT-6, R18 direction
  selection (#204).
- **Gated (do not dispatch):** R7 #110–#115 (needs the R6 baseline), R10
  #136–#142 (needs scaling triggers), R11 #144–#150 (needs the closed R1–R4
  gate), and everything R12+ (each needs its predecessor, per the banners).

Within one R-cycle, dispatch in issue-number order unless "Blocked by" says
otherwise; tickets in different cycles whose gates are closed can run in
parallel only if they touch disjoint areas — when in doubt, serialize.
