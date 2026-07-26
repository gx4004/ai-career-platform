# Career Workbench — Current State

**Snapshot date:** 2026-07-11
**Confidence:** code-informed, release environment not re-verified

> **Checkpoint 2026-07-20.** The narrative below this banner is stale from R11
> onward and is being corrected separately. What is verified as of this date:
>
> - **Integration branch is `chapter2`** (D-027, `CONTEXT.md:276-279`). `main` and
>   `deploy` both sit at `6a00a612` (2026-04-29), **140 commits behind**. The
>   documented `chapter2 → main → deploy` promotion has never been run for any
>   R0–R15 work.
> - **All five open fix PRs were opened against `main` by mistake** and were
>   retargeted to `chapter2`. Merging one as-is would have promoted the entire
>   R11–R15 body into `main`, one step from Railway-watched `deploy`.
> - **Shipped this session:** #277/#276 (per-owner queue pause, cross-tenant
>   authorization fix), #283/#282 (CV import autosave 422), #279/#278
>   (hallucinated support no longer aborts the batch), #281/#280 (adoption dedup
>   + packet-prep race).
> - **Open:** #275 (cost cap over-applied to the free deterministic path —
>   finding on the PR), #284 (submission-boundary test), #285 (OpenAPI schema
>   generation broken: `/docs`, `/redoc`, `/openapi.json` all fail), #286 (#281
>   follow-up: governance bypass + missing backfill).

> **Checkpoint 2026-07-21.** Continues the 2026-07-20 entry above; the branch
> posture, backlog reality, and governance contradiction recorded there all still
> hold unchanged. Every PR below merged into `chapter2` with all three CI jobs
> green. `main` and `deploy` remain at `6a00a612` — still never promoted.
>
> - **All four items listed as open above are now closed.** #275 landed after the
>   over-application defect was fixed (#274 closed); #284 landed after being
>   redesigned to scan `app/routers/` rather than the assembled app; #285 and
>   #286 both shipped.
> - **Also shipped:** #290 (governance re-checked before the idempotent adoption
>   return, and the dedup migration's no-backfill rationale recorded), #291
>   (OpenAPI generation unbroken), #292 (telemetry and erasure-audit log seams
>   enforce their own allowlists), #293 (real-browser test that sensitive
>   `sessionStorage` is actually empty after sign-out, plus the per-key cross-tab
>   column in the storage inventory).
> - **`PATCH /admin/users/{user_id}/admin` shipped with no request body in its
>   schema.** FastAPI silently reclassified the body as a query parameter, which
>   also broke OpenAPI generation app-wide (#285). The endpoint had no test
>   coverage at all, which is why it went unnoticed.
> - **CI and local run different library versions (#288).** `requirements.txt`
>   uses `>=` bounds throughout; `fastapi>=0.115.0` resolves to **0.139.2** in CI
>   against **0.120.0** locally, and Starlette crosses a major version (0.48 →
>   1.3). FastAPI 0.139 stopped flattening included routers into `app.routes`,
>   which is why route-table inspection looked empty while routing worked. Root
>   cause is confirmed; **pinning is recommended and not yet done** — it changes
>   dependency resolution for the whole project and needs its own reviewed PR.
>   Until then, `app.routes` is unreliable for assertions, and any code iterating
>   it expecting `.path` is version-dependent.
> - **Still open, needing an owner decision:** #77's minimization requirement.
>   Four `sessionStorage` keys still hold full resume text, job descriptions, and
>   LLM output; each serves a shipped feature (drafts, resume carry, the D-011
>   tab-scoped workflow), so existing behaviour was preserved rather than guessed
>   at. #78 retains two partials: no runtime allowlist on the frontend telemetry
>   client (TypeScript-only, enforced server-side), and Sentry/log retention
>   documented rather than configured.
> - **Baseline:** backend 729 passed, ruff and typecheck clean, E2E green.
> - **R17 build-ahead posture:** #198–#202 are implemented under the current
>   task's explicit authorization despite the older
>   contract-only wording. This implementation work does **not** satisfy or
>   silently reverse D-108: production activation remains provisional until
>   recurring campaign/reviewer evidence is accepted.
> - **R16 build-ahead posture:** the current task also explicitly authorizes the
>   dark #189 source-governance and #190 owner/source authorization foundations.
>   This does **not** satisfy or reverse D-100: no real source is registered or
>   promoted, no source OAuth adapter or credential store exists, no submission
>   endpoint or integration exists, and production activation still requires
>   accepted R15 quality/demand evidence plus all four R16 gates. R10 triggers have
>   not fired.
> - **R15 prerequisite correction:** #185 had been deliberately reverted and left
>   open, even though #191 requires its approved immutable snapshot. The current
>   task authorizes restoring #185 as a separate prerequisite: guarded acceptance
>   freezes exact materials into a write-once hashed snapshot, prevents duplicate
>   role approvals, records the campaign timeline, and returns only a manual
>   HTTPS destination. Approval is pending-only, revalidates its required
>   discovered-listing and CV references, derives duplicate identity from the
>   packet target, and shares packet-first row locking with terminal queue actions
>   and erasure. The queue dereferences the exact materials for review before
>   enabling approval, and the handoff is pinned to the packet's preparation-time
>   source attribution. This does not satisfy D-092 or add a submission path.
>   R3/R9 need deployed-environment evidence or owner decisions. #51 and #208
>   need credentials/console access.
> - **Unresolved governance contradiction:** R11–R15 shipped with *unguarded*
>   user-facing navigation (`/profile`, `/queue`, `/discovery`, `cvStudioEntry`
>   in `registry.ts:229`) while gates D-060/D-068/D-076/D-084/D-092 still
>   require them dark. The build-ahead override covered one dark ticket each
>   (#144, #153), not five UI-activated cycles. Owner decision required; the
>   append-only decision log has deliberately not been rewritten.
> - **Baseline:** backend 717 passed, frontend 76 files / 396 tests, ruff and
>   typecheck clean. GitHub Actions failed to assign runners 2026-07-17→20 and
>   has since recovered.

## Current Posture

R12 #157 is implemented under the owner-authorized build-ahead exception: dormant
CV Studio tailoring produces signed, evidence-grounded review diffs and immutable
variants behind authenticated owner APIs. D-068 remains accepted/open; this does
not declare the R12 roadmap outcome shipped.

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
- The dormant client-only monetization UI (ad gate/unlock path) has been removed
  (R9 #127, D-051); results render fully and freely with no ad path in any mode.

## Immediate Objective

**Status: R6, R8, and the R9 cleanup frontier are complete (2026-07-11). R3
specification is complete (D-116–D-119, 2026-07-10); the R5 staging rehearsal
owns the R3 Evidence Checklist but deployment work is owner-deferred for now.
Remaining human items: perform the PostHog data deletion (#208, D-119), decide
D-NEXT-2 (launch market) and D-NEXT-6 (activation target), and select the R18
direction (#204).**

An explicit temporary owner build-ahead override (2026-07-12) authorizes R12 #153
ahead of D-068's activation gate without closing or superseding that gate. The
additive CV document/API foundation is built dark:
there is no navigation, editor, tool-registry entry, import, scoring, tailoring,
preview, or export-file activation. Existing six-tool behavior is unchanged. The
new owner-only store remains dormant until the R12 gate is explicitly promoted.
The same override now covers #154's authenticated import API: validated PDF, DOCX,
and UTF-8 text are structured inside the existing capped parser subprocess and
returned only as transient review proposals. Explicit acceptance atomically creates
a CV document plus imported, unconfirmed Evidence Profile items; an owner-scoped
opaque import id makes acceptance retries idempotent. There is still no frontend
activation. The override also covers #155's authenticated structured editor:
CV Studio is registered as a seventh editor surface without changing the six
single-shot tools, and supports typed-section editing, race-safe autosave, and
named snapshot restore over the owner-scoped #153 APIs. It remains an additive,
account-only build-ahead surface; no public landing promotion, scoring, tailoring,
preview, or file-export activation is implied. This does not close or supersede
D-068.

The override now also covers #158's owner-only preview/export pipeline: one
normalized render model drives three declarative templates and deterministic DOCX
and PDF artifacts, with generated-artifact text, link, page-boundary, and own-parser
validation. This remains dormant build-ahead work and does not close D-068.

The override also covers #159's lifecycle and cost closure: owner-scoped immediate
single/all-document deletion, explicit document/variant account-erasure audit counts,
an additive complete account-data export, durable visible scoring/tailoring quotas,
and closed-name studio telemetry. CV, job, evidence, generated text, titles, and
stable document/run identifiers remain outside analytics. This is still dormant
build-ahead and does not close D-068.

With R12 shipped, R13 #162 now evolves `Workspace` in place with optional company,
role, fixed-lifecycle status, and deadline fields. Legacy rows remain label-only
campaigns with all four fields null; implicit creation and run linking are unchanged.
The existing authenticated owner-only workspace API reads and updates these fields,
and `career-data-export/v1` plus account erasure include them. Status/deadline
changes already write minimal append-only events for later timeline continuity.
This additive foundation does not close the provisional R13 parent or ship listings,
the activity-timeline API/UI, the broader #165 event vocabulary, tasks, notes,
contacts, reminders, reviewer behavior, or frontend activation.

R13 #163 now persists one authoritative current canonical listing per campaign.
Authenticated URL attachment reuses the hardened job importer; authenticated paste
attachment validates and bounds listing content without accepting a source URL or
source-family override. Replacement creates an immutable revision, atomically moves
the current-listing reference, and appends a content-free campaign event. Current and
prior listings are owner-isolated, included in `career-data-export/v1`, and removed
with campaign or account deletion. No discovery/product listing store or R14 source
ingestion is introduced. The existing job-import card preserves populate-only
behavior by default and offers an explicit campaign picker for URL or pasted
attachment.

R13 #164 adds an authenticated owner-only campaign surface at
`/campaigns/:campaignId`. It presents the campaign facts and current canonical
listing beside exact selected-material references. CV selections point to immutable
`CvVariant` rows; cover-letter and interview selections point to exact immutable
`ToolRun` revisions. Owner and tool-type checks run before each change, while every
select or clear appends only a low-cardinality `material_selection_changed` event
(`material_type` and `action`) without material titles or content. The three nullable
references are additive, export with campaign data, and clear on referenced-material
deletion. Existing history behavior remains intact and now provides an explicit link
to the focused campaign view.

R13 #165 extends that owner-only surface with bounded job-search tracking:
tasks with optional deadlines, private notes, and contacts limited to name,
role, and channel. Every create, completion/reopen, and delete action appends a
content-free campaign event; the ordered timeline labels user versus system
provenance without copying note, contact, task, or company text into events or
telemetry. Records are owner-isolated, included in `career-data-export/v1`, and
deleted with their record, campaign, or account. This does not introduce a
generic CRM or close the provisional R13 parent.

R13 #166 adds strictly in-product deadline reminders behind explicit,
default-off consent on each campaign. Approaching application and incomplete-task
deadlines are derived on demand, surfaced at most once per hour, and never enter
a scheduler, email, or push path. Revocation clears the last-surface state
immediately, while campaign/account deletion removes it with the campaign. This
does not extend the password-reset-only transactional-email boundary or close R13.

R13 #167 captures one immutable canonical JSON bundle when a campaign enters
`applied`, copying the exact current listing, selected CV variant, and selected
cover-letter revision plus a SHA-256 digest. Source edits or deletion cannot
change the stored bytes. A content-free campaign event links the expandable
timeline view to each snapshot; snapshots export with campaign data and cascade
on campaign/account deletion. This does not close the provisional R13 parent.

R13 #168 adds a separate `application-reviewer` advisory run through the shared
tool pipeline. It reuses the single D-043 deterministic fabrication tracer
against confirmed Evidence Profile facts and selected source materials, then
adds locatable missed-requirement, contradiction, generic-language, repetition,
and document-defect findings. Synthetic trigger/near-miss fixtures cover every
category. Findings persist as immutable `ToolRun` output, are dismissible in the
current campaign view, and never edit materials or create/confirm evidence.

R14 #171 adds the discovery-source governance registry without activating any
source. Entries persist owner, closed-set source family and allowed behavior,
terms status plus reviewer/date, rate and retention bounds, attribution rule,
and a default-on kill switch. The single server enforcement seam refuses
unregistered, terms-unaccepted, or killed sources before ingestion; the admin
panel exposes registry state read-only. Registry telemetry contains only source
family and governance outcome classes, never source names or keys.
The migration is additive and seeds no registry entries, so older application
revisions ignore the table safely. Operational rollback is to keep all sources
killed or remove the read-only admin route; after any legal-review records exist,
schema downgrade is destructive and requires an explicit backup/restore decision,
so production incidents should be forward-fixed instead.

R14 #172 adds a dark licensed API/feed fetch adapter but registers or activates no
real source. Registry fetch policy now declares one HTTPS endpoint, a closed subset
of seven minimal query keys, and whether robots checks apply. The adapter reuses
DNS-pinned public-target validation, sends an identifying user agent, rejects
redirects/content-type/size violations, atomically claims the per-source database
rate window, rechecks the kill switch immediately before the source request, and
emits only source-family/outcome telemetry. Synthetic HTTP transports assert every
boundary without third-party traffic. The additive nullable policy columns leave
older dark registry rows safe-but-ineligible; rollback is kill-switching/removing
the adapter, while schema downgrade discards policy/rate state and is forward-fix
only after use.

R14 #173 adds a product-owned discovered-listings store that is structurally
separate from owner campaign listings. Canonical title/company/description rows
deduplicate through a normalized SHA-256 fingerprint while one-to-many attribution
rows preserve every governed source key, canonicalized source URL, and retrieval
date. A daily expiry job evaluates each attribution against its source's current
retention rule, deletes expired provenance, and removes a canonical listing only
after its final attribution expires. Synthetic duplicate and near-miss fixtures
cover the boundary. The migration is additive; rollback can stop the scheduler,
while schema downgrade destroys the product listing corpus and requires backup or
a forward fix after ingestion begins.

R14 #174 adds an authenticated recommendation read path and account-only discovery
surface. It ranks each live canonical listing once with deterministic keyword
overlap against confirmed Evidence Profile facts and confirmed preference items;
unconfirmed and rejected items never contribute. Every result carries the two
component scores, matched keywords, owner evidence-item references, source links,
and retrieval dates that produced its position. Retention is re-evaluated on every
read so scheduler lag cannot expose an expired listing. No profile content leaves
the product, no recommendation state persists yet, and the existing six tools are
unchanged. Hide, dismiss, preference correction, and error reports remain #175;
campaign adoption remains #176.

## Session Handoff Snapshot (2026-07-11)

- **Objective:** Ship the startable activation/quality/cleanup frontier — R6
  Activation Instrumentation (#104–#108), R8 Output Quality Program (#119–#124),
  and the R9 dormant-ad-gate cleanup (#127) — each via the ticket-runner flow,
  merged into `chapter2`.
- **Changed:** All 12 tickets merged and closed. R6 shipped the durable
  `analytics_events` store + shared write seam (#104), the three previously-dead
  activation events incl. `landing_page_viewed` (#105), per-tool latency + LLM
  cost estimate (#106), a 180-day prune with a daily lifespan task (#107), and
  the admin funnel/failure/cost dashboard (#108). R8 shipped the synthetic
  fixture corpus (#119), calibration (#120), fabrication (#121), and usefulness
  (#122) checks, the on-demand CLI eval runner writing versioned JSON reports
  (#123), and the admin Eval Runs section (#124). R9 #127 removed the dormant
  client ad gate/unlock path, its telemetry names/`unlock_method` column, and
  reconciled the legal/threat-model/spec copy to candidate-neutral (D-051), with
  the historical PostHog incident kept explicitly unresolved. Parent specs
  #103/#118/#126 left open.
- **Verified:** Every PR passed all three CI checks (Backend ruff+pytest,
  Frontend typecheck+test+build, E2E Playwright/PostgreSQL) before a squash
  merge; the analytics and ad-gate-removal migrations ran `alembic upgrade head`
  against real PostgreSQL. No E2E flake reruns were needed.
- **Blocked:** R7 (#110–#115, needs the two-week R6 activation baseline +
  D-NEXT-6), R9 candidate work (#128+), R10 (#136–#142), and everything R11+ are
  gate-blocked per their PROVISIONAL banners and were not started. The R5 staging
  rehearsal and every R3 Evidence-Checklist item needing a deployed environment
  are owner-deferred (Railway/production access).
- **Next:** Owner runs the R6 admin activation dashboard for ~two weeks to
  produce the baseline that unblocks R7 and informs D-NEXT-6; separately perform
  the PostHog #208 deletion and decide D-NEXT-2 / the R18 direction (#204).

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
| Legal/consent copy pre-committed to Google AdSense (reconciled R9 #127) | The Cookie Policy, Privacy Policy, and cookie-consent banner named Google AdSense as the future ad vendor and the banner claimed "advertising cookies (Google AdSense) only load if you accept" — contradicting accepted D-046 (R9 candidate-neutral, no ad/subscription/hybrid selected) and D-051 (the client ad path was removed, so nothing loads on accept). | Resolved during R9 #127: copy is now candidate-neutral — no advertising is served, no ad code exists, and any future advertising would require a separate decision and affirmative, purpose-specific consent. The specific AdSense sub-processor/vendor commitment is removed until a candidate is actually selected under D-047. |
| Mixed local worktree | Product edits can accidentally include active thesis/generated files. | Stage explicit product paths only and verify every commit. |
| Release environment unverified | Railway topology, variables, migrations, domain, and deploy branch may have changed. | Run deployment inventory and staging smoke test. See `docs/threat-model.md` §14 D-UNK-1 through D-UNK-10. |
| Monetization deferred | R9 has no activation baseline, accepted target, launch market, or selected candidate. The dormant client ad/unlock path (`AdGatedLock`/`useAd`/`useAdUnlock`/`AdCountdownTimer`, the `ad-unlocked` key, and ad/countdown telemetry) has been removed (R9 #127, D-051); results render directly with no vendor script for any consent state. | Keep R9 candidate-neutral and dark until the D-046/D-047 evidence gate closes; any future access decision must be server-authoritative (D-048), never a client gate. |
| Scaling responses deferred | The intended deployment currently starts one Uvicorn process, and no accepted evidence shows sustained cache, provider, latency, abuse/cost, database, or job-import pressure. | Implement the R10 aggregate trigger scorecard first; authorize only the independent response whose scaling trigger fires (D-052–D-059). |
| Evidence Profile deferred | No persisted profile entity, provenance/confirmation primitive, or full-data export exists; resume text is ephemeral tab-scoped state re-supplied inline per run, and R12/R13 depend on the profile's shape. | Keep R11 contract-only (D-060–D-067, ADR 0005) until the R1–R4 gate closes; implement the profile entity, confirmation lifecycle, and export slices first. |
| CV Studio deferred | Every studio layer is greenfield: parsing is text-only, no structured CV model, DOCX generation, template system, print/page-break handling, variant versioning, or editor surface exists, and per-route rate limits do not bound iterative editing loops. | Keep R12 contract-only (D-068–D-075, ADR 0006) until R11 lands; implement document entity and reviewed import first, exporters behind validation gates. |
| R12 #154 built dark ahead of D-068 under owner override | The authenticated import API accepts PDF, DOCX, and UTF-8 text, produces a transient structured review proposal in the isolated parser worker, and persists only on explicit, idempotent accept. Imported claims remain `unconfirmed` with `imported` provenance; accepting an import may therefore create document entries that reference pending imported items, while the ordinary #153 create/update APIs continue requiring confirmed owner evidence. | Keep the API without frontend activation. Do not treat import review as Evidence Profile confirmation or D-068 as closed; later editor work must expose the separate confirmation lifecycle. |
| Campaigns and reviewer incomplete | Workspaces now carry optional company, role, fixed-lifecycle status, deadline, and one owner-isolated canonical listing under export and erasure. Status/deadline/listing mutations create minimal append-only events, but no task/note/contact/reminder/reviewer infrastructure exists; contacts will be the first third-party personal data. | Keep the parent R13 outcome provisional. Extend append-only tracking and add the reviewer in ticket order; do not activate later-roadmap behavior early. |
| R14 registry built dark under owner build-ahead | Source governance and refusal enforcement now exist, but no source entry, ingestion adapter, robots handling, listings store, dedup, ranking surface, or user recommendation path is active; the only live fetcher remains the user-directed single-URL importer. | Keep every source absent, pending, or kill-switched until its accepted terms review; #172 must call the registry enforcement seam before any network or ingest work. |
| R15 implementation built ahead of activation evidence | Rules, bounded preparation, mandatory stops, reviewer/regression gates, review controls, append-only audit, and #185 immutable approvals now exist. Approval atomically freezes exact materials, prevents duplicate packet/role approvals, links the campaign timeline, and returns only a safe manual handoff. The code is not accepted packet-grade quality or permission to activate the outcome. | Keep production activation behind D-092 and preserve the structural boundary: no submission endpoint, scheduling, retries, or outward act in R15. Resolve the existing ungated-navigation contradiction separately rather than treating build completion as gate closure. |
| R16 source/user/engine/stop/envelope gates built ahead of activation evidence | #189–#192 provide dark source governance, credential-free grants, the idempotent engine, and safe terminal handoff. #193 adds the authoritative fourth checkpoint: default-on global kill, strict per-source user/source minute and 24-hour limits, content-free anomaly stops, the existing owner pause, reachable global/source operator controls, owner-visible usage/reasons, and a documented rehearsal/rollback procedure. Ambiguous post-act outcomes retain their frozen idempotent claim and never invite a duplicate manual submission. Only local fixture adapters exist. No public submission route, source OAuth, real adapter/source, scheduler, or outward-act endpoint exists. | Keep the R16 outcome and production activation behind D-100. Every deployed environment remains globally killed until its own incident rehearsal is recorded; do not register/promote a real source without accepted legal review or add an OAuth callback/adapter before its security design is approved. #195 owns breakage thresholds and automatic source-kill actuation; preserve exact grant rechecks, packet integrity, and all D-026 prohibitions. |
| R17 implementation built ahead of its activation evidence | Gap classifications, honest response offers, bounded development items, completion-to-evidence, lifecycle export/erasure, and aggregate-only telemetry now exist under an explicit current-task continuation. The code is not evidence that recurring campaign gaps exist, and gap records remain highly sensitive. | Keep the R17 outcome provisional and production activation behind D-108 until campaign evidence is accepted; preserve owner isolation, content-free telemetry, and the single R11 confirmation door. |
| Backend `failure_category` is not allowlisted (found during R6 #104) | The backend tool-run stdout log emits `failure_category=exc.__class__.__name__` (an unbounded Python exception class name), which collides in name with the frontend telemetry `failure_category` enum but carries high-cardinality values the D-037 allowlist forbids. R6 #104 resolves this only for the durable `analytics_events` table: the shared write seam records the allowlisted `tool_request_failed` category and the exact class name stays in stdout/Sentry. | The stdout log field is unchanged and out of R6's scope; if a later slice wants class-level failure granularity in the analytics table, add allowlisted categories deliberately rather than persisting raw class names. |
| Issue #106 body was stale re: duration (found during R6 #106) | The #106 body says duration is "already computed transiently today ... extend that same call site to also carry it into the durable store," but #104 already wired `duration_ms` into `tool_run_completed`/`tool_run_failed` via the shared seam. #106 was therefore cost-only in practice: it adds the LLM `cost_estimate` (from actual provider token usage) alongside the already-persisted duration. No product/data/scope impact — the durable columns already existed. | None required; noted so the #106 PR isn't misread as re-wiring duration. Cost estimate now populated per D-038 from `usage_metadata` token counts. |
| R7 #110–#115 built dark ahead of the R6 baseline (owner-authorized, thesis completion) | `docs/roadmap.md` and this file's Session Handoff list R7 (#110–#115) as blocked on the two-week R6 activation baseline before any candidate ships. Under explicit owner authorization for thesis completion, all six R7 candidates are now built **dark**, each default OFF behind its own `VITE_R7_*` getter in frontend `src/lib/flags/featureFlags.ts`, so the roadmap's "no candidate ships live until R6's baseline exists" gate is preserved — nothing changes for real users. This is a deliberate build-ahead, not a live activation, and does not close the R6 gate. | Do NOT enable any `VITE_R7_*` flag in a live environment until the R6 baseline confirms the drop-off it targets (PRD #109). |
| R7 #115 cannot identify unexported results from existing history data | The issue asks for recent results that are "unexported or unfavorited," but the executable `ToolRun`/history contract persists `is_favorite` and no per-result export state. `export_action_used` is aggregate telemetry, not owner-scoped history truth and cannot establish whether a specific result remains unexported. The dark-shipped banner therefore surfaces only recent results whose known `is_favorite` value is false. | Do not infer per-result export state from aggregate analytics or add persistence implicitly. A future export reminder requires an explicit product/data-lifecycle decision and additive owner-isolated model change. |
| R11 #144 built ahead of D-060 under owner override | The Evidence Profile entity/API foundation is built dark despite the provisional R1–R4 evidence gate: additive owner-scoped persistence, authenticated CRUD, and explicit confirmation/rejection exist, but no UI, import/export, pipeline injection, telemetry, or production activation ships in this slice. | Keep all later R11 surfaces and any production activation behind their existing gates and tickets; do not treat the build-ahead as closure of D-060 or parent #143. |
| `auth_signup_source` originating surface is carried at tool-context granularity (design choice during R6 #105) | D-040 wants signup attribution by originating *surface* (guest-save prompt, ad-unlock flow, direct registration). No dedicated low-cardinality `signup_source` dimension exists, and R6 #105 is scoped to carry no migration, so a new persisted column was out. The event instead carries the existing allowlisted `tool_id` (the tool a guest-save prompt was raised from, threaded through the pending intent); a direct registration carries no `tool_id`. Google OAuth never creates accounts (new OAuth users are redirected to the email form via `signup_via_email_required`), so every signup flows through the one email-form call site. This cleanly separates the two surfaces live today (there is no ad-unlock flow — the client ad path was removed in R9 #127, so ad-unlock signups do not occur). | If a future slice needs the full surface-type taxonomy persisted distinctly, add an allowlisted `signup_source` enum dimension and its additive `analytics_events` column via a deliberate migration — not free-text. |

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
