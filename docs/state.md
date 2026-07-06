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

**Status: R2 recovery verified; R3 implementation slices advancing; deployment evidence remains**

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
`docs/threat-model.md` §7.5. The same review must accept forced cross-site logout
as low-impact or authorize an Origin/CSRF mitigation. New password-reset links now
carry tokens in URL fragments and scrub them after hydration; legacy query links
remain compatible during rollout.

R3 #76 uses shared limiter storage outside development, HMAC-pseudonymized
account and source-IP identities, shared model-cost and resource-import ceilings,
account-scoped registration/reset counters, and expiring progressive login delay
without hard account lockout. Health probes remain unlimited. Production must
provide and capacity-test `RATE_LIMIT_STORAGE_URI`; route-specific CAPTCHA work is
triggered only by the accepted aggregate event threshold or provider cost alerts.

R3 #78 now rejects unknown or content-bearing telemetry fields and removes raw
frontend error messages plus stable run/workspace identifiers. Frontend/backend
Sentry hooks drop request content, credentials, query strings, breadcrumb bodies,
and entire user contexts. Model, import, email, and OAuth failure logs emit generic
categories rather than content, emails, full URLs, or provider exception text.
Sentry enablement, processor behavior, deletion-audit retention, and all bounded
retention periods still depend on production evidence and #74.

R3 #77 now centralizes sensitive tab-data cleanup for drafts, workflow context,
guest results, and resume carry. Explicit logout clears it even if the server
request fails; account deletion and the manual reset use the same operation.
Persisted guest results are removed by prefix after reload, while consent,
onboarding, and non-sensitive UI state remain intact. Retention-dependent closure
still follows #74.

R3 #81 now has a locally verified frontend-response implementation: SSR and static
responses receive a deployment-compatible CSP and baseline browser security
headers, HSTS requires an explicit deployment switch plus HTTPS forwarding, and
COEP/includeSubDomains/preload remain deliberately disabled pending compatibility
and domain evidence. Both runtime images now drop root privileges; Docker build
verification remains outstanding because the local Docker engine is unavailable.
Production Railway origins, TLS forwarding, OAuth, Sentry, downloads, and font
behavior still require staging verification before #81 can close.

Remaining R3 slices are dependency-ordered. #74 (retention/deletion) requires human
decisions D-UNK-6 and D-UNK-7; #77 and #78 depend on that decision. #76 depends on
the remaining #75 production evidence but can proceed against its merged code
posture. #81 (deployment headers) and #82 (legal reconciliation) remain partially
blocked by production unknowns and prior slices.

PR #83 remains draft and must not merge under its current specification.

## Risks and Drift to Resolve

| Risk | Why it matters | Next action |
|---|---|---|
| Documentation drift | Old roadmap, frontend overhaul plan, `design.md`, and source code disagree in places. | Use canonical docs going forward; verify disputed behavior against code/UI. `docs/threat-model.md` now anchors security claims to code. |
| Mixed local worktree | Product edits can accidentally include active thesis/generated files. | Stage explicit product paths only and verify every commit. |
| Release environment unverified | Railway topology, variables, migrations, domain, and deploy branch may have changed. | Run deployment inventory and staging smoke test. See `docs/threat-model.md` §14 D-UNK-1 through D-UNK-10. |
| Design contract conflict | `design.md` says light heroes while older context describes dark tool heroes. | Visually audit current product and accept one direction. |
| Monetization deferred | Historical ad-gate code must not be mistaken for a current release requirement. | Keep gates disabled and revisit only after product-quality work. |

### Resolved or Catalogued in Threat Model

| Risk | Resolution |
|---|---|
| Privacy retention unspecified | Now captured as `docs/threat-model.md` §14 D-UNK-6; owned by issue #74. |
| Browser storage contains workflow content | Now documented in `docs/threat-model.md` §5 with full inventory and classification; addressed by issue #77. |
| In-process cache | Now documented in `docs/threat-model.md` §13 gap #2 and §8.3; addressed by issue #76. |

## Product Audit Work Remaining

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
