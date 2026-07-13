# Career Workbench — Architecture

**Status:** canonical baseline
**Last reviewed:** 2026-07-05

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
              ├── Vertex AI / Gemini
              └── Sentry + structured telemetry
```

Production is intended to run on Railway with frontend, backend, and PostgreSQL.
Deployment topology must be re-verified before public launch.

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
- `EvidenceItem` (R11 foundation built dark under explicit owner override; D-061,
  ADR 0005) — per-user typed evidence with provenance and confirmation state.
  Authenticated CRUD exists; profile injection, import/export, and UI activation
  remain unshipped and the D-060 production-activation gate remains closed.
- CV document (R12 foundation built dark under owner override; D-069, ADR 0006) —
  per-user structured document whose claims reference Evidence Profile items, with
  one working draft plus immutable recoverable variants. The authenticated import
  API is also dark: review proposals are transient and only explicit acceptance
  atomically creates the document and imported/unconfirmed profile items. Acceptance
  retries are owner-scoped and idempotent. D-068's activation gate remains closed.
- Application campaign (planned, R13; D-077, ADR 0007) — `Workspace` evolved in
  place with optional campaign fields and dependent owner-scoped tables (listing,
  events, tasks, notes, contacts). Contract defined; nothing ships until R12 lands
  (D-076).
- Discovered listings store (planned, R14; D-087, ADR 0008) — product-owned
  listings with source attribution, retrieval date, dedup, and per-source
  retention; distinct from campaign canonical listings. Contract defined; nothing
  ships until R13 lands and each source passes terms review (D-084).
- Application packet (planned, R15; D-093, ADR 0009) — a composition referencing
  campaign, listing, CV variant, drafts, rationale, and unresolved questions, with
  an immutable snapshot on approval. Contract defined; nothing ships until R14
  lands and quality evidence is accepted (D-092).
- Submission record (planned, R16; D-103, ADR 0010) — append-only audit of one
  idempotent per-source submission with the exact packet snapshot and per-field
  record. Contract defined; nothing ships until R15 demonstrates quality and
  demand and each source passes legal review (D-100).
- Development item (planned, R17; D-112) — one tracked response to a classified
  gap, with completion feeding the R11 proposal path only. Contract defined;
  nothing ships until campaign evidence supports the loop (D-108).

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

- Vertex AI / Gemini for model generation.
- BeautifulSoup with Playwright fallback for supported job imports.
- Resend for password-reset email.
- Google OAuth for sign-in.
- Sentry for scrubbed error monitoring.
- Railway for intended hosting and database.

Each integration must fail with an actionable product state. Optional integrations
must not make unrelated core flows unavailable.

Provider fallback is not active. It may be introduced only after sustained provider-
incident evidence and after the alternative passes R8 quality evaluation plus privacy,
processor, cost, latency, and tool-specific failure review (D-055). Requests are not
hedged across providers by default.

## Frontend Response Security

The production frontend server, not the API, owns browser document and static-asset
security headers. It emits a CSP derived from the configured API, Sentry, and
PostHog origins, denies framing and object embedding, and restricts fonts to the
bundled files plus the Google Fonts hosts currently referenced by the root route.
The policy retains inline script/style compatibility because the SSR wrapper and
current UI emit inline content.

COOP is `same-origin` and CORP is `same-origin`. COEP is intentionally omitted:
the product does not require cross-origin isolation, and enabling it would require
separate compatibility evidence for Google Fonts, monitoring, downloads, and OAuth.
HSTS is emitted only when `SECURITY_HSTS_ENABLED=true` and Railway reports an
HTTPS-forwarded request. The switch remains off until production domain ownership
and end-to-end TLS are verified. It does not claim `includeSubDomains` or preload
until the full subdomain inventory is also verified.

## Observability

Tool execution emits start, completion, duration, access mode, save state, and
categorized failures. Monitoring must not include raw resumes, job descriptions,
generated content, cookies, auth headers, tokens, email/IP addresses, full imported
URLs, raw provider exceptions, stable run/workspace identifiers, or frontend error
messages. Frontend telemetry is an extra-forbidden allowlist with no route or
stable run/workspace fields and only explicit low-cardinality dimensions. Both Sentry SDKs drop request content,
credentials, query strings, breadcrumb bodies, and the entire user context.

Operational questions should be answerable without reconstructing sensitive content.
R10 scaling evidence extends this boundary with allowlisted aggregate dimensions for
topology, cache outcome, provider incident category, phase latency, database health,
abuse/cost pressure, and job-import source family (D-053). Full URLs and raw provider
errors remain forbidden.

## Scaling Response Boundaries

- R10 responses are independently trigger-gated; no general infrastructure rewrite
  is authorized merely because traffic may grow (D-052).
- The first perceived-latency response is real server phase progress, not simulated
  timers or partial token persistence. Tool responses and `ToolRun` rows remain final,
  validated JSON snapshots (D-056).
- Abuse escalation preserves D-029's account/source quotas and reviewed per-flow
  challenge contracts; there is no global automatic CAPTCHA response (D-057).
- Database responses follow observed query plans and capacity evidence. Primary user
  data is not pruned for capacity without a new decision superseding D-031 (D-058).
- Job-import adapters require concentrated allowlisted source-family evidence, terms
  review, a source-specific kill switch, and the existing paste fallback (D-059).

## Evidence Profile Boundaries (R11, foundation built dark)

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

## CV Studio Boundaries (R12, deferred)

- The CV document is its own persisted structured entity; it is never stored as
  `ToolRun` payloads or freeform rich text, and its claims reference Evidence
  Profile items (D-069, ADR 0006).
- Import extends the existing isolated parser harness (subprocess, resource caps,
  upload guards) into reviewed structured proposals; imported claims reach the
  profile only via the R11 unconfirmed-proposal path (D-070).
- The studio is a structured-section editor session surface with a seventh registry
  entry; existing tool priorities are not renumbered and the six tools never depend
  on CV documents (D-071).
- Quality scoring extends the deterministic-plus-blend mechanism; ATS compatibility
  is deterministic structural checks only — no universal ATS score or outcome
  promise (D-072).
- Tailoring writes only diff-reviewed changes with requirement/evidence provenance;
  unsupported claims need an explicit user confirmation step (D-073).
- Preview, DOCX, and PDF render deterministically from one document plus one of
  three declarative templates, gated by visual, text-layer, link, page-break, and
  own-parser re-import validation (D-074).
  `cv-render/v1` is the normalized source for all three targets. Its canonical hash
  covers normalized visible content, ordering, page geometry, and template tokens.
  ReportLab invariant mode makes PDF byte-stable; DOCX core dates, ZIP member order,
  timestamps, compression, and permissions are normalized for byte stability with
  the pinned runtime dependency set. Cross-runtime compatibility is defined as
  canonical render-hash equality plus equivalent own-parser section-entry content,
  because different office/PDF engines may serialize equivalent packages differently.
  Artifact ATS checks remain `not_run` until an actual DOCX/PDF is generated and
  inspected; only generated-artifact evidence may promote them to pass/fail.
  Browser preview embeds that same authenticated PDF artifact rather than
  reimplementing template layout in CSS, so multi-page boundaries and links are
  identical to the downloaded PDF. Automated PDF snapshots compare text-block
  coordinates at 0.1-point tolerance and fixed-DPI rendered pixel hashes. DOCX
  package semantics plus mandatory LibreOffice/Poppler pagination inspection in
  CI cover the editable artifact.
- Model-backed studio calls run through the shared pipeline with bounded
  per-document regeneration quotas; CV content joins the sensitive-content
  lifecycle and allowlisted-telemetry boundaries (D-075).
- One owner-scoped `career-data-export/v1` export now carries both Evidence Profile items and
  complete CV documents/immutable variants under a mirrored Pydantic/Zod contract.
  Individual and bulk CV erasure are immediate; account erasure counts documents and
  variants separately in its existing transactional audit. Studio telemetry carries
  closed event names only and no content, titles, or stable document/run identifiers.

## Campaign and Reviewer Boundaries (R13, foundation underway)

- Campaigns are the `Workspace` entity evolved additively; existing workspaces stay
  valid label-only campaigns and the implicit creation path keeps working (D-077,
  ADR 0007). The shipped foundation adds nullable company, role, status, and
  timezone-aware deadline fields. Status is server-enforced as
  `planning → preparing → applied → interviewing → offer → accepted`, with
  `rejected` and `withdrawn` terminal exits; legacy null rows may enter only at
  `planning`. Deployment is expand-compatible: older application code ignores the
  nullable columns. The migration downgrade removes only the new columns and
  therefore discards campaign-field values; application rollback should normally
  leave the additive schema in place. Status and deadline mutations atomically add
  minimal append-only campaign events so the later #165 timeline can extend the
  event vocabulary without losing earlier history; product code exposes no event
  update or delete path.
- The canonical listing will be persisted as owner-isolated user content including
  source URL and retrieval date in the next R13 slice; #162 does not yet persist a
  listing. Listing telemetry remains source-family only (D-078, D-059).
- Campaign history is append-only events; material links reference immutable
  versions; the submitted snapshot is an immutable bundle (D-079, D-010).
- Tracking is bounded to the job-search domain — fixed status lifecycle, tasks,
  notes, minimal contacts; no generic CRM features (D-080).
- Reminders are in-product, consented, rate-limited, and revocable; email/push
  channels need a future decision extending the password-reset-only email boundary
  (D-081).
- The reviewer is a separate advisory pass through the shared pipeline; it
  implements the D-043 fabrication tracer against confirmed evidence and never
  auto-applies findings or creates/confirms evidence (D-082).
- Campaign content, including contacts (third-party personal data), joins the
  sensitive-content lifecycle and allowlisted-telemetry boundaries (D-083).

## Discovery Boundaries (R14, deferred)

- No ingestion outside a source registry entry documenting owner, terms status and
  review date, allowed behavior, rate limit, attribution rule, retention rule, and
  kill switch; sources activate only after accepted terms review (D-084, D-085,
  ADR 0008).
- Discovery operationalizes D-026: robots.txt honored, honest identifying user
  agent in every tier, no unauthorized scraping, circumvention, or credential or
  session use (D-086).
- Discovered listings persist with attribution and retrieval date, deduplicated
  and expired per source retention; the store is separate from campaign canonical
  listings (D-087, D-078).
- Ranking uses confirmed Evidence Profile items and preferences via deterministic
  primitives first, with an explainable rationale and hide/correct/report controls
  (D-088).
- Outbound source queries carry only minimal registry-declared parameters; profile
  content never leaves the product (D-089).
- Personalization state (hidden sources, dismissals, reports) is owner-isolated
  user data in the standard lifecycle and telemetry boundaries (D-090).
- Recommendations become campaigns only by explicit user adoption; discovery never
  auto-creates campaigns, tasks, or reminders (D-091).

## Approval Queue Boundaries (R15, deferred)

- Packets are compositions referencing existing entities; approval freezes an
  immutable snapshot (D-093, ADR 0009).
- Preparation runs only inside user-defined rules, volume caps, and cost ceilings
  (D-094).
- Sensitive, legal, eligibility, relocation, demographic, salary,
  work-authorization, and uncertain fields are server-enforced mandatory stops;
  unresolved questions block approval (D-095).
- No R15 code path performs, schedules, or retries a submission; the user submits
  on the official destination. Submission automation exists only behind R16's
  per-source authorization contract (D-096).
- Every packet passes the D-082 reviewer with zero unresolved fabrication findings
  before queueing; regression evals gate continued operation (D-097).
- Queue actions are append-only audit events with duplicate prevention and
  verified rate limits (D-098).
- Rules, packets, drafts, and audit events are owner-isolated sensitive content in
  the standard lifecycle and telemetry boundaries (D-099).

## Trusted Submission Boundaries (R16, deferred)

- Submission exists only behind four independent gates: source (terms approval +
  compatibility contract), user (granular revocable authorization), packet
  (approved snapshot, zero unresolved questions or unsupported claims), and
  envelope (limits, anomaly detection, rehearsed incident controls) (D-100–D-104,
  ADR 0010).
- No stored third-party passwords, copied session state, or inferred
  authorization; only source-provided authentication mechanisms (D-101, D-026).
- Challenges, CAPTCHAs, uncertainty, or contract mismatches stop the attempt and
  return the packet via the Level B handoff — never a workaround (D-102).
- Submissions are idempotent with duplicate prevention; audit is append-only with
  per-field reconstructability and user-inspectable confirmation (D-103).
- Contract breakage trips the source kill switch and degrades to human handoff
  (D-105).
- Quality and user outcomes govern operation; raw volume never loosens controls
  (D-106).
- Submission records follow the standard lifecycle for product copies, with the
  employer-copy limitation stated honestly (D-107).

## Development Loop Boundaries (R17, deferred)

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

## Abuse Controls

Availability monitoring and abuse enforcement are separate: `/health` remains
unlimited for Railway probes, while abuse-sensitive auth, model, upload, import,
telemetry, export, and admin routes use bounded request limits. Outside development,
rate-limit state must use shared storage configured by `RATE_LIMIT_STORAGE_URI`;
process-local memory is rejected at startup.

Limiter keys are HMAC-pseudonymized. A verified access-token subject supplies the
account dimension; explicitly trusted proxy hops supply the source-IP dimension.
Model and import/upload work enforce both dimensions independently. Login,
registration, and reset retain source limits and add pseudonymized account/email
counters. Raw account IDs, email addresses, tokens, and IPs are not written to
limiter storage.

Per-route burst limits are supplemented by shared model-cost and import/upload
ceilings. Route, model, and resource windows expire after their declared minute/hour
window; account-action counters expire after one hour. Failed-login counters expire
after 15 minutes, introduce a bounded delay after the third failure, never hard-lock
an account, and reset after successful login. Registration/reset account pressure
also delays but never suppresses the action. For an incident-wide reset, operators
rotate `RATE_LIMIT_KEY_PREFIX`; abandoned keys expire naturally. Production code
does not issue a datastore-global reset, and no relational migration exists.

Rate-limit events log only the route and verified account/guest class. The release
operator investigates when one route emits at least 50 limit events in 15 minutes
for three consecutive windows, or when provider cost alerts fire. CAPTCHA is not
enabled automatically. The existing flag protects registration only; challenging a
different attacked flow requires a reviewed frontend/backend contract for that flow
before activation. This keeps CAPTCHA evidence-triggered rather than unconditional.

Rollback is configuration-first: raise bounded limits or disable the shared
decorators in a code revert. Never fall back to per-process storage in production,
because that silently weakens multi-instance enforcement.

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
history, export, account, and admin authorization paths. Exact release gates live in
`docs/roadmap.md`.
