# Career Workbench — Current State

**Snapshot date:** 2026-09-24 (Sept 2026 reset)
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
- Locally all R11–R17 feature flags are switched on via gitignored `.env` files.
- Vertex AI is not configured locally (placeholder project id); local AI runs use
  `LLM_PROVIDER=fake` or `anthropic` once available.

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
- Evidence Profile foundations with provenance, review, explicit confirmation,
  downstream confirmed-evidence reuse, export, deletion, and bounded telemetry.
- CV Studio foundations with structured import/editing, explainable scoring,
  evidence-grounded tailoring, immutable variants, three render templates,
  validated DOCX/PDF export, quotas, and lifecycle controls.
- Campaign foundations with canonical listings, exact material selection, bounded
  tasks/notes/contacts, append-only events, consented in-product reminders,
  immutable application snapshots, and an advisory reviewer.
- Job-discovery foundations with registry enforcement, fixture-only bounded
  ingestion, listing deduplication/expiry, explainable ranking, user controls,
  explicit campaign adoption, and source health/kill controls. No real source is
  registered or active.
- Approval-queue foundations with owner rules, caps, mandatory stops, reviewer and
  regression gates, explicit review controls, immutable approval snapshots,
  duplicate prevention, audit, and manual official-destination handoff. R15 never
  submits, schedules, or retries an outward act.
- Trusted-submission foundations with credential-free grant metadata, four-gate
  authorization, idempotency, terminal stop-and-return, a default-on safety
  envelope, immutable confirmation/audit, compatibility containment, and
  quality-first metrics. Only local fixture adapters exist.
- Career-development foundations with four explainable gap kinds, honest response
  mapping, bounded development items, explicit completion-to-unconfirmed-evidence,
  export/erasure, and aggregate-only telemetry.

## Immediate Objective

Execute the reset phases in `docs/roadmap.md` (#320–#326) in order. Each slice
lands as a PR into `chapter2` after local gates pass.

## Risks and Blockers

- **Release environment unverified.** Railway topology, variables, migrations,
  domain, backup posture, OAuth, email, provider, and monitoring facts may have
  changed. `docs/launch-checklist.md` owns verification.
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
- **Build-ahead activation remains unaccepted.** R11–R17 user API families and
  frontend routes/navigation are now protected by matching default-off,
  dependency-ordered flags. This closes accidental exposure but does not accept any
  outcome gate; activation still requires the recorded evidence and owner decision.
- **Sensitive browser state.** Four `sessionStorage` keys retain resume text, job
  descriptions, or generated output for shipped tab-scoped workflows. Logout,
  deletion, and manual reset clear the current tab and are regression-tested; an
  independently open tab retains its deliberately isolated copy until it performs
  the same action or closes.
- **Source legality and authorization.** Fixture support is not permission for a
  real source. Keep every discovery/submission source absent, pending, or killed
  until accepted terms review and compatibility ownership exist. D-026 prohibitions
  on unauthorized scraping, CAPTCHA bypass, copied sessions, credentials, and mass
  auto-apply remain permanent.
- **Activation evidence absent.** Code and synthetic fixtures cannot establish
  demand, retention, packet quality, recurring gap classes, provider reliability,
  or a scaling trigger.
- **R10 thresholds remain incomplete.** Rate-limit pressure has an encoded sustained
  threshold, while perceived-generation elevation and representative database query/
  pool pressure remain evidence-only until owners accept material-elevation and p95/
  capacity budgets. Railway storage evidence is deployment-dependent.
- **Telemetry naming debt.** Backend stdout/Sentry still uses raw exception class
  names under `failure_category`; durable analytics independently enforces the
  closed allowlist. Any future analytics granularity must add an explicit enum,
  never persist raw class names.

## Verification Baseline

### Historical merged baseline — PR #316

The PR #316 release body at `cd2986b3` recorded this historical local verification
baseline:

- backend: Ruff clean; 1,011 tests passed;
- frontend: typecheck clean; 478 Vitest tests plus 5 Node tests passed; client and
  SSR production builds passed;
- dependency integrity: `pnpm audit --prod` reports no known production
  vulnerabilities; `pip check` reports a consistent environment; `pip-audit`
  reports no known vulnerabilities after the narrow documented ignore for the
  unfixed optional `ecdsa` EC-path advisory that is unreachable under the enforced
  HS256-only JWT contract;
- PostgreSQL: populated packet-approval, trusted-submission, and operational-metric
  upgrade/downgrade/upgrade round trips passed; a fresh database reached
  `c4a8e2f6b1d9`; the two-worker submission-concurrency check passed;
- browser: the fresh-database Playwright gate passed 52/52;
- independent cumulative specification, standards, security/privacy, migration,
  and operational-readiness reviews found and fixed every actionable local issue,
  including dark-route data exposure, injection gating, Unicode/UTF-8 contract
  drift, Sentry leakage, pre-parse body bounds, privacy-control reachability,
  rate-limit/database evidence amplification, scorecard semantics, migration
  round trips, and full-suite synchronization drift;
- hosted CI and Docker were deliberately not run for `cd2986b3`: Actions was
  manual-only by owner policy, and Docker is unavailable locally.

### Current local candidate — verification in progress

The post-merge local candidate has final frontend evidence but does not yet have a
complete cumulative release result:

- runtime: Node 22.23.2;
- frontend dependencies: `pnpm audit --prod` reports no known vulnerabilities;
- frontend code and tests: typecheck passed; 517 Vitest tests plus 5 Node tests
  passed;
- frontend production process: the real client and SSR production build-and-serve
  smoke passed;
- backend, PostgreSQL, and E2E cumulative verification is in progress; no totals are
  recorded yet and the PR #316 totals must not be copied forward;
- hosted Actions has not been dispatched and remains manual-only; current container
  evidence remains uncollected because Docker is unavailable locally.

Neither baseline verifies the deployed environment or closes an activation gate.

## Constraints Until Decided

- Do not promote `chapter2`, mutate `deploy`, or run production migrations without
  explicit release ownership and current backup/rollback evidence.
- Do not enable R7 flags without the accepted R6 baseline and experiment metric.
- Do not add monetization, a provider fallback, streaming, stronger challenge, a
  database optimization, or source specialization before its accepted decision or
  R10 trigger.
- Do not activate or promote R11–R17 capabilities until each accepted evidence,
  legal/terms, release-quality, and production gate closes in dependency order.
- Do not register a real discovery or submission source without its accepted terms
  review; never bypass access controls or store third-party credentials/session
  state.
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
