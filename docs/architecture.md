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
- Application packet and approval snapshot (dark R15 build-ahead; D-093–D-099,
  ADR 0009) — a reference-only composition plus a write-once by-value freeze at
  guarded acceptance. The snapshot stores the packet-referenced discovered listing
  and its attributions, resolved stop-answer values, CV variant, drafts, rationale,
  the exact source attribution pinned when the packet was prepared for its manual
  handoff, and authoritative empty unresolved set with
  a canonical SHA-256; production activation remains behind D-092.
- Submission record (dark R16 #191/#194 foundation; D-103, D-107, ADR 0010) — immutable proof
  of one idempotent packet-snapshot/source submission with exact frozen-content and
  submitted-field digests. The owner-scoped campaign view reconstructs every field
  beside the exact retained approval snapshot; its system timeline event contains
  only record/snapshot identifiers and commits atomically with the record. Product
  copies export and erase through confirmed campaign/account deletion, while the UI
  states that deletion cannot withdraw the employer's copy. Only the internal fixture-driven
  engine exists; real adapters and activation remain behind D-100.
- Submission stop event (dark R16 #192 foundation; D-102, D-105, ADR 0010) —
  terminal owner/snapshot/source proof that a challenge, authentication request,
  uncertainty, source rejection, or compatibility mismatch returned control to
  the owner. The display-ready result uses fixed copy and the frozen approval
  snapshot's official Level B destination; a second worker or restart returns the
  same stop without calling the adapter. Events contain only closed categories and
  an optional bounded source code, join export/erasure, and provide #195's
  content-free contract-breakage input.
- Submission authorization grant (dark R16 #190 foundation; D-101, D-107,
  ADR 0010) — one owner/source record proving a future trusted adapter completed
  a source-provided OAuth flow with explicit consent. The row contains only a
  closed mechanism, fixed submission scope, and timestamp: no provider credential,
  token, session, subject identifier, or callback payload. Active grants are
  owner-visible, exportable, immediately revocable, and account-deletion scoped.
- Classified gap and development item (R17 foundation built ahead under explicit
  current-task authorization; D-108–D-114) — deterministic reviewer-gap records
  and bounded tracked responses are persisted owner-scoped. Completion feeds the
  R11 unconfirmed-proposal path only; lifecycle export/erasure and content-free
  aggregate telemetry are implemented. Production activation remains closed
  until campaign evidence supports the loop (D-108).

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
- Each campaign now has at most one authoritative current canonical listing with
  title, company, bounded description, optional source URL, and server-owned UTC
  retrieval time. URL attachment reuses the existing SSRF-resistant pinned fetcher;
  authenticated paste attachment accepts no URL or source-family field. Re-attachment
  atomically advances `Workspace.current_listing_id` to a new immutable revision and
  appends a content-free `listing_attached` event. Current and prior listing content
  is owner-isolated, exported, and cascade-deleted; telemetry
  remains allowlisted source-family/outcome only (D-078, D-059, D-079, D-083).
  The existing import card keeps populate-only behavior by default and exposes an
  explicit authenticated campaign picker for URL or pasted attachment; it never
  auto-attaches tool input.
- Campaign history is append-only events; material links reference immutable
  versions; the submitted snapshot is an immutable bundle (D-079, D-010).
- The campaign detail API resolves owner-scoped selectable material metadata without
  copying document content: `selected_cv_variant_id` targets an immutable `CvVariant`,
  while cover-letter and interview IDs target exact immutable `ToolRun` revisions and
  are validated against their expected tool names. Selection events contain only the
  bounded material kind and selected/cleared action; nullable foreign keys use
  `ON DELETE SET NULL` so existing immediate material deletion remains compatible.
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

## Discovery Boundaries (R14, registry foundation built dark)

- The persisted discovery-source registry documents owner, terms status and review
  record, allowed behavior, rate limit, attribution rule, retention rule, and kill
  switch. Its single enforcement seam refuses unregistered, terms-unaccepted, or
  killed sources before ingestion; no source entry or adapter is active yet
  (D-084, D-085, ADR 0008).
- Licensed API/feed fetch policy is registry-declared: one credential-free HTTPS
  endpoint, a closed subset of minimal role/location/pagination parameters, robots
  applicability, and an atomic database-backed request window. The dark adapter
  DNS-pins public targets, rejects redirects, identifies itself, rechecks the kill
  switch before the source request, and returns bounded bytes for the future
  listings-store layer; no real source or ingestion schedule is configured (#172,
  D-086, D-089).
- Discovery operationalizes D-026: robots.txt honored, honest identifying user
  agent in every tier, no unauthorized scraping, circumvention, or credential or
  session use (D-086).
- Discovered listings persist with attribution and retrieval date into product-
  owned canonical rows plus one-to-many source attributions. A daily job expires
  each attribution under its source's current retention rule and removes orphaned
  canonical rows. These tables have no workspace/user foreign key and remain
  separate from campaign canonical listings (D-087, D-078, #173).
- Ranking uses confirmed Evidence Profile items and preferences via deterministic
  keyword-overlap primitives first. The authenticated recommendation endpoint
  re-evaluates source retention at read time, emits each canonical listing once,
  and returns the matched keyword, owner evidence-item references, component
  scores, source attribution, and retrieval date that explain its rank. The
  responsive account-only surface exposes the trace without changing the six
  single-shot tools; hide/correct/report controls remain the next layer (D-088,
  #174).
  Each request selects at most 500 canonical candidates by their latest currently
  live attribution and returns at most 50 ranked results, so expired rows consume
  no candidate budget and profile-to-corpus comparison work stays bounded.
- Outbound source queries carry only minimal registry-declared parameters; profile
  content never leaves the product (D-089).
- Personalization state (hidden sources, dismissals, reports) is owner-isolated
  user data in the standard lifecycle and telemetry boundaries (D-090).
- Recommendations become campaigns only by explicit user adoption; discovery never
  auto-creates campaigns, tasks, or reminders (D-091).

## Approval Queue Boundaries (R15, built ahead; activation deferred)

- Packets are compositions referencing existing entities; approval freezes an
  immutable by-value snapshot with a canonical SHA-256. Snapshot, decision,
  queue-audit row, and campaign-timeline link commit atomically (D-093, D-096,
  ADR 0009); PostgreSQL rejects snapshot-row updates while account/campaign
  erasure may still delete them.
- Approval is available only from `pending` and revalidates the packet's live
  discovered-listing and CV-variant references under a row lock. A missing
  required reference becomes a non-answerable `missing_material` stop and the UI
  directs the owner to re-prepare; concurrent edit/skip/reject actions lock the
  same packet row, so no terminal decision can split from its snapshot.
- Upgrade from the pre-snapshot queue fails closed: legacy `accepted` decisions are
  reset to `pending` because their historical material values cannot be truthfully
  reconstructed. Downgrade likewise resets snapshot-backed decisions before
  dropping the snapshot table, so no accepted-without-evidence state is stranded.
- Preparation runs only inside user-defined rules, volume caps, and cost ceilings
  (D-094).
- Sensitive, legal, eligibility, relocation, demographic, salary,
  work-authorization, and uncertain fields are server-enforced mandatory stops;
  unresolved questions block approval (D-095).
- No R15 code path performs, schedules, or retries a submission; acceptance returns
  an HTTPS-only, user-driven link to the official destination, and unsafe or absent
  URLs produce instructions without a link. Submission automation exists only
  behind R16's per-source authorization contract (D-096).
- Every packet passes the D-082 reviewer with zero unresolved fabrication findings
  before queueing; regression evals gate continued operation (D-097).
- Queue actions are append-only audit events. Approval is terminal and structurally
  unique per packet and per normalized owner/company/role, with the existing
  submitted-campaign check as the second duplicate axis. Campaign submission
  snapshots freeze that normalized role identity at capture, while packet approval
  derives it from the packet's discovered listing. Submission capture likewise
  prefers its canonical campaign listing; editable campaign labels are used only
  for listing-less campaigns. Both immutable-record paths serialize their
  cross-table duplicate check on the owner row. Approval and erasure use
  packet→campaign→owner ordering; individual campaign deletion locks its packet rows
  before the campaign, so neither campaign nor account erasure can invert those
  foreign-key locks (D-098).
- Rules, packets, drafts, and audit events are owner-isolated sensitive content in
  the standard lifecycle and telemetry boundaries (D-099).
- Browser queue queries are owner-keyed; logout, session expiry, and account deletion
  purge the whole queue cache, while a mounted queue clears answer drafts and manual
  handoff state on owner change or expiry.

## Trusted Submission Boundaries (R16, dark #189–#195 foundation; activation deferred)

- Submission exists only behind four independent gates: source (terms approval +
  compatibility contract), user (granular revocable authorization), packet
  (approved snapshot, zero unresolved questions or unsupported claims), and
  envelope (limits, anomaly detection, rehearsed incident controls) (D-100–D-104,
  ADR 0010).
- No stored third-party passwords, copied session state, or inferred
  authorization; only source-provided authentication mechanisms (D-101, D-026).
- Challenges, CAPTCHAs, uncertainty, or contract mismatches stop the attempt and
  return the accepted packet via its frozen Level B handoff — never a workaround
  or automatic retry. The approved decision and immutable snapshot remain intact;
  “return to queue” means control returns to the owner on that accepted packet,
  not that approval history is rewritten (D-102).
- Submissions are idempotent with duplicate prevention; audit is append-only with
  per-field reconstructability and user-inspectable confirmation (D-103).
- Contract observations are compared exactly with the reviewed compatibility
  contract. A mismatch marks the contract broken, demotes the source, trips its
  kill switch, and degrades to human handoff. Restoring contract bytes does not
  reactivate the source: an admin must explicitly re-promote and clear the switch
  after review (D-105).
- The built-ahead #189 source gate extends each R14 registry row with at most one
  submission-governance record. It persists a separate submission legal/terms
  review, a strictly validated compatibility contract (fields, formats, error
  semantics), explicit promotion provenance, and a default-on submission kill
  switch. The authoritative `require_submission_allowed()` seam re-reads all
  source facts and refuses unless R14 terms are accepted, both discovery and
  submission kill switches are clear, the submission review is accepted, the
  contract is verified, and the source is promoted. No real registry entry,
  credentials, network adapter, user authorization, or submission route ships in
  #189; local synthetic fixtures are contract tests, never legal approval.
- Promotion and submission-kill telemetry reuses the first-party operational
  store with source-family plus closed transition classes only. Source keys,
  contract bodies, endpoints, and reviewer identities remain outside analytics.
  This build-ahead is not evidence for D-100 and does not authorize activation.
- The built-ahead #190 user gate is one active grant per owner and governed source.
  Only the internal `record_submission_authorization()` seam exists; there is no
  HTTP grant-creation route or source OAuth adapter. The seam first re-evaluates
  #189 and accepts a strict callback result containing only one of two
  source-provided OAuth mechanism classes, the fixed `submit_applications` scope,
  and literal consent. The database has no credential, token, session, provider
  subject, or arbitrary metadata column.
- Listing and revocation are authenticated and owner-scoped. Revocation physically
  removes the exact grant. Future queued/in-flight work must pin that grant id and
  call `require_active_submission_authorization()` at dispatch and immediately
  before every outward act or retry; a later re-grant creates a different id and
  cannot revive stale work. #190 supplies this dark user-gate checkpoint, not a
  scheduler, integration, callback endpoint, queue, or submission engine.
- The dark #191 engine has no router, scheduler, credential exchange, or real
  adapter. Its internal orchestration accepts only an approved immutable snapshot
  and requires the source, exact grant id, packet, and injected authoritative
  envelope checkpoints both at dispatch and immediately before the adapter act.
  Submitted fields are resolved only from compatibility-contract paths into the
  frozen snapshot and checked against declared formats. A durable unique dispatch
  claim serializes concurrent workers; a deterministic packet-snapshot/source key
  also crosses the adapter's required source-native idempotency boundary so retries
  and process restarts remain one logical submission. The claim freezes the grant,
  canonical fields, digests, contract version, and accepted response codes before
  the first act, so an ambiguous retry cannot be rewritten by later governance.
  The immutable record pins the exact
  snapshot digest, contract version, submitted-field digest, and fixture
  confirmation. Only a local synthetic adapter exists; #193 must supply the real
  envelope before any adapter can be registered.
- The dark #192 stop boundary adds a typed adapter stop result and an immutable
  terminal event unique per snapshot/source. It is rechecked under the #191 claim
  lock, preventing a concurrent worker or restart from invoking the adapter after
  a stop. User-facing explanations come only from a closed engine mapping and the
  handoff URL only from the frozen snapshot; provider prose, CAPTCHA material,
  auth details, and submitted fields are never copied into a stop event. #195 owns
  thresholds, operational events, and automatic kill-switch actuation.
  Submission is refused before an adapter call unless that non-null HTTPS handoff
  destination and its source identity are frozen to the selected governed source.
  Ambiguous post-act timeouts or invalid/unknown confirmations do not become terminal
  handoffs; they retain the exact durable claim for source-native reconciliation.
- The dark #193 envelope is the engine's authoritative fourth checkpoint. A singleton
  global kill switch defaults on; clearing it requires a recorded incident-playbook
  rehearsal. Strict per-source policies bound each owner and each source by rolling
  minute append-only adapter-attempt counts and rolling 24-hour logical-claim
  volume, with a separate hourly attempt anomaly threshold. Retries of one frozen
  idempotency claim are separate rate/anomaly attempts but one logical volume unit.
  The engine consults the owner queue pause plus global control and source policy at
  dispatch, durably commits a conservative attempt reservation, then reacquires the
  complete lock chain and rechecks every mutable gate immediately before its adapter
  boundary. A process crash can therefore over-count an attempt but cannot erase an
  outward-call reservation or bypass retry throttling. The second check binds the
  exact reservation ID to owner/source and the active minute window; an aged
  reservation fails closed and a later retry must reserve again.
  Anomalies emit only source family and a closed outcome. Owners can inspect their
  exact owner-only bounded usage and a closed block reason; shared-source counts stay
  internal. Rehearsals append immutable evidence references plus explicit roles,
  rollback, and communication confirmations. Tripping the global control consumes
  the active proof without deleting its history, so recovery requires a fresh
  rehearsal before admins can clear it again. Admins can configure
  limits and trip global/source controls without a deploy. No public submit route,
  scheduler, credential flow, real adapter, or activation is added.
- The dark #194 confirmation surface commits one append-only system campaign event
  in the same transaction as each immutable submission record. Event details carry
  only the record and approval-snapshot identifiers; submitted values remain solely
  in the owner-scoped record. Authenticated campaign detail reconstructs every
  submitted field beside the exact immutable approval bytes and digest, without
  exposing grant or idempotency internals. The owner can confirm campaign deletion
  to remove the product record, event, claims, and snapshot through the existing
  ordered lifecycle; the UI explicitly states that this cannot recall the employer-held application.
  The machine-readable export includes the audit record, timeline link, and the
  content-free attempt ledger.
- The dark #195 monitor accepts only strict local/adapter contract observations;
  it has no network fetcher or generic browser seam. Contract-check telemetry is
  source family plus `compatible`/`broken` only. Successful and idempotently
  prevented fixture submissions emit only source family plus a closed quality
  outcome. The admin quality view aggregates response, packet-edit, duplicate,
  and complaint rates per allowlisted family. Duplicate prevention uses prevented
  attempts over confirmed-plus-prevented logical attempts, so repeated safe retries
  remain bounded instead of breaking the response contract. Confirmation count is labeled only
  as sample context, and the response shape exposes no control mutation, source
  key, user/packet id, contract body, or submitted value. Quality and user
  outcomes govern review; neither this dashboard nor raw volume can activate a
  source or loosen a control (D-105–D-107).
- Submission records follow the standard lifecycle for product copies, with the
  employer-copy limitation stated honestly (D-107).

## Development Loop Boundaries (R17 built ahead; activation deferred)

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
- The implementation foundation is present on `chapter2`, including authenticated
  lifecycle routes and aggregate-only admin reporting; that build-ahead does not
  satisfy the evidence gate or authorize production activation (D-108).

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
