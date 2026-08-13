# Career Workbench — Current State

**Snapshot date:** 2026-08-13
**Confidence:** code-, independent-review-, and local-verification-informed; release
environment not re-verified

This file records current posture, blockers, and risks. GitHub Issues, pull
requests, and Git history own implementation detail. Accepted decisions remain in
`docs/decisions.md`; architecture and security claims remain in
`docs/architecture.md` and `docs/threat-model.md`.

## Current Posture

Career Workbench has a mature product body on `chapter2`, with the cumulative
release review and integration record carried by PR #316 from
`codex/autonomous-20260802`:

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
- R9 removed the historical client-side ad gate and now has a default-off,
  candidate-neutral server result/export access seam. No monetization candidate,
  entitlement, vendor, or experiment is selected.
- R10 has an aggregate trigger scorecard fed by bounded rate-limit, generation-phase,
  abandonment, database-query, and capacity samples. No response ticket is authorized
  until its corresponding sustained trigger and owner-defined threshold fire.
- Every R11–R17 tracer issue is implemented ahead of its outcome gate. This is
  build completion, not production activation or acceptance of the roadmap
  outcome.

The reviewed body also completes the safe preparatory portions of R9/R10, hardens
R1/R3/R6/R11 boundaries, and corrects CV Studio recovery. Integrating it into the
experimental `chapter2` branch is not deployment, production activation, or
acceptance of any roadmap outcome. No real submission source, source OAuth flow,
third-party credential store, production adapter, scheduler, public submission
route, or unattended outward-act endpoint exists.

## Branch and Release Posture

- `chapter2` is the integration branch (D-027); PR #316 is the cumulative review
  record for the current release body.
- `main` and `deploy` remain stable promotion branches. Their promotion distance
  must be measured from live refs at release time rather than copied into memory.
- The documented `chapter2 → main → deploy` promotion has not been run for
  this product body. Promotion remains an owner-controlled release action.
- GitHub Actions is intentionally manual-dispatch only to conserve hosted quota.
  Pushes and pull-request updates do not run CI; all feasible gates run locally,
  and only the owner may request a hosted dispatch.
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

After the cumulative release review, GitHub has no decision-complete implementation
issue. The next valid work requires external
evidence, credentials, an irreversible provider action, or human judgement:

1. Run the R3/R5 staging and release checklist against the actual Railway topology,
   including migration, backup/restore or forward-fix, OAuth, email, LLM, telemetry,
   security-header, and rollback evidence.
2. Restore live Vertex authorization for #51 and perform the credential-dependent
   smoke journey.
3. Complete the already accepted D-119 deletion of historical PostHog cloud data
   for #208 without export, and retain provider evidence.
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
| R9 | unsafe dormant ad path removed; candidate-neutral access seam default-off | baseline, activation target, launch market, legal/vendor, candidate, treatment contract, rehearsal |
| R10 | measured trigger scorecard and bounded operational samples | accepted missing thresholds and one sustained trigger for one proportional response |
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
- **Container build unverified for the reviewed head.** The frontend image is
  aligned to Node 22, but Docker is unavailable in this checkout environment.
  The preserved manual workflow can build both images and verify their non-root
  runtime users when the owner chooses to spend hosted quota; staging still owns
  actual construction/startup evidence.
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

The PR #316 release body is the latest local verification point on this snapshot:

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
- hosted CI and Docker were deliberately not run for this head: Actions is
  manual-only by owner policy, and Docker is unavailable locally.

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
