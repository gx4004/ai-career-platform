# Career Workbench — Architecture

**Status:** canonical baseline
**Last reviewed:** 2026-09-30 (Sept 2026 reset: local-only, feature-first; see `roadmap.md`)

## System Context

```text
Browser
  │
  ├── React 19 + TanStack Start frontend
  │     ├── TanStack Router / Query
  │     ├── transient guest and workflow context
  │     └── Zod response validation
  │
  └── /api/v1
        └── FastAPI backend
              ├── auth, tools, history, files, admin
              ├── shared tool execution pipeline
              ├── SQLAlchemy + Alembic
              ├── PostgreSQL in production
              ├── LLM provider (`LLM_PROVIDER`: Vertex AI / Gemini by default)
              └── structured stdout logs and telemetry
```

The product currently runs locally only (Sept 2026 reset). A Railway topology (frontend,
backend, PostgreSQL) remains the eventual target; hosted-launch hardening and
deployment evidence are deferred and must be redone before any public launch.

## Frontend Boundaries

- `routes/` defines URL structure and route loading.
- `pages/` assembles page-level experiences.
- `components/` owns reusable presentation and domain UI.
- `lib/tools/registry.ts` is the canonical tool catalog and ordering.
- `lib/api/client.ts` owns transport; `lib/api/schemas.ts` validates contracts.
- `lib/auth/` owns session state and authentication flows.
- `lib/tools/` owns drafts, workflow context, guest results, exports, and result views.
- `styles/` is a plain-CSS system; do not introduce a parallel styling architecture
  casually.

The UI is a hybrid shell: dark navigation with light content. Tool-specific identity
is allowed inside the shared system. `design.md` owns the current visual contract;
where old screenshots or redesign plans disagree, current code plus an explicit
design decision wins.

## Backend Boundaries

- Routers parse/authorize requests and delegate behavior.
- Pydantic schemas are the API contract.
- Services own business logic and integrations.
- Models own persistence shape and relationships.
- Prompts are tool-specific and remain separate from routing.
- All six main tools enter through `run_tool_pipeline()`.

Routers should remain thin. Model calls, scoring, scraping, caching, and persistence
do not belong directly in endpoint functions.

## Main Tool Flow

```text
request
  -> authenticate optionally
  -> validate Pydantic input
  -> sanitize user-controlled text
  -> compute user-scoped cache key
  -> return cached result OR call tool service
  -> persist only when authenticated
  -> build common response envelope
  -> validate with frontend Zod schema
  -> render tool-specific result
```

`run_tool_pipeline()` currently coordinates sanitization, cache, service invocation,
authenticated persistence, observability, and response construction.

## Identity and Access

- Access and refresh JWTs are stored in HttpOnly cookies.
- Missing, expired, malformed, or revoked optional auth may downgrade a tool request
  to guest mode.
- Protected history/admin operations require authenticated ownership/authorization.
- Google OAuth uses the backend session middleware during the redirect flow.
- SameSite cookie behavior and CORS configuration form part of the security boundary.

Any auth change requires backend tests, frontend session tests, cookie review, CORS
review, and an explicit decision if the trust model changes.

Logout rejects an explicit browser `Origin` unless it matches `CORS_ORIGINS` or
`FRONTEND_URL`; non-browser clients without `Origin` remain compatible. This
targeted guard prevents forced cross-site logout without changing the accepted
SameSite=Lax cookie posture or adding a token protocol.

Password-reset emails place the bearer token in the URL fragment. The reset page
reads it only after hydration and immediately removes it from the visible URL with
`history.replaceState`; fragments are not sent to the frontend server or in HTTP
Referer headers. Legacy query-token links remain accepted and scrubbed for rollout
compatibility.

## Persistence Model

Core entities:

- `User` — identity, authorization, and account lifecycle.
- `Workspace` — groups related application/career work.
- `ToolRun` — immutable result snapshot with tool, inputs/metadata, output, ownership,
  optional workspace, and optional parent revision.
- `EvidenceItem` (D-061, ADR 0005) - per-user typed evidence with provenance and
  confirmation state. Authenticated CRUD, reviewed import, export/erasure, the
  profile UI and shared-pipeline injection are always on.
- CV document (D-069, ADR 0006) - per-user structured document whose claims
  reference Evidence Profile items, with one working draft plus immutable
  recoverable variants. Import proposals are transient; only explicit acceptance
  atomically creates the document and imported/unconfirmed profile items.
- Application (ADR 0007, ADR 0009) - the `Workspace` row once it has a status or
  a job posting. Optional application columns (company, role, status, deadline,
  selected CV variant / cover letter / interview run, prepared-drafts run, open
  questions, answers, notes, applied time) plus owner-scoped dependent tables:
  `campaign_listings` (current and prior listing revisions), `campaign_events`
  (append-only timeline), `campaign_tasks`, and `application_snapshots` (one
  immutable by-value record written when marked applied). Owner-level rows:
  `application_preferences` (prepare-for-me keywords/locations/remote/max per run)
  and `application_details` (contact details and typed standing answers).
- Discovered listings store (D-087, ADR 0008) - product-owned listings with source
  attribution, retrieval date, dedup and per-source retention, fed from the
  `discovery_sources` registry (Greenhouse, Lever and Ashby public job-board APIs
  through the recurring scheduler or the `ingest_ats_sources` CLI). Distinct from
  an application's canonical listing. Owner-scoped personalization rows (hidden
  sources, dismissals, corrections, reports) live beside it.
- Classified gap and development item (D-108 to D-114) - deterministic
  reviewer-gap records and bounded tracked responses, owner-scoped. Completion
  feeds the Evidence Profile unconfirmed-proposal path (confirmed only when the
  owner supplied the text).

The R13 contacts/reminders, R15 packet/queue and R16 submission tables described in
earlier revisions of this document no longer exist (D-127, D-128, D-130); the
current schema is defined by the models in `backend/app/models/` and the Alembic head.

Persistence invariants:

- a user accesses only owned workspaces and runs;
- guest results do not create `ToolRun` rows;
- regeneration appends a new `ToolRun`;
- deletion behavior follows foreign-key cascade policy and must be migration-tested;
- schema changes ship through Alembic.

## Context and Caching

- Authenticated history is server-backed.
- Guest results are transient browser state and may use `sessionStorage`.
- Workflow carry is tab-scoped; there is no cross-tab synchronization.
- Cached tool results are scoped by user ID or the shared guest scope.
- Cache is in-process in V1; multi-instance deployment requires measuring hit-rate and
  duplicate-cost impact before adopting Redis.
- Result caching is fail-open acceleration only (D-054, ADR 0004). A cache miss or
  backend failure executes the tool normally; cache state never owns authorization,
  persistence, regeneration, or coordination semantics.
- Cached values contain sensitive generated career content and therefore require the
  same storage/lifecycle assessment as `ToolRun.result_payload` before a distributed
  backend is adopted.

Resume/workflow state in browser storage is sensitive. Store the minimum necessary,
keep it tab-scoped, and expose a clear local-data reset. Explicit logout, successful
account deletion, and that reset all clear drafts, workflow context, guest results,
and resume carry while preserving consent, onboarding, and non-sensitive UI state.

## External Integrations

- An LLM provider chosen by `LLM_PROVIDER`: `vertex` (default, Gemini), `google`
  (API key), `anthropic`, or `fake` (deterministic local fixtures; boot refuses it
  outside development). One provider per deployment, no fallback.
- BeautifulSoup with Playwright fallback for supported job imports.
- Resend for password-reset email.
- Google OAuth for sign-in.
- Public Greenhouse, Lever and Ashby job-board APIs (unauthenticated GET only,
  through the SSRF-safe fetcher) for discovery listings.
- Railway for intended hosting and database.

There is no Sentry, CAPTCHA, analytics or advertising integration in the code (D-129).

Each integration must fail with an actionable product state. Optional integrations
must not make unrelated core flows unavailable.

## Feature Switches

The R11-R17 outcome flags were removed (#351, D-131): every product area is always
on. Only the Autopilot experiment (`AUTOPILOT_EXPERIMENT_ENABLED`; the backend
refuses to boot with it outside development) and recurring ATS ingestion
(`ATS_INGESTION_ENABLED`) keep default-off switches.
Tools use confirmed Evidence Profile facts through the shared pipeline by default.

Results are fully visible: there is no ad gate and no result-access seam in the code.
Any future monetized access must be decided server-side (D-048, ADR 0003) and may not
reuse a client-only gate.

Provider fallback is not active: exactly one provider is configured per deployment
and requests are never hedged across providers (D-055).

## Frontend Response Security

The production frontend server, not the API, owns browser document and static-asset
security headers. It emits a CSP derived from the configured API origin, denies framing and object embedding, and restricts fonts to the
bundled files plus the Google Fonts hosts currently referenced by the root route.
The policy retains inline script/style compatibility because the SSR wrapper and
current UI emit inline content.

COOP is `same-origin` and CORP is `same-origin`. COEP is intentionally omitted:
the product does not require cross-origin isolation, and enabling it would require
separate compatibility evidence for Google Fonts, downloads, and OAuth.
HSTS is emitted only when `SECURITY_HSTS_ENABLED=true` and Railway reports an
HTTPS-forwarded request. The switch remains off until production domain ownership
and end-to-end TLS are verified. It does not claim `includeSubDomains` or preload
until the full subdomain inventory is also verified.

## Observability

Tool execution emits structured stdout log lines for start, completion, duration and
categorized failures. Logs and telemetry must not include raw resumes, job
descriptions, generated content, cookies, auth headers, tokens, email/IP addresses,
full imported URLs, raw provider exceptions, stable run/workspace identifiers, or
frontend error messages. Frontend telemetry is an extra-forbidden allowlist with no
route or stable run/workspace fields and only explicit low-cardinality dimensions;
it is consent-gated in the browser and the backend only writes it to stdout
(`POST /api/v1/telemetry/events`, nothing persisted). No third-party monitoring
service receives any of it (D-129).

Mutating HTTP requests are bounded at the ASGI receive seam before framework
parsing: JSON bodies may not exceed 1 MiB, multipart transport may not exceed
11,010,048 bytes, and no body may exceed 4,096 receive chunks. Upload parsing then
applies the stricter 10 MB document and archive/content checks.

Operational questions should be answerable from logs without reconstructing
sensitive content. The R8 eval harness and the R10 scaling scorecard were removed
(D-125) and there is no `analytics_events` table.

## Scaling Posture

Local-only for now. There is a single process and an in-process result cache; no
scaling response is authorized. The R10 trigger scorecard was removed (D-125); if the
product is ever hosted for many users, shared limiter storage, proxy-aware limiter
keys and cache coordination must be designed then, with evidence. Job-import
adapters require terms review, a source-specific kill switch, and the existing paste
fallback (D-059).

## Evidence Profile Boundaries (R11)

- The Evidence Profile is a persisted, authenticated-only, user-scoped store; guest
  flows keep tab-scoped carry and inline inputs, and no anonymous profile rows exist
  (D-061, D-064).
- Confirmation is user-only: imports, tool outputs, and model inference write items
  as `unconfirmed` with provenance; no automated path may confirm (D-062).
- Tools consume the profile only through `run_tool_pipeline()`: confirmed evidence
  becomes locked prompt facts that generation may reframe but never alter or extend;
  unconfirmed evidence appears at most as an explicit gap or suggestion; the profile
  version joins the result cache key (D-063).
- Profile data joins the user-initiated immediate deletion contract and the account
  deletion cascade, and gains a self-serve machine-readable export (D-065, D-031).
- Historical `ToolRun` snapshots stay immutable; profile edits never rewrite past
  results and past runs never silently backfill the profile (D-066).
- Evidence content is sensitive career content: analytics and telemetry record only
  allowlisted low-cardinality profile events, never evidence text or stable content
  identifiers (D-067).

## CV Studio Boundaries (R12)

- The CV document is its own persisted structured entity; it is never stored as
  `ToolRun` payloads or freeform rich text, and its claims reference Evidence
  Profile items (D-069, ADR 0006).
- Import extends the existing isolated parser harness (subprocess, resource caps,
  upload guards) into reviewed structured proposals; imported claims reach the
  profile only via the R11 unconfirmed-proposal path (D-070).
- The studio is a structured-section editor session surface with a seventh registry
  entry; existing tool priorities are not renumbered and the six tools never depend
  on CV documents (D-071).
- ATS compatibility is a set of deterministic pass/fail structural checks with fix
  hints, and there is no CV quality score or universal ATS score or outcome promise
  (D-126, superseding D-072).
- Tailoring writes only diff-reviewed changes with requirement/evidence provenance;
  unsupported claims need an explicit user confirmation step (D-073).
- Preview, DOCX, and PDF render deterministically from one document plus one of
  one of five declarative templates (ATS Essential, Professional Editorial,
  Technical Portfolio, Modern Two-Column, Minimal Serif), gated by visual, text-layer, link, page-break, and
  own-parser re-import validation (D-074).
  `cv-render/v1` is the normalized source for all three targets. Its canonical hash
  covers normalized visible content, ordering, page geometry, and template tokens.
  ReportLab invariant mode makes PDF byte-stable; DOCX core dates, ZIP member order,
  timestamps, compression, and permissions are normalized for byte stability with
  the pinned runtime dependency set. Cross-runtime compatibility is defined as
  canonical render-hash equality plus equivalent own-parser section-entry content,
  because different office/PDF engines may serialize equivalent packages differently.
  The ATS checks run against the PDF rendered from the saved style and report
  pass/fail with a fix hint; they never produce a score (D-126).
  Browser preview embeds that same authenticated PDF artifact rather than
  reimplementing template layout in CSS, so multi-page boundaries and links are
  identical to the downloaded PDF. Automated PDF snapshots compare text-block
  coordinates at 0.1-point tolerance and fixed-DPI rendered pixel hashes. DOCX
  package semantics plus mandatory LibreOffice/Poppler pagination inspection in
  the local release gate cover the editable artifact.
- Model-backed studio calls run through the shared pipeline with bounded
  per-document regeneration quotas; CV content joins the sensitive-content
  lifecycle and allowlisted-telemetry boundaries (D-075).
- One owner-scoped `career-data-export/v1` export now carries both Evidence Profile items and
  complete CV documents/immutable variants under a mirrored Pydantic/Zod contract.
  Individual and bulk CV erasure are immediate; account erasure counts documents and
  variants separately in its existing transactional audit. Studio telemetry carries
  closed event names only and no content, titles, or stable document/run identifiers.

## Application and Reviewer Boundaries (R13, amended by ADR 0009)

- Applications are the `Workspace` entity evolved additively; existing workspaces
  stay valid, and the implicit creation path keeps working (D-077, ADR 0007).
  Status is server-enforced as one of `saved, applied, interviewing, offer,
  rejected, withdrawn`; any move is allowed, a move to `applied` goes through
  mark-applied, and moving back to `saved` after applying is refused. "Ready to
  apply" is derived, never stored (D-130). Status and deadline changes atomically
  append campaign events; product code exposes no event update or delete path.
- Each application has at most one authoritative current listing with title,
  company, bounded description, optional source URL and a server-owned UTC
  retrieval time. URL attachment reuses the SSRF-resistant pinned fetcher; paste
  attachment accepts no URL or source-family field. Re-attachment atomically
  advances `Workspace.current_listing_id` to a new immutable revision. Listing
  content is owner-isolated, exported and cascade-deleted; telemetry stays
  source-family/outcome only (D-078, D-059, D-079).
- Material links reference immutable versions: `selected_cv_variant_id` targets a
  `CvVariant`, cover-letter and interview ids target exact `ToolRun` revisions
  validated against their tool names; nullable foreign keys use `ON DELETE SET
  NULL`.
- Preparing runs the drafts service through `run_tool_pipeline()` from CV text and
  confirmed evidence only. Mandatory-stop fields (D-095) are classified by one
  server-side `stop_classifier` and become open questions only the owner's answer
  resolves. "Prepare for me" is bounded to ten applications per click and to the
  owner's saved preferences (D-127).
- Marking applied writes exactly one `application_snapshots` row: canonical JSON
  of what was sent plus its SHA-256. It has no update path; later edits never
  change it (D-079, ADR 0009). Nothing in the product submits an application.
- Tracking is bounded to the job-search domain: tasks with optional deadlines and
  one notes field. No contacts, no reminders, no third-party personal data (D-130).
- The reviewer is a separate advisory pass through the shared pipeline; it
  implements the D-043 fabrication tracer against confirmed evidence and never
  auto-applies findings or creates/confirms evidence (D-082).
- Application content is owner-isolated sensitive content in the standard
  lifecycle: immediate deletion, account-deletion cascade, `career-data-export/v1`
  and allowlisted telemetry (D-083).
- The former `/queue` route only redirects to Applications (#360).

## Discovery Boundaries (R14)

- The `discovery_sources` registry records owner, terms review status and date,
  allowed behavior, declared rate, attribution and retention rules, and a kill
  switch. One rule, `DiscoverySource.ingestion_allowed` (terms accepted and kill
  switch clear), is re-read immediately before every fetch, so a tripped kill switch
  stops the next fetch without a restart (D-084, D-085, ADR 0008). Sources start
  terms-pending with the kill switch on; the admin API registers them
  (`/admin/discovery-sources`).
- Ingestion (`ats_ingestion.py`) supports three employer-ATS adapters, Greenhouse,
  Lever and Ashby, each a public unauthenticated GET API. The provider is derived
  only from the source's own endpoint host, requests go through the SSRF-safe
  `fetch_public_resource`, and each source is fetched and committed in isolation.
  Triggers are the opt-in scheduler (`ATS_INGESTION_ENABLED`) and the
  `ingest_ats_sources` CLI. Discovery uses no credentials or session state (D-026, D-086). Whether each provider's terms permit use is an
  owner review item (#368) that must be settled before the registry entries are
  marked accepted.
- Discovered listings persist with attribution and retrieval date into product-owned
  canonical rows plus one-to-many source attributions, deduplicated by content hash.
  A daily background job expires each attribution under its source's retention rule
  and removes orphaned canonical rows. These tables have no workspace/user foreign
  key and remain separate from an application's canonical listing (D-087, D-078).
- Ranking uses confirmed Evidence Profile items and preferences via deterministic
  keyword overlap. Each request scores at most 500 candidate listings and returns at
  most 50 results, each with its matched keywords, owner evidence references and
  source attribution (D-088). The account-only surface exposes hide, correct and
  report controls.
- Outbound source queries carry only minimal registry-declared parameters; profile
  content never leaves the product (D-089).
- Listing dismissals are owner-isolated
  user data in the standard lifecycle and telemetry boundaries (D-090).
- Recommendations become applications only by explicit user adoption; discovery never
  auto-creates applications or tasks (D-091).

## Development Loop Boundaries (R17)

- Gaps classify into exactly four explainable kinds built on the reviewer's
  requirement and evidence traces (D-109, D-082).
- Each kind gets its only honest response; tailoring is never offered for
  substance gaps and no response fabricates (D-110, D-073).
- Recommendations are source-attributed with no undisclosed commercial
  relationships; sponsorship needs its own future decision (D-111).
- Development items are bounded tracking, not project management (D-112).
- Completion produces an `unconfirmed` R11 proposal; only explicit user
  confirmation creates reusable evidence (D-113, D-062).
- Development data (a record of the user's gaps) is owner-isolated sensitive
  content in the standard lifecycle and telemetry boundaries (D-114).
- The feature is always on locally (D-131). Lifecycle routes are authenticated and
  owner-scoped; there is no aggregate admin reporting view.

## Abuse Controls

Availability probing and abuse enforcement are separate: `/health` is unlimited,
while abuse-sensitive auth, model, upload, import, telemetry, export and admin routes
carry per-route SlowAPI limits (`backend/app/limiter.py`). Because the product is
local-only, the limiter uses in-process memory keyed by the immediate client
address. Proxy-aware keys, per-account pseudonymized counters and shared storage
were removed (#355) and must be redesigned before any hosted launch. There is no
CAPTCHA (D-129). Mutating requests are also bounded by the ASGI body-size limits
described under Observability.

## Contract Change Checklist

For an API request/response change:

1. Update backend Pydantic schema and service behavior.
2. Update frontend Zod schema and TypeScript consumers.
3. Update backend and frontend tests.
4. Consider old persisted `ToolRun.result` payloads.
5. Decide whether versioning or backward-compatible parsing is needed.

For a database change:

1. Add, do not rewrite, an Alembic migration.
2. Test upgrade from the current production revision.
3. Define downgrade/rollback posture.
4. Check data ownership and deletion behavior.
5. Update this document if the domain model or invariant changed.

## Release Shape

A release candidate should pass:

```bash
cd frontend && pnpm typecheck && pnpm test && pnpm build
cd backend && pytest
cd backend && alembic upgrade head
```

It also needs manual smoke coverage of guest, authenticated, connected workflow,
history, export, account, and admin authorization paths. The full local gate is `scripts/local-release.sh` (see `docs/handoff-2026-09-29.md`);
hosted CI is manual-dispatch only.
