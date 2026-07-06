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
- Cache is in-process in V1; multi-instance deployment requires reassessing
  correctness and hit expectations before adopting Redis.

Resume/workflow state in browser storage is sensitive. Store the minimum necessary,
keep it tab-scoped, and expose a clear local-data reset.

## External Integrations

- Vertex AI / Gemini for model generation.
- BeautifulSoup with Playwright fallback for supported job imports.
- Resend for password-reset email.
- Google OAuth for sign-in.
- Sentry for scrubbed error monitoring.
- Railway for intended hosting and database.

Each integration must fail with an actionable product state. Optional integrations
must not make unrelated core flows unavailable.

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
cookies, auth headers, tokens, or email addresses.

Operational questions should be answerable without reconstructing sensitive content.

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
