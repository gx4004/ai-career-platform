# Career Workbench — Current State

**Snapshot date:** 2026-07-05
**Confidence:** code-informed, release environment not re-verified

## Current Posture

Career Workbench is feature-rich and appears closer to release hardening than initial
MVP construction. All six tools, guest runs, authentication, history/workspaces,
admin, exports, telemetry, and deployment configuration exist.

The product baseline is being prepared on `r0-setup`, targeting the long-lived
`chapter2` product experimentation branch. `main` and `deploy` remain stable
promotion branches. The working tree contains unrelated thesis and generated asset
changes that agents must preserve and exclude from product commits.

The next product release is not yet defined. The roadmap therefore treats release
positioning and baseline verification as the first gate rather than assuming a public
launch.

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

**Status: R0 in progress**

Produce a reproducible engineering baseline without changing product behavior. Use
the resulting defect inventory to drive R1–R4 before beginning Evidence Profile or
CV Studio work. Launch, acquisition, and monetization planning are deferred; the
eventual release posture is a free private beta.

## Risks and Drift to Resolve

| Risk | Why it matters | Next action |
|---|---|---|
| Documentation drift | Old roadmap, frontend overhaul plan, `design.md`, and source code disagree in places. | Use canonical docs going forward; verify disputed behavior against code/UI. |
| Mixed local worktree | Product edits can accidentally include active thesis/generated files. | Stage explicit R0 paths only and verify every commit. |
| Release environment unverified | Railway topology, variables, migrations, domain, and deploy branch may have changed. | Run a deployment inventory and staging smoke test. |
| No fresh quality baseline | Historical test counts and bundle sizes are stale. | Record current frontend/backend/build/migration results. |
| Privacy retention unspecified | Resume text and generated output are sensitive. | Accept a retention/deletion decision before public launch. |
| Design contract conflict | `design.md` says light heroes while older context describes dark tool heroes. | Visually audit current product and accept one direction. |
| Browser storage contains workflow content | Useful for guests, but sensitive and easy to overlook. | Audit minimum data, expiry behavior, and clear-local-data UX. |
| In-process cache | Multi-instance behavior may be inconsistent. | Confirm production instance count; document or replace when needed. |
| Monetization deferred | Historical ad-gate code must not be mistaken for a current release requirement. | Keep gates disabled and revisit only after product-quality work. |

## Baseline Still Needed

- current frontend typecheck, tests, production build, and bundle report;
- current backend tests and migration-to-head from a clean database;
- smoke test of all six guest tools;
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

**Status:** automated baseline passes; provider-dependent browser smoke and live
PostgreSQL migration await external verification

| Check | Command | Duration | Result | Notes |
|---|---|---:|---|---|
| Frontend install | `pnpm install --frozen-lockfile` | 1.65 s | pass | Lockfile was current; no dependency changes. |
| Frontend typecheck | `pnpm typecheck` | 5.72 s | pass | No TypeScript errors. |
| Frontend tests | `pnpm test` | 9.45 s | pass | 34 files, 181 tests. Non-blocking reduced-motion and Framer Motion deprecation warnings remain. |
| Frontend build | `pnpm build` | 5.71 s | pass | Client and SSR builds completed; main client JS 495.80 kB and CSS 449.91 kB before gzip. |
| Backend tests | `pytest -q` | 20.90 s | pass | 168 tests; five third-party SWIG deprecation warnings. |
| PostgreSQL migration SQL | `alembic upgrade head --sql` with PostgreSQL URL | 0.67 s | pass | Generated 116 lines through revision `e4a7b2d918f3`; live empty-PostgreSQL execution delegated to existing PR CI job. |
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
