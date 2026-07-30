# Career Workbench — Current State

**Snapshot date:** 2026-07-30
**Confidence:** code- and CI-informed; release environment not re-verified

This file records current posture, blockers, and risks. GitHub Issues, pull
requests, and Git history own implementation detail. Accepted decisions remain in
`docs/decisions.md`; architecture and security claims remain in
`docs/architecture.md` and `docs/threat-model.md`.

## Current Posture

Career Workbench has a mature local and CI-verified product body on `chapter2`:

- R0–R2 engineering and end-to-end audit gates are complete.
- R3 is specification-complete; deployed-environment evidence and named human
  decisions remain open.
- R4 accessibility, mobile, and performance gate is complete.
- R5 has a staging/release runbook but has not been rehearsed against the current
  deployment.
- R6 and R8 instrumentation/evaluation foundations are implemented; R6 still
  needs a production-like two-week baseline.
- R7's six experiments are implemented default-off behind independent flags; none
  is authorized for live enablement before the R6 evidence gate.
- R9 removed the historical client-side ad gate. No monetization candidate,
  entitlement, vendor, or experiment is selected.
- R10 has an aggregate trigger scorecard. No response ticket is authorized until
  its corresponding sustained trigger fires.
- Every R11–R17 tracer issue is implemented ahead of its outcome gate. This is
  build completion, not production activation or acceptance of the roadmap
  outcome.

The latest slice, R16 #195, merged as PR #313 after green backend, frontend, and
PostgreSQL/Playwright CI. It adds strict compatibility-break containment and
quality-first aggregate governance. No real submission source, source OAuth flow,
third-party credential store, production adapter, scheduler, public submission
route, or unattended outward-act endpoint exists.

## Branch and Release Posture

- `chapter2` is the integration branch (D-027) and was at `69430f32` when this
  snapshot was verified.
- `main` and `deploy` both remain at `6a00a612`, 170 commits behind `chapter2`.
- The documented `chapter2 → main → deploy` promotion has not been run for
  this product body. Promotion remains an owner-controlled release action.
- Backend dependency resolution is locked: intent lives in `requirements.in`, and
  generated `requirements.txt` pins the complete graph so CI, local development,
  and deployment resolve the same versions (#288).
- The primary checkout contains unrelated owner work. Agents must continue using
  isolated worktrees and stage only ticket-scoped paths.

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

After documentation ticket #314, GitHub has no decision-complete implementation
issue. The next valid work requires external evidence, credentials, or human
judgement:

1. Run the R3/R5 staging and release checklist against the actual Railway topology,
   including migration, backup/restore or forward-fix, OAuth, email, LLM, telemetry,
   security-header, and rollback evidence.
2. Restore live Vertex authorization for #51 and perform the credential-dependent
   smoke journey.
3. Delete the historical PostHog cloud project data for #208 and retain provider
   evidence required by D-119.
4. Collect and accept the two-week R6 baseline; then choose the R7 experiment and
   D-NEXT-6 activation target from evidence.
5. Decide D-NEXT-2 (launch market), then perform the R9 legal/vendor/candidate
   decisions before any monetization implementation.
6. Observe the R10 scorecard and start only the response whose threshold fires.
7. Accept R11–R17 evidence and activation gates in dependency order; never infer
   acceptance from the existence of build-ahead code.
8. Select an R18 direction only after retention evidence satisfies D-115.

GitHub workflow labels now reflect this posture: closed tickets have no live
workflow-state label; evidence/decision parents are `ready-for-human`; dependent
R9/R10 responses are `needs-info`.

## Activation Boundaries

| Outcome | Implemented foundation | Remaining gate |
|---|---|---|
| R6 | allowlisted event store, funnel/failure/cost views, retention | production-like two-week baseline |
| R7 | six independently flagged, default-off candidates | evidence-selected candidate and accepted success metric |
| R8 | synthetic corpus, calibration/fabrication/usefulness checks, runner, admin evidence | every release change must pass quality, latency, and cost review |
| R9 | unsafe dormant ad path removed | baseline, activation target, launch market, legal/vendor, candidate, rehearsal |
| R10 | trigger scorecard | one sustained trigger for one proportional response |
| R11 | full build-ahead tracer set | D-060 and upstream release-quality evidence |
| R12 | full build-ahead tracer set | D-068 and accepted R11 activation |
| R13 | full build-ahead tracer set | D-076 and accepted R12 activation |
| R14 | fixture-only build-ahead tracer set | D-084, accepted R13, and per-source terms approval |
| R15 | full preparation/manual-handoff tracer set | D-092, accepted R14, packet-quality and demand evidence |
| R16 | local-fixture trusted-submission tracer set | D-100, accepted R15, real-source legal/contract approval and rehearsal |
| R17 | full build-ahead tracer set | D-108 and accepted recurring campaign/reviewer evidence |
| R18 | selection gate only | D-115 retention evidence and owner direction |

## Risks and Blockers

- **Release environment unverified.** Railway topology, variables, migrations,
  domain, backup posture, OAuth, email, provider, and monitoring facts may have
  changed. `docs/launch-checklist.md` owns verification.
- **Unguarded build-ahead navigation.** R11–R15 have user-reachable navigation even
  though D-060/D-068/D-076/D-084/D-092 remain open. This contradicts the original
  dark-only authorization and requires an owner decision; do not silently reinterpret
  the append-only decision log or promote these surfaces.
- **Sensitive browser state.** Four `sessionStorage` keys retain resume text, job
  descriptions, or generated output for shipped tab-scoped workflows. #77 requires
  owner judgement on further minimization; logout/deletion/manual reset cleanup is
  implemented and regression-tested.
- **Source legality and authorization.** Fixture support is not permission for a
  real source. Keep every discovery/submission source absent, pending, or killed
  until accepted terms review and compatibility ownership exist. D-026 prohibitions
  on unauthorized scraping, CAPTCHA bypass, copied sessions, credentials, and mass
  auto-apply remain permanent.
- **Activation evidence absent.** Code and synthetic fixtures cannot establish
  demand, retention, packet quality, recurring gap classes, provider reliability,
  or a scaling trigger.
- **Telemetry naming debt.** Backend stdout/Sentry still uses raw exception class
  names under `failure_category`; durable analytics independently enforces the
  closed allowlist. Any future analytics granularity must add an explicit enum,
  never persist raw class names.

## Verification Baseline

PR #313 is the latest product verification point on this snapshot:

- backend: ruff clean; 919 tests passed;
- frontend: typecheck clean; 446 Vitest tests plus 5 Node tests passed; production
  build passed;
- PostgreSQL: populated migration round trips, Alembic head, and concurrent
  submission/breakage containment proof passed;
- browser: desktop and 390 px quality-governance verification passed with no
  horizontal overflow or console errors;
- independent Standards and Spec reviews: clean;
- GitHub CI: Backend, Frontend, and E2E/PostgreSQL jobs passed before merge.

This evidence does not verify the deployed environment or close an activation gate.

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
