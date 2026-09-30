# Career Workbench — Current State

**Snapshot date:** 2026-09-30 (Sept 2026 reset; integration branch `integration/chapter2-narrowing`, PR #402)
**Confidence:** code- and local-verification-informed; no deployed environment

This file records current posture, blockers, and risks. GitHub Issues, pull
requests, and Git history own implementation detail. Direction and phases live
in `docs/roadmap.md` (umbrella issue #319).

## Current Posture

- The owner reset direction on 2026-09-24: local-only, feature-first, keep every
  built feature but make it real and visually consistent with the original design.
- `chapter2` now contains all prior work: the R0–R17 build (PR #316), the
  Aug 2026 roadmap-finish commits (#318), and the repo tidy (#317).
- The R-series issues were closed as superseded; only #208 (owner PostHog console
  deletion) remains from the old set.
- `main` and `deploy` are untouched thesis-era branches; Railway is not paid for.
  No release or promotion is planned in this run.
- All product areas are always on (R11–R17 outcome flags removed, #351); only
  `AUTOPILOT_EXPERIMENT_ENABLED` and `ATS_INGESTION_ENABLED` remain off by default.
- Vertex AI is not configured locally (placeholder project id); local AI runs use
  `LLM_PROVIDER=fake` or `anthropic`. The backend refuses `fake` outside development.
- The chapter2 narrowing work (`docs/handoff-2026-09-29.md`) removes the R15 queue,
  R16 submission code, contacts, reminders, Sentry/CAPTCHA wiring and the R8/R10
  harnesses; Approval Queue merged into Applications (ADR 0009, D-126 to D-131).

## Branch and Release Posture

- `chapter2` is the integration branch (D-027); merged PR #316 is the cumulative
  review and integration record for the base release body at `cd2986b3`.
- `codex/local-roadmap-finish-20260813` is the unpushed local candidate carrying the
  additional hardening and release-gate commits. Its current cumulative verification
  record remains in progress.
- `main` and `deploy` remain stable promotion branches. Their promotion distance
  must be measured from live refs at release time rather than copied into memory.
- The documented `chapter2 → main → deploy` promotion has not been run for
  this product body. Promotion remains an owner-controlled release action.
- GitHub Actions is intentionally manual-dispatch only to conserve hosted quota.
  Pushes and pull-request updates do not run CI; all feasible gates run locally,
  and only the owner may request a hosted dispatch.
- `scripts/local-release.sh` is the canonical local release gate. It verifies the
  declared runtimes, builds and inspects both deployment images when Docker is
  available, and requires explicit guarded disposable PostgreSQL URLs for database
  mutation phases without dispatching Actions.
- Backend dependency resolution is locked: intent lives in `requirements.in`, and
  generated `requirements.txt` pins the complete graph so CI, local development,
  and deployment resolve the same versions (#288).

## Known Working Product Shape

- React/TanStack frontend and FastAPI/PostgreSQL backend.
- Six guest-enabled tools through one shared backend pipeline.
- Cookie authentication, Google OAuth, password reset, history, workspaces,
  favorites, labels, revisions, deletion, exports, admin, telemetry, quotas, and
  deployment assets.
- Evidence Profile with provenance, review, explicit confirmation, downstream
  confirmed-evidence reuse, export and deletion.
- CV Studio: structured import/editing, five render templates, preview-led editor,
  evidence-grounded tailoring, immutable variants, DOCX/PDF export, and a
  pass/fail ATS check with no score (D-126).
- Applications (former Campaigns and Approval Queue): current listing, selected
  materials, prepared drafts with mandatory stops, tasks and notes, append-only
  timeline, an immutable applied snapshot, and an advisory reviewer. Nothing
  submits; the owner applies (ADR 0009).
- Job Discovery from public Greenhouse, Lever and Ashby job-board APIs through the
  source registry (terms review is an open owner item, #368), listing dedup/expiry,
  explainable ranking, user controls and explicit adoption into Applications.
- Career development: four gap kinds, honest response mapping, bounded development
  items, completion into unconfirmed evidence, export and erasure.
- Autopilot: experimental, development-only, never submits.

## Immediate Objective

Execute the reset phases in `docs/roadmap.md` (#320–#326) in order. Each slice
lands as a PR into `chapter2` after local gates pass.

## Risks and Blockers

- **Release environment unverified.** Railway topology, variables, migrations,
  domain, backup posture, OAuth, email, provider, and monitoring facts may have
  changed and remain to be verified before promotion.
- **Container build unverified for the current local candidate.** Docker is
  unavailable in this checkout environment. The root local release runner can build
  both images and verify their non-root runtime users when Docker is available; the
  preserved manual workflow is an optional owner-dispatched hosted evidence path,
  not a prerequisite for local verification. Staging still owns deployed
  construction and startup evidence.
- **Repository security settings require owner action.** Dependabot configuration
  and a high-severity production audit gate now live in the repository, while
  secret scanning, push protection, and code scanning still require GitHub
  repository settings or an accepted workflow decision.
- **Hosted launch hardening is deferred.** Proxy-aware rate-limit keys and shared
  limiter storage were removed (#355); there is no Sentry, CAPTCHA or analytics
  vendor (D-129). These must be redesigned deliberately, with matching legal-page
  changes, before any hosted launch.
- **Sensitive browser state.** Four `sessionStorage` keys retain resume text, job
  descriptions, or generated output for shipped tab-scoped workflows. Logout,
  deletion, and manual reset clear the current tab and are regression-tested; an
  independently open tab retains its deliberately isolated copy until it performs
  the same action or closes.
- **Source legality and authorization.** Fixture support is not permission for a
  real source. Keep every discovery source pending or killed until its terms
  review is accepted (#368). D-026 prohibitions
  on unauthorized scraping, CAPTCHA bypass, copied sessions, credentials, and mass
  auto-apply remain permanent.
- **Activation evidence absent.** Code and synthetic fixtures cannot establish
  demand, retention, packet quality, recurring gap classes, provider reliability,
  or a scaling trigger.
- **Telemetry naming debt.** Backend stdout still uses raw exception class names
  under `failure_category`; nothing is persisted. Any future persisted analytics must
  add an explicit enum, never raw class names.

## Verification Baseline

The last full local release gate (`scripts/local-release.sh`, before the final four
integration PRs) was green: ruff, 658 pytest, typecheck, 413 vitest, build, alembic
on a fresh database, and 54/54 Playwright. Later PRs passed their own unit tests and
typecheck. A final full gate and screenshot pass is the last step before PR #402
merges (`docs/handoff-2026-09-29.md`). Hosted CI is manual-dispatch only and Docker
is not used locally; nothing here verifies a deployed environment.

## Constraints Until Decided

- Do not promote `chapter2`, mutate `deploy`, or run production migrations without
  explicit release ownership and current backup/rollback evidence.
- Do not add monetization, a provider fallback, streaming, or a CAPTCHA without an
  explicit owner decision.
- Do not register a discovery source as accepted without its terms review; never
  bypass access controls or store third-party credentials/session state. Do not add
  submission automation (D-128).
- Do not treat implementation completion, synthetic fixtures, or green CI as
  product-outcome evidence.

## Handoff Format

At the end of a material session, update this file only when current reality changes:

- **Objective:** one sentence.
- **Changed:** durable reality, not file-by-file activity.
- **Verified:** exact commands or manual checks.
- **Blocked:** dependency plus owner/decision.
- **Next:** one highest-value action.

Remove obsolete state instead of appending a session diary.
