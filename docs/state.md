# Career Workbench — Current State

**Snapshot date:** 2026-07-06
**Confidence:** code-informed, release environment not re-verified

## Current Posture

Career Workbench is feature-rich and appears closer to release hardening than initial
MVP construction. All six tools, guest runs, authentication, history/workspaces,
admin, exports, telemetry, and deployment configuration exist.

R0 and R1 are merged into the long-lived `chapter2` product experimentation branch,
and the repaired R2 end-to-end product audit is green in PR #84. `main` and `deploy` remain
stable promotion branches. The working tree contains unrelated thesis and generated
asset changes that agents must preserve and exclude from product commits.

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

**Status: R3 specification complete (D-116–D-119, 2026-07-10); the R5 staging
rehearsal owns the R3 Evidence Checklist but deployment work is owner-deferred
for now; remaining human items: perform the PostHog data deletion (#208, D-119)
and decide D-NEXT-2**

The `docs/threat-model.md` canonical inventory is complete (#73). It maps system
topology, trust boundaries, data flows, assets, browser storage, API surface, auth
model, processing pipeline, external integrations, observability, abuse cases, and
privacy failure modes from executable code and configuration. Unknown production
facts are recorded as ready-for-human decisions (D-UNK-1 through D-UNK-10).

R3 #79 now enforces the existing 10 MB upload limit while reading, requires
extension/MIME/magic agreement, bounds DOCX expansion and PDF pages/output, and
isolates parsing behind wall-clock, Unix CPU, and Linux memory limits. Malformed,
encrypted, bomb-like, timed-out, and crashed parser inputs return generic errors;
temporary resources are closed. The change is backward-compatible for valid PDF
and DOCX uploads and has no persistence or migration impact.

R3 #80 now fails closed on unresolved or ambiguous URLs, checks every DNS answer,
pins each HTTP and redirect connection to a validated public IP, bounds accepted
HTML responses to 2 MB, and denies direct Playwright network access. Playwright
retains rendered-site support by proxying bounded navigation and text subresources
through that pinned client; failed or insufficient extraction retains the existing
paste-text fallback.

R3 #75 preserves PRD #72's SameSite=Lax contract after characterizing the
code/default-development cookie, OAuth callback, CORS, content-type, and
authorization boundaries. No runtime auth behavior or stored-data contract
changed. Production frontend/backend origins, CORS and redirect values, TLS/site
relationship, and a staging OAuth state round trip remain ready-for-human evidence
before #75 can close; regression coverage and rollback posture are recorded in
`docs/threat-model.md` §7.5. Forced cross-site logout is now rejected by an
explicit-Origin allowlist while configured frontend and non-browser clients remain
compatible. New password-reset links carry tokens in URL fragments and scrub them
after hydration; legacy query links remain compatible during rollout.

R3 #76 uses shared limiter storage outside development, HMAC-pseudonymized
account and source-IP identities, shared model-cost and resource-import ceilings,
account-scoped registration/reset counters, and expiring progressive login delay
without hard account lockout. Health probes remain unlimited. Production must
provide and capacity-test `RATE_LIMIT_STORAGE_URI`; route-specific CAPTCHA work is
triggered only by the accepted aggregate event threshold or provider cost alerts.

R3 #74 is resolved: D-031 through D-035 in `docs/decisions.md` accept indefinite
primary-data retention until user-initiated deletion, no backups during the
thesis-demo phase (Railway managed backups + a rehearsed restore procedure become
required before beta launch, tracked by R5), Railway-managed log retention,
processor-managed Sentry event retention when Sentry is enabled, and the existing
structured deletion log line as the minimal audit record. `docs/threat-model.md`
D-UNK-6/D-UNK-7 are marked resolved.

R3 #78 now rejects unknown or content-bearing telemetry fields and removes raw
frontend error messages plus stable run/workspace identifiers. Frontend/backend
Sentry hooks drop request content, credentials, query strings, breadcrumb bodies,
and entire user contexts. Model, import, email, and OAuth failure logs emit generic
categories rather than content, emails, full URLs, or provider exception text.
Deletion-audit and retention policy are now resolved by #74; Sentry enablement
itself still depends on the separate D-UNK-4 production-evidence question (is
`SENTRY_DSN` set in production).

R3 #77 now centralizes sensitive tab-data cleanup for drafts, workflow context,
guest results, and resume carry. Explicit logout clears it even if the server
request fails; account deletion and the manual reset use the same operation.
Persisted guest results are removed by prefix after reload, while consent,
onboarding, and non-sensitive UI state remain intact. Its retention dependency on
#74 is now resolved.

R3 #81 now has a locally verified frontend-response implementation: SSR and static
responses receive a deployment-compatible CSP and baseline browser security
headers, HSTS requires an explicit deployment switch plus HTTPS forwarding, and
COEP/includeSubDomains/preload remain deliberately disabled pending compatibility
and domain evidence. Both runtime images now drop root privileges; Docker build
verification remains outstanding because the local Docker engine is unavailable.
Production Railway origins, TLS forwarding, OAuth, Sentry, downloads, and font
behavior still require staging verification before #81 can close.

R4 automated baseline is merged in PR #96 and covers 10 representative routes (landing through settings)
with axe-core critical-violation scans, 320/375 px horizontal-overflow checks,
keyboard walkthrough (login→dashboard→resume flow with visible focus rings),
semantic landmark verification (main, nav, headings), accessible-name validation
for icon-only interactive elements, reduced-motion suppression for dashboard
infinite animations (shimmer-multi, dropzone-pulse, dropzone-border-glow), the
cookie banner, inline tool illustrations, FadeUp and FadeIn framer-motion
wrappers, and performance budgets (production main JS under 540 kB, production
CSS under 480 kB, JS heap under 50 MB, health API p95 under 500 ms, and
deterministic resume API p95 under 3 s). Framer-motion's useReducedMotion() is
now checked in FadeUp and FadeIn components. The accessibility/mobile route
settle delay was trimmed after hydration to keep the suite coverage intact while
reducing E2E runtime. PR #96 is green in CI as of 2026-07-07: frontend, backend,
and E2E Playwright/PostgreSQL checks all pass, with the E2E browser journey
completing in 7m28s and Playwright reporting `49 passed (6.0m)`. Follow-up local
review moved the byte-budget assertions out of the dev-server Playwright path and
into a production-build Node test so missing asset headers cannot pass as a
zero-byte measurement, then added deterministic API latency budgets to complete
the R4 performance baseline.

Remaining R3 slices: #74 is closed. The re-grill is closed (D-116): #75, #76, and
#81 wait only on the R3 Evidence Checklist in `docs/launch-checklist.md`, which the
R5 staging rehearsal collects; D-117 resolved the Sentry unknown (launch with
`SENTRY_DSN` unset) and D-118 resolved product-side PostHog (never a processor;
remnant proxy removed as cleanup). #82 (legal reconciliation) waits on the
checklist, the performed PostHog deletion (#208, decided by D-119), and D-NEXT-2
launch market.

## Risks and Drift to Resolve

| Risk | Why it matters | Next action |
|---|---|---|
| Documentation drift | Old roadmap, frontend overhaul plan, `design.md`, and source code disagree in places. | Use canonical docs going forward; verify disputed behavior against code/UI. `docs/threat-model.md` now anchors security claims to code. |
| Mixed local worktree | Product edits can accidentally include active thesis/generated files. | Stage explicit product paths only and verify every commit. |
| Release environment unverified | Railway topology, variables, migrations, domain, and deploy branch may have changed. | Run deployment inventory and staging smoke test. See `docs/threat-model.md` §14 D-UNK-1 through D-UNK-10. |
| Monetization deferred | R9 has no activation baseline, accepted target, launch market, or selected candidate. The historical client ad wrapper is not a safe disabled state: its hook can load AdSense for pending consent when locally configured, even though the wrapper returns full results. | Remove the dormant client path (D-051); keep R9 candidate-neutral and dark until the D-046/D-047 evidence gate closes. |
| Scaling responses deferred | The intended deployment currently starts one Uvicorn process, and no accepted evidence shows sustained cache, provider, latency, abuse/cost, database, or job-import pressure. | Implement the R10 aggregate trigger scorecard first; authorize only the independent response whose scaling trigger fires (D-052–D-059). |
| Evidence Profile deferred | No persisted profile entity, provenance/confirmation primitive, or full-data export exists; resume text is ephemeral tab-scoped state re-supplied inline per run, and R12/R13 depend on the profile's shape. | Keep R11 contract-only (D-060–D-067, ADR 0005) until the R1–R4 gate closes; implement the profile entity, confirmation lifecycle, and export slices first. |
| CV Studio deferred | Every studio layer is greenfield: parsing is text-only, no structured CV model, DOCX generation, template system, print/page-break handling, variant versioning, or editor surface exists, and per-route rate limits do not bound iterative editing loops. | Keep R12 contract-only (D-068–D-075, ADR 0006) until R11 lands; implement document entity and reviewed import first, exporters behind validation gates. |
| Campaigns and reviewer deferred | Workspaces are bare label+pin containers, listings are never persisted (no source URL or retrieval date), no status/task/reminder/notification infra exists, and the D-043 fabrication tracer is unimplemented; contacts will be the first third-party personal data. | Keep R13 contract-only (D-076–D-083, ADR 0007) until R12 lands; implement the additive workspace migration and listing persistence first, reviewer after the tracer. |
| Job discovery deferred | No source registry, robots handling, listings store, dedup, ranking surface, or per-source governance exists; the only fetcher is the user-directed single-URL importer. | Keep R14 contract-only (D-084–D-091, ADR 0008) until R13 lands; no source activates without an accepted terms review; build registry enforcement before any ingestion. |
| Approval queue deferred | No packet, rule, mandatory-stop, or queue-audit primitive exists, and packet-grade quality evidence (R8 evals, R13 reviewer) does not yet exist to justify prepared-application volume. | Keep R15 contract-only (D-092–D-099, ADR 0009) until R14 lands and quality evidence is accepted; the submission boundary stays structural — no submission code path in R15. |
| Trusted autopilot deferred | No submission integration, authorization primitive, idempotency key, or incident rehearsal exists, and R15's quality/demand evidence is itself deferred; submission is an irreversible outward act on third-party infrastructure. | Keep R16 contract-only (D-100–D-107, ADR 0010); the four-gate conjunction (source terms, user authorization, resolved packet, safety envelope) is the activation condition, and D-026 prohibitions are permanent. |
| Development loop deferred | No gap-classification, development-item, or recommendation primitive exists, and the campaign/reviewer evidence the loop consumes is itself deferred; gap records are highly sensitive. | Keep R17 contract-only (D-108–D-114) until campaign evidence is accepted; evidence entry stays exclusively through the R11 confirmation door. |
| Backend `failure_category` is not allowlisted (found during R6 #104) | The backend tool-run stdout log emits `failure_category=exc.__class__.__name__` (an unbounded Python exception class name), which collides in name with the frontend telemetry `failure_category` enum but carries high-cardinality values the D-037 allowlist forbids. R6 #104 resolves this only for the durable `analytics_events` table: the shared write seam records the allowlisted `tool_request_failed` category and the exact class name stays in stdout/Sentry. | The stdout log field is unchanged and out of R6's scope; if a later slice wants class-level failure granularity in the analytics table, add allowlisted categories deliberately rather than persisting raw class names. |

### Resolved or Catalogued in Threat Model

| Risk | Resolution |
|---|---|
| Privacy retention unspecified | Resolved 2026-07-07 by D-031 through D-035 in `docs/decisions.md`; issue #74 closed. |
| Browser storage contains workflow content | Now documented in `docs/threat-model.md` §5 with full inventory and classification; addressed by issue #77. |
| In-process cache | Now documented in `docs/threat-model.md` §13 gap #2 and §8.3; addressed by issue #76. |
| Design contract conflict | Resolved 2026-07-07: the shipped dark-to-light gradient tool heroes are the accepted direction; `design.md` updated to match. |

## Product Audit Work Remaining

- staging health, telemetry, error scrubbing, OAuth, email, and rollback checks;
- current production/staging database revision and backup posture.

R5 now has a staging and launch runbook in `docs/launch-checklist.md` covering
preflight inventory, environment checks, migration rehearsal, smoke coverage,
rollback rehearsal, incident contacts, and evidence logging. Execution remains
blocked by the R3 production decisions and staging facts listed above.

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
