# Career Workbench — Current State

**Snapshot date:** 2026-07-05
**Confidence:** code-informed, release environment not re-verified

## Current Posture

Career Workbench is feature-rich and appears closer to release hardening than initial
MVP construction. All six tools, guest runs, authentication, history/workspaces,
admin, exports, telemetry, and deployment configuration exist.

R0 is merged into the long-lived `chapter2` product experimentation branch, and R1
baseline remediation is in progress there. `main` and `deploy` remain stable
promotion branches. The working tree contains unrelated thesis and generated asset
changes that agents must preserve and exclude from product commits.

The eventual first release posture is a free private beta. Launch operations,
acquisition, and monetization remain deferred while the roadmap establishes the
engineering and product-quality gates required to support that beta.

The long-term direction is now accepted: perfect the current product first, then
expand through an Evidence Profile, premium CV Studio, Application Campaigns, lawful
job discovery, an Application Approval Queue, and source-specific trusted
application automation. `docs/product-direction.md` owns this direction. These
features are not current implementation claims.

## Known Working Product Shape

- React/TanStack frontend and FastAPI backend.
- Six tools registered and guest-enabled.
- Shared backend tool pipeline.
- Cookie-based auth plus Google OAuth and password reset.
- Authenticated history, workspaces, favorites, labels, deletion, and revision chains.
- Guest results cached transiently in browser session state.
- Vertex AI generation and bounded job scraping fallback.
- Sentry, structured telemetry, rate limiting, and admin routes.
- Railway/Docker/Alembic deployment assets.
- Monetization UI exists historically, but the result gate is intended to remain
  bypassed in thesis/demo mode.

## Immediate Objective

**Status: R1 in progress**

Resolve high-confidence baseline defects without changing accepted product
contracts. Use the resulting evidence to drive R2–R4 before beginning Evidence
Profile or CV Studio work. Launch, acquisition, and monetization planning remain
deferred; the eventual release posture is a free private beta.

## Risks and Drift to Resolve

| Risk | Why it matters | Next action |
|---|---|---|
| Documentation drift | Old roadmap, frontend overhaul plan, `design.md`, and source code disagree in places. | Use canonical docs going forward; verify disputed behavior against code/UI. |
| Mixed local worktree | Product edits can accidentally include active thesis/generated files. | Stage explicit product paths only and verify every commit. |
| Release environment unverified | Railway topology, variables, migrations, domain, and deploy branch may have changed. | Run a deployment inventory and staging smoke test. |
| Frontend animation test flake | `DropzoneHero` success-state timing failed once in Linux CI before passing on rerun. | Stabilize the animation-exit test seam in [#54](https://github.com/gx4004/ai-career-platform/issues/54) without changing product motion. |
| Privacy retention unspecified | Resume text and generated output are sensitive. | Accept a retention/deletion decision before public launch. |
| Design contract conflict | `design.md` says light heroes while older context describes dark tool heroes. | Visually audit current product and accept one direction. |
| Browser storage contains workflow content | Useful for guests, but sensitive and easy to overlook. | Audit minimum data, expiry behavior, and clear-local-data UX. |
| In-process cache | Multi-instance behavior may be inconsistent. | Confirm production instance count; document or replace when needed. |
| Monetization deferred | Historical ad-gate code must not be mistaken for a current release requirement. | Keep gates disabled and revisit only after product-quality work. |

## Baseline Work Remaining

- provider-backed completion of Job Match and one generative guest tool;
- later R2 smoke test of all six guest tools;
- authenticated workflow and ownership checks;
- export verification;
- mobile and keyboard walkthrough;
- staging health, telemetry, error scrubbing, OAuth, email, and rollback checks;
- current production/staging database revision and backup posture.

## Constraints Until Decided

- Do not re-enable the ad gate.
- Do not implement subscriptions, affiliates, i18n, native apps, or LLM streaming.
- Do not change tool order or persistence semantics.
- Do not merge thesis and product-release work accidentally.
- Do not treat historical “complete” checkboxes as present-day verification.
- Do not begin CV Studio, job discovery, or application automation before a clean
  product branch and quality baseline exist.
- Do not implement unauthorized scraping, CAPTCHA bypass, credential/session
  extraction, or unattended mass auto-apply.

## R0 Verification

**Date:** 2026-07-05

**Commit tested:** `49e64aec` plus documentation and environment-example changes
that do not alter runtime behavior

**Environment:** macOS, pnpm 10.30.3, Python 3.11.9, pytest 9.0.2

**Status:** automated baseline and PostgreSQL migration pass; provider-dependent
browser smoke remains blocked

| Check | Command | Duration | Result | Notes |
|---|---|---:|---|---|
| Frontend install | `pnpm install --frozen-lockfile` | 1.65 s | pass | Lockfile was current; no dependency changes. |
| Frontend typecheck | `pnpm typecheck` | 5.72 s | pass | No TypeScript errors. |
| Frontend tests | `pnpm test` | 9.45 s | pass | 34 files, 181 tests. A non-blocking reduced-motion warning remains; Node 25 may also report an invalid `--localstorage-file` warning. |
| Frontend build | `pnpm build` | 5.71 s | pass | Client and SSR builds completed; main client JS 495.80 kB and CSS 449.91 kB before gzip. |
| Backend tests | `pytest -q` | 20.90 s | pass | 168 tests; five third-party SWIG deprecation warnings. |
| PostgreSQL migration | Local `alembic upgrade head --sql`; PR CI `alembic upgrade head` against empty PostgreSQL 16 | 0.67 s local; CI backend job 1 m 24 s | pass | Generated 116 lines locally through revision `e4a7b2d918f3`; PR [#52](https://github.com/gx4004/ai-career-platform/pull/52) completed the live migration. |
| SQLite migration replay | `alembic upgrade head` with disposable SQLite database | 0.42 s | unsupported | Stops at `8a9d2f4b1c55`; SQLite cannot add the migration's foreign-key constraint. R0 now documents PostgreSQL as the migration target. |
| Guest Resume Analyzer | Browser submission using synthetic resume text | 89.74 s | degraded pass | UI/API completed and returned deterministic fallback after Vertex AI reported billing disabled. |
| Guest Job Match | Browser form and carried resume context | — | blocked | Form and tab-scoped resume context loaded; provider-dependent completion blocked by [#51](https://github.com/gx4004/ai-career-platform/issues/51). |
| Guest generative tool | Career Path form with carried resume context | — | blocked | Provider-dependent completion blocked by [#51](https://github.com/gx4004/ai-career-platform/issues/51). |
| Environment examples | Compare `Settings` and frontend API configuration with both `.env.example` files | <1 s | pass after fix | Backend example now lists every runtime setting with non-secret development placeholders. |

## Handoff Format

At the end of a material work session, update this snapshot only if needed:

- **Objective:** one sentence
- **Changed:** durable reality, not file-by-file activity
- **Verified:** exact commands or manual checks
- **Blocked:** dependency plus owner/decision
- **Next:** one highest-value action

Remove obsolete state instead of appending a daily log.
