# Career Workbench — Threat Model

**Status:** canonical baseline
**Last reviewed:** 2026-07-06
**Source:** executable code, configuration, and intended Railway topology

This document establishes the evidence baseline for R3: Privacy, Security, and
Abuse Gate. Every claim cites an exact file path and function or line number.
Where production facts are unknown from code alone, they are recorded in §14
as ready-for-human decisions.

---

## §1 System Topology & Deployment Model

### 1.1 Intended Production Topology

Career Workbench runs on Railway as a three-service deployment:

```text
Railway Platform
├── Backend  (railway.toml root, `numReplicas=1`)
│   └── uvicorn single-process on port 8000
├── Frontend (frontend/railway.toml, `numReplicas=1`)
│   └── Custom SSR server (serve.mjs) on port 3000
└── PostgreSQL (Railway-provided)
```

- Railway handles TLS termination and path-based routing.
  — `railway.toml`, `frontend/railway.toml`
- No nginx or custom reverse proxy exists in the repository.
- The frontend SSR server checks `x-forwarded-proto` and redirects HTTP to HTTPS.
  — `frontend/serve.mjs`

### 1.2 Single-Instance Posture

Both services are configured with `numReplicas=1`. The backend runs a single
uvicorn process without `--workers`. The frontend is a single Node process.

- Backend: `railway.toml:12` — `numReplicas = 1`
- Frontend: `frontend/railway.toml:14` — `numReplicas = 1`
- Backend: `backend/Dockerfile` — `CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]` (no `--workers`)

### 1.3 Health Checks

- Backend: `GET /api/v1/health` — unauthenticated, checks database connectivity
  via `SELECT 1`. Returns `{"status": "ok"}` or `{"status": "degraded"}`.
  — `backend/app/routers/health.py:health_check`
- Frontend: `GET /` — serves the homepage.
  — `frontend/railway.toml:10` — `healthcheckPath = "/"`

### 1.4 Container Posture

Both Dockerfiles run as root — no `USER` instruction exists.

- Backend: `backend/Dockerfile` — based on `python:3.12-slim`, includes
  Playwright + Chromium for PDF rendering
- Frontend: `frontend/Dockerfile` — multi-stage build from `node:20-slim`,
  runs custom `serve.mjs`

### 1.5 Multi-Instance Readiness

The `start.sh` script is explicitly multi-instance aware — it uses a `RUN_MIGRATIONS`
env var and relies on Alembic locking for migration safety. Rate-limit and abuse
counter storage is shared outside development; the result cache remains local:

| Subsystem | Current | Multi-Instance Impact |
|-----------|---------|-----------------------|
| Rate limiter and abuse counters | `RATE_LIMIT_STORAGE_URI`; non-shared storage rejected outside development | Shared counters when the deployment supplies a supported distributed backend |
| Result cache | In-memory Python dict | Fragmented — no cache sharing between instances |

— `backend/app/services/result_cache.py` (docstring acknowledges this)
— `backend/app/limiter.py:validate_abuse_control_config`,
`backend/app/limiter.py:AbuseCounterStore`

---

## §2 Trust Boundaries

### 2.1 Boundary Map

```text
Browser ──────► Frontend SSR (serve.mjs, :3000) ──────► Backend API (uvicorn, :8000)
  │                                                        │
  │  localStorage / sessionStorage                         ├──► PostgreSQL
  │  HttpOnly cookies                                      │
  │                                                        ├──► Vertex AI (gemini-2.5-flash)
  │                                                        │
  └── (no cross-tab state sharing)                         ├──► Internet (scraper, Playwright)
                                                           │
                                                           ├──► Resend (email)
                                                           │
                                                           ├──► Google OAuth
                                                           │
                                                           └──► Sentry (opt-in)
```

### 2.2 Boundary Definitions

| Boundary | Crosses Via | Enforcement | Assumptions |
|----------|-------------|-------------|-------------|
| Browser → SSR | HTTPS (Railway TLS) | `x-forwarded-proto` redirect in `serve.mjs` | Railway terminates TLS correctly |
| Browser → API | Browser fetch over development HTTP or Railway HTTPS | CORS `allow_origins` whitelist (defaults: `localhost:5173,localhost:3000` + `FRONTEND_URL`; `backend/app/config.py:19`, `backend/app/main.py:100-106`), `allow_credentials=True` | Production frontend/backend origins and site relationship are unknown pending D-UNK-10 |
| API → DB | TCP (psycopg2/sqlite) | Connection pool, `pool_pre_ping=True` | PostgreSQL credentials in env vars |
| API → Vertex AI | HTTPS | Google Cloud IAM (vertexai.init) or API key (`GOOGLE_API_KEY`) | Credential scope limits which projects/models are accessible |
| API → Internet (scraper) | HTTPS (httpx), TCP (Playwright) | `_validate_url()` with DNS-level IP checks, redirect re-validation | DNS resolver is trustworthy; no DNS-over-HTTPS |
| Browser → storage | JS APIs | HttpOnly cookie flag for `cw_access`/`cw_refresh`; sessionStorage tab scope | Browser implements SameSite correctly |

### 2.3 Key Trust Assumptions

1. Railway's internal network isolates the two services from the public internet.
2. The `SECRET_KEY` is protected and never logged or exposed.
3. The database runs on Railway's managed PostgreSQL with encrypted connections.
4. Vertex AI responses are not tampered with in transit.
5. Playwright's sandbox is effective on the container's kernel.

---

## §3 Data-Flow Maps

### 3.1 Guest Tool Run

```text
Browser                          Backend API                       Vertex AI
  │                                 │                                 │
  ├─ POST /resume/analyze ─────────►                                 │
  │  {resume_text}                  ├─ sanitize_user_input()          │
  │                                 ├─ compute_content_hash()         │
  │                                 ├─ get_cached_result()            │
  │                                 ├─ (cache miss)                   │
  │                                 ├─ prompt builder ───────────────►
  │                                 │                                 ├─ generate_content_async()
  │                                 │  ◄── JSON response ─────────────┤
  │                                 ├─ _safe_parse_json()             │
  │                                 ├─ log tool_run_completed         │
  │  ◄── ToolResult ───────────────┤                                 │
  │                                 │                                 │
  ├─ setTransientResult()           │                                 │
  ├─ sessionStorage "cw:demo-result:{id}"                             │
  └─ writeWorkflowContext()                                           │
     sessionStorage "career-workbench:workflow-context"                │
```

— `backend/app/services/tool_pipeline.py:run_tool_pipeline`
— `frontend/src/lib/tools/demoRuns.ts:52`
— `frontend/src/lib/tools/drafts.ts:97`

### 3.2 Authenticated Tool Run

Same initial flow as guest, except:

1. Access token extracted from `cw_access` cookie or `Authorization: Bearer` header.
   — `backend/app/auth/security.py:get_current_user:147-176`
2. On success, `ToolRun` row persisted to `tool_runs` table.
3. On 401, frontend attempts silent refresh via `POST /auth/refresh`.
   — `frontend/src/lib/api/client.ts:silentRefresh`
4. On refresh failure, session-expired dialog opens with pending intent capture.
   — `frontend/src/lib/auth/session.tsx:111`

### 3.3 Auth Flow — Login, OAuth, Refresh, Password Reset

**Email/Password Login:**
```text
Browser                    Backend API                       Database
  │                          │                                 │
  ├─ POST /auth/login ──────►                                 │
  │  {email, password}       ├─ bcrypt.checkpw()              │
  │                          ├─ SELECT user BY email ────────►│
  │                          ├─ set_auth_cookies()            │
  │  ◄── User + cookies ────┤                                 │
  │  (cw_access, cw_refresh HttpOnly)                         │
```

**Google OAuth:**
```text
Browser → GET /auth/google/login → redirect to Google
Google callback → GET /auth/google/callback?code=...&state=...
  → authlib verifies state (SessionMiddleware cookie)
  → authorize_access_token() exchanges code for tokens
  → userinfo endpoint: sub, email, email_verified
  → account linking or block (signup_via_email_required)
  → set_auth_cookies() → redirect to /dashboard
```
— `backend/app/routers/google_auth.py:google_login, google_callback`

**Token Refresh:**
```text
Browser → POST /auth/refresh (cw_refresh cookie scoped to /api/v1/auth/refresh)
  → verify_refresh_token(): check type, tv vs user.token_version
  → create_access_token(), create_refresh_token() (new tv from DB)
  → set_auth_cookies()
```
— `backend/app/auth/security.py:verify_refresh_token:52-66`

**Password Reset:**
```text
Browser → POST /auth/password-reset/request {email}
  → always 200 (same message whether user exists or not)
  → create_password_reset_token(): secret = SECRET_KEY:reset:{password_hash[:16]}
  → Resend email with reset URL: {FRONTEND_URL}/reset-password#token=TOKEN

Browser → POST /auth/password-reset/confirm {token, new_password}
  → verify_password_reset_token(): validates signature against current hash
  → on success: hash new password, increment user.token_version, clear cookies
```
— `backend/app/auth/security.py:69-71` — `_reset_token_secret`
— `backend/app/services/email_service.py:_send_resend_sync`

---

## §4 Asset Inventory (Ranked by Sensitivity & Blast Radius)

| Rank | Asset | Sensitivity | Primary Storage | Retention | Blast Radius if Exposed |
|------|-------|-------------|-----------------|-----------|------------------------|
| 1 | User credentials (password hash, OAuth linkage) | Critical | `users.hashed_password`, `users.google_id` | Until account deletion | Full account takeover, cross-service if password reused |
| 2 | Resume full text | High | `tool_runs.result_payload`, browser sessionStorage | Until deletion (no TTL) | Identity exposure, employer discovery, competitive disadvantage |
| 3 | Generated application materials (cover letter, interview answers, career path, portfolio) | High | `tool_runs.result_payload`, browser sessionStorage | Until deletion (no TTL) | Professional reputation, fabricated claims liability |
| 4 | Job descriptions | Medium-High | `tool_runs.result_payload`, browser sessionStorage | Until deletion (no TTL) | Reveals target employers/roles |
| 5 | Session tokens (`cw_access`, `cw_refresh`) | High | HttpOnly cookies | 30 min / 7 days | Account hijacking for token lifetime |
| 6 | Email address | Medium | `users.email` | Until account deletion | Phishing, enumeration, spam |
| 7 | Google identity (`google_id`, `email_verified`) | Medium | `users.google_id` | Until account deletion | Cross-service correlation |
| 8 | Evidence Profile career claims | High | `evidence_items.content` | Until item/account deletion | Career history, preferences, employer or institution exposure |
| 9 | Structured CV drafts and variant snapshots | High | `cv_documents.sections`, `cv_variants.sections` | Until document/account deletion | Full career history, target-role intent, professional reputation exposure |
| 10 | Tool metadata (scores, skill gaps, recommendations) | Medium | `tool_runs.result_payload` | Until deletion | Career profile inference |
| 11 | Workspace labels and structure | Low | `workspaces.label`, `workspaces.is_pinned` | Until deletion | Organizational preference leakage |
| 12 | Behavioral telemetry (event names, routes, timestamps) | Low | Log stdout, Sentry (if enabled) | Undefined (no TTL) | Usage pattern inference |
| 13 | Sidebar state, language preference | None | `sidebar_state` cookie, `app_language` localStorage | 7 days / forever | None |

### 4.1 Guest-Specific Storage Note

For guest users, the top-4 sensitivity assets (resume, generated output, job
descriptions, tool metadata) exist in browser sessionStorage only:
`cw:demo-result:{id}`, `career-workbench:workflow-context`, `career-workbench:draft:{toolId}`, `cw:resume-carry`. These are tab-scoped and die with the
tab (plus a 4-hour TTL on workflow context). However, for authenticated users,
the same data persists indefinitely in the `tool_runs` table.

---

## §5 Browser Storage Inventory

### 5.1 localStorage (Origin-Scoped, Survives Tab Close)

| Key | Owner | Data | Sensitivity | TTL | Cleared By |
|-----|-------|------|-------------|-----|------------|
| `cw-cookie-consent` | `src/lib/consent.ts:9,20` | `"accepted"` \| `"rejected"` | None | Forever | Manual (no UI to revoke) |
| `career-workbench:pending-intent` | `src/lib/auth/pendingIntent.ts:21,28` | `{to, reason, toolId, label, createdAt}` | Low (URL paths) | 10 min | Consumption or TTL expiry |
| `cw:onboarding` | `src/hooks/useOnboarding.ts:14,24` | `{completed, completedAt, skippedAt}` | None | Forever | `clearOnboarding()` |
| `app_language` | `src/lib/i18n/index.ts:8,25` | `"en"` \| `"tr"` | None | Forever | Manual |
| `auth_token`, `refresh_token` | `src/lib/auth/session.tsx:79-80` | Legacy — deleted on mount | Critical | Deleted once | One-shot cleanup effect |

### 5.2 sessionStorage (Tab-Scoped, Dies on Tab Close)

| Key | Owner | Data | Sensitivity | TTL | Cleared By |
|-----|-------|------|-------------|-----|------------|
| `career-workbench:draft:{toolId}` | `src/lib/tools/drafts.ts` | `{resumeText, jobDescription, ...}` | **High** — full resume + JD text | Tab close | Manual clear, explicit logout, account deletion, or tab close |
| `career-workbench:workflow-context` | `src/lib/tools/drafts.ts` | `{resumeText, jobDescription, resumeAnalysis, jobMatch, ...}` | **High** — full analysis results | 4 hours / tab close | Manual clear, explicit logout, account deletion, TTL, or tab close |
| `cw:demo-result:{id}` | `src/lib/tools/demoRuns.ts` | Full `ToolRunDetail` (all LLM output) | **High** — complete tool result | Tab close | Manual clear, explicit logout, account deletion, or tab close |
| `cw:resume-carry` | `src/lib/tools/resumeCarryStore.ts` | Raw resume text (plain string) | **High** — unstructured resume | Tab close | Manual clear, explicit logout, account deletion, or tab close |
| `cw:resume-carry-filename` | `src/lib/tools/resumeCarryStore.ts` | Filename string | Low | Tab close | Manual clear, explicit logout, account deletion, or tab close |
| `cw:practice-attempts` | `src/components/tooling/InterviewPracticeMode.tsx:31,65` | `Record<number,number>` | None | Tab close | Tab close |
| `cw:consecutive-crashes` | `src/components/app/ErrorBoundary.tsx:34-38` | String number | None | On success/redirect | 2+ crashes → redirect + clear |
| `cw:guest-banner-dismissed` | `src/components/tooling/GuestSaveBanner.tsx:17,27` | `"1"` flag | None | Tab close | Tab close |
| `cw:sw-reload-pending` | `src/routes/__root.tsx:145-157` | `"1"` flag | None | On reload | On reload |

### 5.3 Cookies

| Name | HttpOnly | Data | Sensitivity | Scope | TTL |
|------|----------|------|-------------|-------|-----|
| `cw_access` | Yes | JWT access token | High — session hijacking | `/api` | `ACCESS_TOKEN_EXPIRE_MINUTES * 60` |
| `cw_refresh` | Yes | JWT refresh token | High — long-lived session | `/api/v1/auth/refresh` | `REFRESH_TOKEN_EXPIRE_DAYS * 86400` |
| `sidebar_state` | No | `"true"` \| `"false"` | None | `/` | 7 days |

### 5.4 Sensitive Content Classification

Four sessionStorage keys contain resume text and/or generated career content:

1. `career-workbench:draft:{toolId}` — full draft with resume text and job descriptions
2. `career-workbench:workflow-context` — previous tool results, resume text, JD, skill gaps, recommendations
3. `cw:demo-result:{demoId}` — complete `ToolRunDetail` payload from any guest tool run
4. `cw:resume-carry` — raw resume text as a plain string

All four are tab-scoped and are cleared together by the settings control,
explicit logout (including local cleanup after a server failure), and successful
account deletion. They also die on tab close; workflow context has an additional
4-hour TTL. For authenticated users, the same data is also server-persisted in
`tool_runs.result_payload`.

**No localStorage key stores resume text, JD text, or generated content.**
The legacy `auth_token`/`refresh_token` keys were a pre-cookie-only migration
artifact and are deleted on every app mount.

---

## §6 API Surface & Authorization Matrix

All routes are mounted under `/api/v1` in `backend/app/main.py:128-147`.

### 6.1 No Authentication Required (12 endpoints)

| Method | Path | Rate Limit | Purpose |
|--------|------|------------|---------|
| `GET` | `/health` | None | Railway health probe (DB check) |
| `POST` | `/auth/login` | 10/min | Email/password login |
| `POST` | `/auth/register` | 5/min | Account registration |
| `GET` | `/auth/google/login` | None | Google OAuth redirect |
| `GET` | `/auth/google/callback` | None | Google OAuth callback |
| `POST` | `/auth/logout` | None | Clear any auth cookies present |
| `POST` | `/auth/password-reset/request` | 3/min | Request reset email |
| `POST` | `/auth/password-reset/confirm` | 10/min | Confirm reset with signed reset token |
| `GET` | `/auth/providers` | None | List configured sign-in providers |
| `POST` | `/files/parse-cv` | 20/min | Parse an uploaded CV without resolving identity |
| `POST` | `/job-posts/import-url` | 10/min | Import a job post without resolving identity |
| `POST` | `/telemetry/events` | 60/min | Accept allowlisted telemetry without resolving identity |

### 6.2 Optional Authentication — Guest or Authenticated (7 endpoints)

These accept unauthenticated requests but extract authenticated user if present
via `get_optional_current_user()`. Rate-limited at 10/min per endpoint.

| Method | Path | Rate Limit |
|--------|------|------------|
| `POST` | `/resume/analyze` | 10/min |
| `POST` | `/job-match/match` | 10/min |
| `POST` | `/cover-letter/generate` | 10/min |
| `POST` | `/interview/questions` | 10/min |
| `POST` | `/interview/practice-feedback` | 10/min |
| `POST` | `/career/recommend` | 10/min |
| `POST` | `/portfolio/recommend` | 10/min |

### 6.3 Authentication or Session Credential Required (26 endpoints)

| Method | Path | Rate Limit |
|--------|------|------------|
| `GET` | `/auth/me` | None |
| `POST` | `/auth/refresh` | 20/min |
| `POST` | `/auth/me/delete` | 5/min |
| `GET` | `/history` | None |
| `GET` | `/history/workspaces` | None |
| `PATCH` | `/history/workspaces/{id}` | None |
| `GET` | `/history/{id}` | None |
| `GET` | `/history/{run_id}/export/pdf` | 10/min |
| `DELETE` | `/history/{id}` | None |
| `PATCH` | `/history/{id}/favorite` | None |
| `PATCH` | `/history/{id}` | None |
| `GET` | `/evidence-profile/items` | None |
| `POST` | `/evidence-profile/items` | None |
| `GET` | `/evidence-profile/items/{id}` | None |
| `PATCH` | `/evidence-profile/items/{id}` | None |
| `POST` | `/evidence-profile/items/{id}/confirmation` | None |
| `DELETE` | `/evidence-profile/items/{id}` | None |
| `GET` | `/evidence-profile/export` | 5/min |
| `GET` | `/cv-documents` | None |
| `POST` | `/cv-documents` | None |
| `GET` | `/cv-documents/{id}` | None |
| `PATCH` | `/cv-documents/{id}` | None |
| `DELETE` | `/cv-documents/{id}` | None |
| `POST` | `/cv-documents/{id}/variants` | None |
| `POST` | `/cv-documents/{id}/variants/{variant_id}/restore` | None |
| `GET` | `/cv-documents/export` | 5/min |

The Evidence Profile endpoints are authenticated-owner-only (`get_current_user`
scopes every row to the caller; no anonymous profile rows exist — D-064). The
bulk `GET /evidence-profile/export` is rate-limited at the same 5/min ceiling as
`POST /auth/me/delete` because it is a bulk read of the user's most sensitive
stored content (#149, D-065); see §8.7.

### 6.4 Admin Required (7 endpoints)

All require `get_current_admin` (chains: `get_current_user` → `is_admin` check).
Rate-limited at 60/min.

| Method | Path | Rate Limit |
|--------|------|------------|
| `GET` | `/admin/users` | 60/min |
| `GET` | `/admin/users/{id}` | 60/min |
| `PATCH` | `/admin/users/{id}/admin` | 60/min |
| `GET` | `/admin/runs` | 60/min |
| `GET` | `/admin/runs/{run_id}` | 60/min |
| `GET` | `/admin/stats` | 60/min |
| `GET` | `/admin/health` | 60/min |

### 6.5 Unrate-Limited Endpoints (Risk Note)

The following endpoints have no rate limit:
`GET /auth/me`, `POST /auth/logout`, `GET /auth/providers`, all history
`GET`/`PATCH`/`DELETE` endpoints (except PDF export), and the OAuth endpoints.

### 6.6 Rate-Limit Identity

When `TRUST_PROXY_HEADERS=False` (the default), the limiter uses the immediate TCP
peer. When enabled, it trusts `X-Forwarded-For` only if the immediate peer is in
the explicit `TRUSTED_PROXY_CIDRS` allowlist, then walks the chain right-to-left
until the first untrusted address. Private/loopback peers receive no implicit
trust. Production values remain unknown — see D-UNK-1
(`backend/app/limiter.py:_get_client_ip`,
`backend/tests/test_limiter.py:test_limiter_walks_trusted_proxy_chain_from_right_to_left`).

Keys are HMAC-pseudonymized. Abuse-sensitive model and import/upload routes enforce
both verified-account/guest identity and independent source-IP windows. Login,
registration, and password reset use source limits plus pseudonymized account/email
counters. Route/model/resource windows expire with their declared limit; account
actions expire after one hour and login-failure counters after 15 minutes.

---

## §7 Authentication & Session Model

### 7.1 JWT Architecture

- **Algorithm:** HS256 (symmetric, shared `SECRET_KEY`)
  — `backend/app/config.py:ALGORITHM`, defaults to `"HS256"`
- **Access token payload:** `{sub: user_id, exp, iat}` — lifetime: `ACCESS_TOKEN_EXPIRE_MINUTES` (configurable, default 30 min)
  — `backend/app/auth/security.py:create_access_token`
- **Refresh token payload:** `{sub, exp, iat, type: "refresh", jti: uuid.hex, tv: token_version}` — lifetime: `REFRESH_TOKEN_EXPIRE_DAYS` (default 7 days)
  — `backend/app/auth/security.py:create_refresh_token`

### 7.2 Token Revocation

Refresh tokens carry the user's `token_version` (from `users.token_version`
column). On password reset or explicit revocation, `token_version` is
incremented, invalidating all existing refresh tokens. Access tokens are not
individually revocable — they remain valid until expiry.

— `backend/app/auth/security.py:verify_refresh_token:52-66`
— `backend/app/models/user.py:token_version`

### 7.3 Cookie Configuration

Cookies are set via `set_auth_cookies()` / cleared via `clear_auth_cookies()`.

| Property | `cw_access` | `cw_refresh` |
|----------|-------------|--------------|
| HttpOnly | `True` | `True` |
| Secure | `True` in non-dev | `True` in non-dev |
| SameSite | `"lax"` | `"lax"` |
| Path | `"/api"` | `"/api/v1/auth/refresh"` |
| Domain | Not set | Not set |
| Max-Age | 30 min (configurable) | 7 days (configurable) |

— `backend/app/auth/security.py:100-127`

### 7.4 Token Extraction

`get_current_user()` extracts the token from two sources in priority order:
1. `Authorization: Bearer <token>` header
2. `cw_access` cookie from `request.cookies`

Refresh tokens are rejected as access tokens (`type: "refresh"` check).

— `backend/app/auth/security.py:147-176`

### 7.5 CSRF Protection

Relies on `SameSite=Lax` cookies + HttpOnly + restricted CORS origins. There is
no synchronizer token, double-submit cookie pattern, or `Origin`/`Referer` header
validation. SameSite=Lax is the authoritative CSRF control per PRD #72 and
`docs/architecture.md` "Identity and Access" section. No accepted decision in
`docs/decisions.md` addresses SameSite directly; D-008 covers HttpOnly cookie
storage.

#### R3 #75 provisional code posture

R3 preserves PRD #72's existing SameSite=Lax contract while production topology
remains unverified. This is characterization of the code/default-development
posture, not a new accepted decision in `docs/decisions.md`. Current evidence does
not justify adding a double-submit token or origin middleware
(`backend/app/auth/security.py:set_auth_cookies`,
`backend/app/main.py:99-109`):

- credentialed JSON requests from the configured default frontend origin preflight
  successfully and receive an exact `Access-Control-Allow-Origin` response
  (`backend/tests/test_auth_posture.py:test_allowed_frontend_origin_can_preflight_cookie_authenticated_mutations`);
- untrusted origins cannot preflight `Content-Type: application/json` or
  `Authorization`, so browser JavaScript cannot send those protected request
  shapes
  (`backend/tests/test_auth_posture.py:test_untrusted_origin_cannot_preflight_json_or_authorization_mutations`);
- the representative `/auth/me/delete` JSON mutation rejects a `text/plain`
  body before business logic runs
  (`backend/tests/test_auth_posture.py:test_simple_cross_origin_body_cannot_reach_json_account_deletion`);
- authorization remains mandatory after CORS succeeds; an allowed origin is not
  an identity or ownership signal
  (`backend/tests/test_auth_posture.py:test_allowed_origin_never_replaces_endpoint_authorization`);
- access and refresh cookies remain HttpOnly, host-only, path-scoped, Lax, and
  Secure outside development
  (`backend/app/auth/security.py:set_auth_cookies`,
  `backend/tests/test_auth_posture.py:test_production_login_adds_secure_without_changing_lax_or_paths`);
- OAuth callback handling redirects success or failure only to the configured
  frontend URL and issues the same auth cookies. Authlib owns state validation,
  but the current callback tests mock the token exchange and do not exercise that
  validation (`backend/app/routers/google_auth.py:google_login`,
  `backend/app/routers/google_auth.py:google_callback`,
  `backend/tests/test_google_oauth.py:test_link_accepts_verified_email`).

| Environment | Frontend/browser origin | API origin | Status |
|-------------|-------------------------|------------|--------|
| Vite development | `http://localhost:5173` (`backend/app/config.py:19`) | Relative `/api/v1` through the dev proxy, or explicit `VITE_API_URL` (`frontend/src/lib/api/client.ts:29-40`) | Code/default configuration verified |
| Built local frontend | `http://localhost:3000` (`backend/app/config.py:20`) | Example `http://localhost:8000/api/v1` (`frontend/.env.example:1-2`) | Code/default configuration verified |
| Railway | `FRONTEND_URL` / deployed frontend domain | `${BACKEND_URL}/api/v1` (`frontend/railway.toml:5-6`) | **Unknown:** deployed values, TLS, registrable-site relationship, and `GOOGLE_REDIRECT_URI` require human/staging evidence |

#### Mutating-route and content-type matrix

Routes are grouped only where their browser request shape and authorization
behavior are equivalent.

| Route group | Content/request shape | Ambient credential and CORS/CSRF behavior | Evidence |
|-------------|-----------------------|-------------------------------------------|----------|
| `/auth/login`, `/auth/register`, password-reset request/confirm | JSON `POST`; no existing session required | Cross-origin browser fetch preflights; login/register may issue auth cookies | `frontend/src/lib/api/client.ts:47-52,94-111`; `backend/app/routers/auth.py:login,register,request_password_reset,confirm_password_reset` |
| `/auth/google/login`, `/auth/google/callback` | Top-level `GET` navigation; callback mutates/link/signs in | No CORS fetch; Authlib session/state flow, then callback issues auth cookies | `backend/app/main.py:93-97`; `backend/app/routers/google_auth.py:google_login,google_callback` |
| `/auth/refresh` | Frontend sends JSON `{}` `POST`; server also accepts a bodyless request with path-scoped refresh cookie | JSON frontend call preflights cross-origin; Lax governs cookie delivery on cross-site requests | `frontend/src/lib/api/client.ts:80-90`; `backend/app/routers/auth.py:refresh_token`; `backend/app/auth/security.py:106-114` |
| `/auth/logout` | Bodyless `POST`; endpoint requires no authenticated dependency | Requests with an explicit `Origin` must match configured CORS/frontend origins before cookies are cleared; non-browser clients without `Origin` remain compatible | `frontend/src/lib/api/client.ts:logout`; `backend/app/routers/auth.py:logout`; `backend/tests/test_auth_posture.py:test_bodyless_cross_origin_logout_is_rejected_without_cookie_deletion` |
| `/auth/me/delete` | Authenticated JSON `POST` | Cross-origin fetch preflights; endpoint still requires access credential and typed-email confirmation | `backend/app/routers/auth.py:delete_account`; `backend/tests/test_auth_posture.py:test_allowed_origin_never_replaces_endpoint_authorization` |
| Tool-generation POSTs | JSON; optional auth/guest behavior | Cross-origin browser fetch preflights; a denied origin cannot send this JSON shape, while non-browser clients are unaffected by CORS | `frontend/src/lib/api/client.ts:normalizeBody,request`; `backend/app/routers/resume.py:analyze`; `backend/app/routers/job_match.py:match`; `backend/app/routers/cover_letter.py:generate`; `backend/app/routers/interview.py:questions,practice_feedback`; `backend/app/routers/career.py:recommend`; `backend/app/routers/portfolio.py:recommend` |
| Job import and telemetry POSTs | JSON; no auth dependency and cookies are ignored | Cross-origin browser fetch preflights; a denied origin cannot send this JSON shape, while non-browser clients remain able to call the rate-limited endpoint | `frontend/src/lib/api/client.ts:normalizeBody,request`; `frontend/src/lib/telemetry/client.ts:trackTelemetry`; `backend/app/routers/job_posts.py:import_job_url`; `backend/app/routers/telemetry.py:ingest_event` |
| `/files/parse-cv` | Browser-generated multipart `FormData`; no auth dependency and cookies are ignored | Safelisted multipart requests may be sent without preflight; CORS prevents reading a disallowed response but does not stop parser work | `frontend/src/lib/api/client.ts:47-52`; `backend/app/routers/files.py:parse_cv_endpoint` |
| History workspace/run PATCH endpoints | Authenticated JSON `PATCH` | Method/content type preflight cross-origin; owner authorization remains mandatory | `backend/app/routers/history.py:update_workspace,toggle_favorite,update_run` |
| History run `DELETE` | Authenticated bodyless `DELETE` | Method preflights cross-origin; owner authorization remains mandatory | `backend/app/routers/history.py:delete_history_item` |
| Admin role mutation | Admin-authenticated JSON `PATCH` | Method/content type preflight cross-origin; admin authorization remains mandatory | `frontend/src/lib/api/admin.ts:adminFetch`; `backend/app/routers/admin.py:set_admin` |

| Flow | Browser/request shape | Compatibility under preserved posture |
|------|-----------------------|----------------------------------------|
| Login/register | Credentialed JSON `POST` from configured frontend (`frontend/src/lib/api/client.ts:request`) | Preflight allowed; Lax auth cookies issued |
| Logout | Credentialed bodyless `POST` (`frontend/src/lib/api/client.ts:logout`) | Configured frontend and non-browser clients work; explicit untrusted origins receive 403 without cookie deletion |
| Silent refresh | Credentialed `POST`; refresh cookie scoped to the exact endpoint (`frontend/src/lib/api/client.ts:silentRefresh`) | Works without a custom CSRF header |
| Google OAuth | Top-level `GET` redirect and callback (`backend/app/routers/google_auth.py:google_login,google_callback`) | Code path is Lax-compatible; deployed state/callback round trip remains unverified |
| Guest tools | JSON `POST` without auth cookies (`frontend/src/lib/api/client.ts:request`) | Preflight allowed from configured frontend; guest behavior unchanged |
| Bearer clients | `Authorization` header (`backend/app/auth/security.py:get_current_user`) | Preflight required in browsers; non-browser API clients remain compatible |

CORS is not treated as authentication or as a complete CSRF defense
(`backend/app/main.py:99-109`,
`backend/tests/test_auth_posture.py:test_allowed_origin_never_replaces_endpoint_authorization`).
SameSite does not isolate sibling origins on the same registrable site, so
production domain ownership and TLS remain trust assumptions under D-UNK-10. A
compromised allowed frontend origin or XSS can act with the user's ambient cookies;
neither a double-submit token nor this posture protects against XSS. This is the
threat-model inference from the configured ambient-cookie and origin boundary
(`backend/app/auth/security.py:set_auth_cookies`,
`backend/app/main.py:99-109`).

Default-origin preflights, authorization independence, one representative JSON
mutation, cookie attributes, production-mode `Secure`, and forced logout are
covered by the named tests in `backend/tests/test_auth_posture.py`:
`test_allowed_frontend_origin_can_preflight_cookie_authenticated_mutations`,
`test_untrusted_origin_cannot_preflight_json_or_authorization_mutations`,
`test_allowed_origin_never_replaces_endpoint_authorization`,
`test_simple_cross_origin_body_cannot_reach_json_account_deletion`,
`test_login_from_allowed_origin_sets_lax_path_scoped_http_only_cookies`,
`test_production_login_adds_secure_without_changing_lax_or_paths`,
`test_bodyless_cross_origin_logout_is_rejected_without_cookie_deletion`, and
`test_logout_allows_configured_frontend_and_non_browser_clients`.
Post-exchange OAuth redirects and cookies are covered by
`backend/tests/test_google_oauth.py:test_link_accepts_verified_email`, but the
external state round trip is not. Cookie-backed authorization and owner isolation
remain covered by `backend/tests/test_auth.py:test_logout_clears_cookie_backed_session`
and `frontend/e2e/auth-ownership.spec.ts`.

Before #75 can close, a human must supply or verify the deployed frontend URL,
backend URL, `CORS_ORIGINS`, `FRONTEND_URL`, `GOOGLE_REDIRECT_URI`, and end-to-end
TLS. A staging browser check must then prove credentialed CORS, cookie delivery,
OAuth state/callback compatibility, refresh, logout, and representative protected
JSON, multipart, PATCH, and DELETE mutations. Forced cross-site logout is mitigated
by the accepted explicit-Origin guard
(`backend/app/config.py:19-20,34-36`,
`backend/app/routers/google_auth.py:google_login`,
`frontend/railway.toml:5-6`, D-UNK-10).

#### Rollback and supersession

The logout endpoint now rejects explicit origins outside the configured
CORS/frontend allowlist. Rolling it back restores forced cross-site logout but
requires no database, cookie, token, or session migration. SameSite=Lax and the
remaining JSON/CORS posture are unchanged. Any broader CSRF control must be
accepted in `docs/decisions.md` and ship with compatibility tests for login,
logout, refresh, OAuth, guest tools, and bearer clients.

### 7.6 Password Hashing

Uses bcrypt via `bcrypt.hashpw` / `bcrypt.checkpw` with auto-generated salts.

— `backend/app/auth/security.py:17-26`

### 7.7 Password Reset Token Design

The reset token signing secret is derived as:
```
SECRET_KEY + ":reset:" + password_hash[:16]
```

This means a reset token is automatically invalidated once the password changes —
no token blacklist needed. New links keep the token in the URL fragment:
```
{FRONTEND_URL}/reset-password#token=TOKEN
```
The frontend consumes and removes the fragment after hydration, so the token is
not sent to the frontend server, access logs, or HTTP Referer headers. Legacy
`?token=` links remain accepted during rollout and are removed with
`history.replaceState` after hydration.

— `backend/app/auth/security.py:69-71`
— `backend/app/routers/auth.py:request_password_reset`
— `frontend/src/pages/reset-password-page.tsx`

### 7.8 Email Verification

- Password registration: No email verification required. Account is immediately
  usable.
- Google OAuth: Uses Google's `email_verified` claim. Unverified Google emails
  are blocked from linking to existing accounts.
- Disposable email blocking: `DISPOSABLE_EMAIL_BLOCK_ENABLED=True` blocks 70+
  domains.
  — `backend/app/auth/email_blocklist.py`

### 7.9 Account Deletion

`POST /auth/me/delete` requires email confirmation (case-insensitive match),
clears auth cookies, deletes all owner-scoped `evidence_items`, `tool_runs`, and
`workspaces`, then deletes the `users` row in a single transaction. PostgreSQL
also enforces `ON DELETE CASCADE` for evidence items.

— `backend/app/routers/auth.py:me_delete`
— `backend/app/services/tool_runs.py:delete_all_user_data:20-32`

---

## §8 Backend Processing Pipeline

### 8.1 Shared Tool Pipeline

All six tool endpoints route through `run_tool_pipeline()`, which coordinates:

1. Optional authentication via `get_optional_current_user()`
2. Input validation via Pydantic schema (in router before pipeline call)
3. Prompt injection sanitization via `sanitize_user_input()` on resume, JD, and feedback
4. Content-hash-based cache lookup (user-scoped, skipped when feedback present)
5. Service invocation (LLM call or heuristic fallback)
6. Authenticated persistence to `tool_runs` table (skipped for guest runs)
7. Common response envelope construction via `build_tool_response()`

— `backend/app/services/tool_pipeline.py:run_tool_pipeline`

### 8.2 Input Sanitization

All user-controlled text (resume, job description, feedback) passes through
`sanitize_user_input()` before reaching the LLM. The sanitizer applies 17 regex
patterns to strip known injection markers, including:
- System prompt delimiters and role-switching tokens
- Instruction-injection patterns (e.g., "ignore previous instructions")
- Markdown/markup injection artifacts

— `backend/app/services/input_sanitizer.py`

### 8.3 In-Process Result Cache

- **Key:** SHA-256 hash of `(tool_name, resume.strip().lower(), jd.strip().lower(), extra_params)`
- **User scope:** Authenticated users have a separate hash namespace from guests
- **TTL:** `RESULT_CACHE_TTL_SECONDS` (default 3600s)
- **Storage:** In-memory Python `dict` — does not survive process restarts or share across instances
- **Skip conditions:** Cache bypassed when `feedback` param is present

— `backend/app/services/result_cache.py`
— `backend/app/config.py:RESULT_CACHE_TTL_SECONDS, RESULT_CACHE_ENABLED`

### 8.4 LLM Integration

- **Provider:** Vertex AI Gemini 2.5 Flash (configurable via `LLM_PROVIDER` and `LLM_MODEL`)
- **Auth:** Vertex: Application Default Credentials via `vertexai.init(project, location)`; Google: API key via `GOOGLE_API_KEY`
  — `backend/app/services/ai_client.py:15-25`
- **Timeout:** 120s per call
- **Retry:** 4 retries with exponential backoff (5s → 10s → 20s → 40s) + jitter
- **Data sent:** System prompt + user prompt (resume text, JD, parameters) — no user IDs, emails, or metadata
- **Temperature:** 0.3
- **Response format:** JSON with markdown-fence fallback parsing

— `backend/app/services/ai_client.py`

### 8.5 File Upload & Parsing

- **Endpoint:** `POST /files/parse-cv`, rate-limited at 20/min
- **Bounded read:** the 10 MB product limit is enforced while reading 64 KiB
  chunks; the reader stops after the first over-limit chunk rather than buffering
  the remainder (`backend/app/services/cv_upload.py:_read_bounded`,
  `backend/tests/test_cv_upload.py:test_upload_size_is_enforced_while_chunks_are_read`)
- **Three-way type agreement:** extension, declared MIME, and magic bytes must all
  identify the same PDF or DOCX format
  (`backend/app/services/cv_upload.py:read_validated_cv_upload`,
  `backend/tests/test_files.py:test_parse_cv_rejects_declared_mime_that_disagrees_with_pdf_extension`)
- **DOCX container bounds:** required package members, safe member paths, no
  encrypted entries, at most 2,000 files, 10 MB per entry, 50 MB total expansion,
  and a maximum 100:1 compression ratio
  (`backend/app/services/cv_upload.py:_validate_docx_container`,
  `backend/tests/test_cv_upload.py:test_docx_requires_expected_package_members,test_docx_rejects_unsafe_paths,test_docx_rejects_excessive_file_count,test_docx_rejects_excessive_expansion,test_docx_rejects_suspicious_compression_ratio,test_docx_rejects_encrypted_members`)
- **PDF bounds:** encrypted files are rejected, page count is capped at 100, and
  extracted text across PDF/DOCX is capped at 2,000,000 characters
  (`backend/app/services/cv_parser.py:_extract_pdf,_bounded_text_parts`,
  `backend/tests/test_cv_parser.py:test_pdf_rejects_encrypted_documents,test_pdf_rejects_excessive_page_count,test_pdf_rejects_excessive_extracted_text,test_docx_rejects_excessive_extracted_text`)
- **Parser isolation:** parsing runs in a spawned worker with an 8-second wall
  timeout on every platform, a 6-second CPU limit on Unix, and a 512 MB
  address-space limit on the Linux production target; Windows skips unavailable
  Unix `resource` controls but retains process and wall-time isolation. Timeout,
  crash, limit, malformed, and parser errors collapse to a generic rejection
  (`backend/app/services/cv_parser_process.py:parse_cv_isolated,_apply_resource_limits`,
  `backend/tests/test_cv_parser_process.py:test_isolated_parser_terminates_worker_at_wall_clock_timeout,test_isolated_parser_cleans_pipes_when_process_start_fails,test_isolated_parser_maps_spawned_worker_crash_to_rejection,test_linux_worker_sets_cpu_and_memory_limits,test_windows_worker_skips_unavailable_unix_resource_module`)
- **Resource cleanup:** the router closes `UploadFile` in `finally`, PyMuPDF closes
  documents in `finally`, DOCX buffers use a context manager, and timed-out workers
  are terminated and joined
  (`backend/app/routers/files.py:parse_cv_endpoint`,
  `backend/app/services/cv_parser.py:_extract_pdf,_extract_docx`,
  `backend/app/services/cv_parser_process.py:_parse_cv_isolated_sync,_terminate`,
  `backend/tests/test_files.py:test_parse_cv_closes_upload_resource_on_rejection`)
- **Storage:** validated bytes remain transient and never touch disk
  (`backend/app/services/cv_upload.py:_read_bounded`,
  `backend/app/services/cv_parser_process.py:_parse_cv_isolated_sync`).
- **Rollback:** the change has no database or persisted-payload impact. Reverting
  the upload/parser service and tests restores the old parser path; clients must
  continue treating 400 and 413 details as user-facing errors rather than stable
  machine codes (`backend/app/routers/files.py:parse_cv_endpoint`,
  `backend/app/services/cv_upload.py:CvUploadRejected`,
  `backend/app/services/cv_parser_process.py:CvParserProcessRejected`).

### 8.6 Scraper & SSRF Protections

- **Endpoint:** `POST /job-posts/import-url`, rate-limited at 10/min
- **URL restriction:** HTTP or HTTPS on their standard ports only; embedded
  credentials, malformed/alternate numeric IPs, and unresolved hosts fail closed
- **DNS-level SSRF guard:** Resolves hostname to all IPs; blocks any IP that is
  private, loopback, link-local, or reserved (`ipaddress.ip_address.is_*`)
- **Connect-time enforcement:** Each hop connects to an IP selected from that
  validated DNS result while preserving the original hostname for the Host header
  and TLS SNI; environment proxies are disabled
- **Redirect re-validation:** Each redirect target is resolved, checked, and pinned
  independently (max 5 redirects)
- **Response bounds:** Only HTML/XHTML responses up to 2 MB are accepted, including
  streamed-body enforcement when `Content-Length` is absent or false
- **Tier 1:** IP-pinned `httpx.AsyncClient` with 5.0s timeout; HTML parsed with
  BeautifulSoup (`bs4`) for title, company, and description extraction
- **Tier 2:** Playwright headless Chromium with 10s timeout renders pages through
  intercepted navigation, script, stylesheet, fetch, and XHR requests fulfilled by
  the pinned HTTP client; fonts, images, media, WebSockets, non-GET requests, and
  requests beyond the 50-request/10 MB browser budget are aborted
- **Tier 3:** Graceful failure with paste-textarea prompt

— `backend/app/services/job_scraper.py:_resolve_public_target`,
`backend/app/services/job_scraper.py:_fetch_resource_with_httpx`,
`backend/app/services/job_scraper.py:_fetch_with_playwright`;
`backend/tests/test_job_scraper.py`

### 8.7 Evidence Profile Store, Export & Adoption Telemetry

The R11 Evidence Profile (#143, ADR 0005) is a per-user, server-side store of
typed career claims (`evidence_items`), each carrying provenance and
confirmation state (D-061/D-062). It is the product's first durable store of
user-confirmed sensitive career content and is asset #8 in §4. Three surfaces
carry security/privacy weight:

**Store & access.** Every endpoint (§6.3) is authenticated-owner-only:
`get_current_user` scopes each query to the caller and there are no anonymous
profile rows (D-064). Guests keep tab-scoped inline inputs only. Content lives in
`evidence_items.content` (JSON) and is never written to logs, telemetry, or the
model provider prompt except as confirmed locked facts routed through the shared
pipeline (D-063).

**Export surface (bulk read).** `GET /evidence-profile/export` (#149) returns the
owner's *entire* profile in one machine-readable payload — the highest-value
single read in the product. It is owner-scoped (reuses the same list query, so it
cannot reach across accounts) and rate-limited at **5/min**, matching the
`POST /auth/me/delete` ceiling, to bound scripted exfiltration if a session token
is stolen. The export is the product's first full-user-data export surface;
R3's outcome may extend it beyond the profile.

**Deletion cascade.** Item- and profile-level deletions are immediate
(`DELETE /evidence-profile/items/{id}`; D-065). Account deletion removes all
owner-scoped `evidence_items` inside the same single transaction as
`tool_runs`/`workspaces`/`users` (`delete_all_user_data`, §7.9), with PostgreSQL
`ON DELETE CASCADE` as a second line of defense. The account-deletion cascade
uses a bulk delete and deliberately emits no per-item adoption telemetry, so
erasure produces no residual event trail keyed to the departing user.

**Adoption telemetry (allowlisted).** Profile create/edit/confirm/reject/delete
actions emit backend-only events through the same first-party write seam as R6/R10
(`record_activation_event`), carrying only three closed-set, low-cardinality
dimensions — item kind, provenance class, and the resulting confirmation-state
transition — plus bounded aggregate counts. `extra="forbid"` on the allowlist
rejects any attempt to attach `content`, a statement, an employer/institution
name, or a stable item id before a row is written (D-067). No evidence content is
reachable from the admin profile-adoption view (§6.4 admin surface), which reports
only counts by kind, provenance, and confirm/reject decision.

— `backend/app/routers/evidence_profile.py`;
`backend/app/services/evidence_profile.py`;
`backend/app/services/tool_runs.py:delete_all_user_data`;

### 8.8 Dormant CV Document Store and Variants

R12 #153 adds a dark, authenticated-only structured CV store under the explicit
owner build-ahead override recorded in `docs/state.md`. Every API query is scoped by
both document id and the authenticated user's id. Each factual entry must reference
a `confirmed` Evidence Profile item owned by the same user; foreign, unconfirmed,
rejected, and missing references fail validation without revealing which condition
applied.

The editable draft lives in `cv_documents.sections`. Creation also records an
immutable `Base` snapshot and later named snapshots live in `cv_variants.sections`;
restore copies a snapshot into the working draft and never updates the snapshot.
Single-document and all-document deletion are immediate and owner-scoped. The R11
machine-readable `career-data-export/v1` export now includes the full document store and every immutable
variant under one Pydantic/Zod-mirrored schema; it remains owner-scoped and
rate-limited to 5/minute. Account deletion explicitly removes variants and documents
in the existing single transaction, reports separate document and variant counts in
the deletion audit, and retains PostgreSQL `ON DELETE CASCADE` as a second line of
defense. Studio telemetry uses closed event names only: the write schema rejects CV
content, job/evidence/generated text, titles, and document/run identifiers. The
existing request/Sentry scrubbing boundary still applies. R12 #155 adds an authenticated `/cv-studio` route over
these owner-scoped APIs. Guest and unresolved sessions never start document
queries; a guest receives the existing sign-in intent instead. The editor keeps
content in React/query memory only, serializes autosave writes to prevent stale
draft commits, and emits no content telemetry. Its navigation entry is the
seventh editor surface under the temporary build-ahead override; it is not a
public landing promotion and does not close D-068.

— `backend/app/routers/cv_documents.py`;
`backend/app/services/cv_documents.py`;
`backend/app/services/tool_runs.py:delete_all_user_data`;
`backend/app/schemas/analytics.py` (profile-event allowlist);
`backend/tests/test_evidence_profile.py`;
`frontend/src/components/cv-studio/CvStudio.tsx`

### 8.9 Dormant Reviewed CV Import

R12 #154 extends the authenticated-only CV API without adding a frontend surface.
PDF, DOCX, and UTF-8 plain text pass the bounded 10 MB upload reader; PDF/DOCX keep
their magic/container checks and text rejects invalid UTF-8 and NUL bytes. Flat text
extraction and deterministic section/entry/claim structuring both execute in the
existing spawned parser process with the same wall-clock, CPU, memory, page, and
extracted-character caps. Validated bytes and review proposals are transient.

Discard requires no server write. Explicit accept performs one database transaction:
it creates the CV document/Base snapshot and one `imported`, `unconfirmed` Evidence
Profile item per retained claim. A transient proposal carries an opaque import id;
the accepted document stores it under an owner-scoped unique constraint, so retries
and concurrent replay return one document without duplicating claim rows. The
ordinary document create/update APIs still
require confirmed owner evidence; this narrow import path preserves pending imported
references so review cannot silently become confirmation (D-062/D-070). Upload,
archive-expansion, invalid/encrypted input, and timeout responses use bounded
actionable categories and never echo parser exceptions or resume text. The routes
remain owner-authenticated and emit no content telemetry.

— `backend/app/routers/cv_documents.py`;
`backend/app/services/cv_upload.py`;
`backend/app/services/cv_parser_process.py`;
`backend/app/services/cv_documents.py`;
`backend/tests/test_cv_import.py`

R12 #157 adds target-job tailoring at the same authenticated owner boundary.
Generation passes only through `run_tool_pipeline()` and receives confirmed facts
through the locked Evidence Profile seam. A separate durable ten-attempt document
quota is consumed before provider work. Each transient proposal carries an HMAC
over its owner, document, target, and diffs; apply rejects altered or cross-owner
payloads. Accepted supported changes create an immutable variant under a durable
owner/document request key and never mutate the draft. Unsupported changes require
the ordinary R11 create-unconfirmed → explicit-confirm → regenerate lifecycle; no
local override can confirm or launder a claim. No CV, job, diff, or evidence content
is logged or emitted as telemetry.

R12 #158 adds two sensitive bulk-read/export boundaries. Template rendering accepts
only one of the three closed template ids and normalizes the owner-scoped structured
document into `cv-render/v1`; template code never receives an upload or arbitrary
markup. PDF/DOCX generators consume only that normalized render model, set private
no-store responses, and validate text, links, page boundaries, and own-parser
re-import before evidence is reported. The parser boundary remains subprocess-
isolated and resource-capped for both user imports and generated-artifact validation;
generated files do not bypass upload/container/text bounds. Artifact routes scope the
document before rendering and never accept a filename, filesystem path, HTML, CSS, or
template body from the caller. Rollback is additive: disabling the studio router and
navigation removes the capability without changing the six tools; persisted rows stay
available for export/deletion, and quota counters remain durable.

---

## §9 External Integration Boundaries

### 9.1 Vertex AI / Gemini

| Concern | Detail |
|---------|--------|
| What is sent | System prompt + user prompt (resume, JD, parameters) |
| What is NOT sent | User IDs, emails, IPs, any PII or metadata |
| Auth mechanism | Application Default Credentials (production) or API key (dev) |
| Network path | HTTPS to `{location}-aiplatform.googleapis.com` |
| Failure mode | Tool-specific fallback (heuristic for Resume/Job Match, explicit error for generative tools) |
| Logging | Duration and failure category logged; full prompts NOT logged |

### 9.2 Playwright (Scraper Fallback)

| Concern | Detail |
|---------|--------|
| What is sent | Browser-requested HTML, scripts, stylesheets, and JSON are fetched by the bounded IP-pinned HTTP client; media/font/image/WebSocket traffic is denied |
| Auth mechanism | None — requests as headless Chromium |
| Network path | Every allowed browser request is intercepted and fulfilled by the HTTP client connected to a validated, pinned public IP |
| Sandboxing | Chromium sandbox within container |
| Failure mode | 10s timeout → falls through to graceful textarea fallback |

— `backend/app/services/job_scraper.py:_fetch_with_playwright`;
`backend/tests/test_job_scraper.py:test_playwright_renders_pinned_html_without_direct_network`

### 9.3 Resend (Email)

| Concern | Detail |
|---------|--------|
| What is sent | Recipient email + reset URL containing JWT token |
| Auth mechanism | `RESEND_API_KEY` env var |
| Network path | HTTPS to `api.resend.com` |
| Failure mode | Background task; generic failure category is logged and sent to Sentry without recipient, reset URL, or provider exception text; user always sees success |

— `backend/app/services/email_service.py`

### 9.4 Google OAuth

| Concern | Detail |
|---------|--------|
| What is sent | Redirect to Google with state param; callback receives authorization code |
| Auth mechanism | `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` |
| Network path | HTTPS to `accounts.google.com` |
| Scopes | `openid email profile` |
| State | Stored in `SessionMiddleware` server-side cookie |

— `backend/app/routers/google_auth.py`

### 9.5 Sentry

| Concern | Detail |
|---------|--------|
| What is captured | Error stack traces, request metadata (scrubbed), performance traces (10% sample) |
| What is scrubbed | Request body, cookies, query strings, auth/cookie headers, entire user context; frontend fetch/XHR breadcrumb bodies |
| Opt-in behavior | Sentry SDK only initializes if `SENTRY_DSN` env var is set (empty by default) |
| Backend scrubbing | `_scrub_sentry_event()` — `backend/app/main.py:37-65` |
| Frontend scrubbing | Tested `beforeSend` + `beforeBreadcrumb` hooks — `frontend/src/lib/observability/sentryPrivacy.ts` |

### 9.6 Railway PostgreSQL

Access via `DATABASE_URL` env var. Connection pooling: `pool_size=20` in
production + `max_overflow=10`, with `pool_pre_ping=True`. Migrations run via
Alembic on deploy.

— `backend/app/database.py:9-29`
— `backend/alembic/env.py`

---

## §10 Observability & Telemetry

### 10.1 Backend Structured Logging

All log lines are single-line JSON objects emitted to stdout. Key events:

| Event | Fields | Level |
|-------|--------|-------|
| `tool_run_started` | tool_name, access_mode, linked_context_count | info |
| `tool_run_completed` | tool_name, access_mode, duration_ms, saved | info |
| `tool_run_failed` | tool_name, access_mode, duration_ms, failure_category | error |
| `user_account_deleted` | user_id, runs_deleted, workspaces_deleted, user_record_deleted | info |
| `frontend_telemetry` | Allowlisted event/category enums, tool/access mode, booleans, timestamp, and explicit low-cardinality dimensions | info |
| `profile_item_*` (adoption) | Backend-only; item kind, provenance class, confirmation-state transition, bounded counts — never evidence content, employer/institution names, or content ids (D-067) | info |

**Deliberately NOT logged:** Resume text, job descriptions, generated content,
passwords, tokens, cookies, email addresses, IP addresses, provider exception
messages, full imported URLs, frontend error messages, run IDs, and workspace IDs.
Deletion-audit `user_id` necessity and retention remain owned by #74.

— `backend/app/services/observability.py`

### 10.2 Frontend Telemetry

- **Transport:** `navigator.sendBeacon()` with `application/json` Blob; fallback to
  `fetch` with `keepalive: true`
- **Endpoint:** `POST /api/v1/telemetry/events` (rate-limited at 60/min)
- **Consent gate:** Skipped if `getStoredConsent() === 'rejected'`
- **Schema:** Unknown fields are rejected. The contract has no arbitrary metadata,
  raw error-message, route, history-ID, workspace-ID, resume, job-description, or
  generated-content field.
- **Event names:** `landing_page_viewed`, `tool_run_started`, `tool_run_succeeded`,
  `tool_run_failed`, `result_page_loaded`, `result_page_cache_miss`,
  `export_action_used`, `workspace_resumed`, `frontend_error`, `tool_regenerate`,
  `auth_signup_source`, `workflow_continued`
- **Deliberately excluded:** Resume text, job descriptions, user emails, PII

— `frontend/src/lib/telemetry/client.ts`

### 10.3 PostHog — NOT Active

PostHog environment variables exist in `/frontend/.env`:
```
VITE_PUBLIC_POSTHOG_PROJECT_TOKEN=...
VITE_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
VITE_PUBLIC_POSTHOG_INGESTION_HOST=/ingest
```

And the frontend Dockerfile declares them as build args. However:
- `posthog-js` is not in `package.json`
- No `posthog` imports exist in `src/`
- The Vite proxy to PostHog is present in `vite.config.ts:22-27` but unused
- `CookiePolicyPage.tsx` explicitly states: *"Right now, Career Workbench does
  not load any analytics or advertising cookies."*

**Status:** Infrastructure present but SDK is not activated. See D-UNK-4.

### 10.4 Google AdSense — Client Ad/Unlock Path Removed

The dormant client-only advertising path has been removed (R9 #127, D-051). The
former result wrapper (`AdGatedLock`) invoked `useAd()` before its thesis-demo early
return; `useAd()` rejected only explicit consent state `rejected`, so both `pending`
and `accepted` continued through ad-blocker detection and could load the AdSense
script when `VITE_AD_CLIENT_ID` was configured. That code was unsafe to retain as a
disabled state and structurally incompatible with the server-authoritative access
decision D-048 requires, so it was deleted rather than left dormant.

Removed together: the result wrapper, the ad loader / ad-blocker detection
(`useAd`), the sessionStorage `ad-unlocked:{runId}` unlock hook (`useAdUnlock`), the
countdown fallback (`AdCountdownTimer`), their CSS, and the ad/countdown telemetry
event names (`ad_shown`, `ad_completed`, `ad_blocked`, `countdown_completed`) and
`unlock_method` field on both the frontend and backend contracts. Result content now
renders directly; no advertising vendor script is injected for any consent state.
No AdSense client id is declared or injected by the Dockerfile or any tracked
environment example. Any future monetization must land through the server-
authoritative access seam (D-048, ADR 0003); it may not reuse a client-only gate.

— removed from `frontend/src/components/tooling/`, `frontend/src/hooks/`,
`frontend/src/lib/telemetry/client.ts`, `backend/app/schemas/telemetry.py`

---

## §11 Attacker Model & Abuse Cases (Ranked by Impact × Likelihood)

| Rank | Abuse Case | Trust Boundary | Impact | Current Mitigation | Gap |
|------|------------|----------------|--------|--------------------|-----|
| 1 | **Unauthenticated LLM cost abuse** | API → Vertex AI | High — uncontrolled model spend | Distributed per-route bursts plus a shared hourly model-cost ceiling keyed by HMAC-pseudonymized account/IP identity | CAPTCHA remains evidence-triggered; distributed storage URL and capacity require deployment verification |
| 2 | **Credential stuffing / brute force** | API → Auth | Medium-High — account takeover | Distributed login limit, bcrypt hashing, expiring pseudonymized failure counters, bounded progressive delay after three failures | No password composition requirements; delay is intentionally capped and never hard-locks an account |
| 3 | **SSRF via job URL import** | API → Internet | Medium — internal network access | All-answer IP checks, per-hop DNS pinning, redirect re-validation, browser network denial, response type/size bounds | Public endpoints can still return attacker-controlled HTML; extraction remains best-effort and intentionally unauthenticated |
| 4 | **Session hijacking (cookie theft)** | Browser → API | High — full account access | HttpOnly cookies, SameSite=Lax, Secure in production | No token binding; refresh token lives 7 days; no device/session fingerprinting |
| 5 | **Persistent XSS via stored/generated content** | DB → Browser | Medium — session theft, credential capture | Tool output is rendered in React (auto-escaped), no raw HTML insertion; the frontend CSP denies objects and framing and limits script origins | Generated content includes untrusted LLM output; the SSR-compatible CSP currently permits inline scripts; no output sanitization beyond React defaults |
| 6 | **Malicious file upload** | Browser → API | Medium — DoS, parser exploitation | 10MB limit, magic byte validation, PDF/DOCX only | No page count limit; no ZIP bomb protection for DOCX; PyMuPDF processes arbitrary PDFs |
| 7 | **Prompt injection to extract system prompts or influence outputs** | API → Vertex AI | Low-Medium — output manipulation | 17 regex patterns in `input_sanitizer.py` | Regex cannot block all injection vectors; no system prompt hardening / delimiters |
| 8 | **Account enumeration** | API → Auth | Low — privacy | Login/register return distinct errors; password reset always returns 200 | Login says "Invalid email or password" (ambiguous), but registration says "Email already registered" (distinct) |

---

## §12 Privacy Failure Modes (Ranked by Impact)

| Rank | Failure Mode | Affected Asset | Current Protection | Gap |
|------|-------------|----------------|-------------------|-----|
| 1 | **Resume/JD leakage via logs or error reports** | Resume text, generated content | Sentry drops bodies, breadcrumb payloads, query strings, credentials, and user context; telemetry rejects unknown/content fields; model/import/email/OAuth failures log only generic categories | Sentry stack traces still expose code paths; processor enablement and retention remain unverified |
| 2 | **Generated content accessible to wrong user** | ToolRun results | User-scoped cache keys; DB queries filter by `user_id` | In-memory cache key includes user scope; no cross-user access observed in code — confidence is high but only code-audit, not penetration-test, verified |
| 3 | **Browser storage persistence after logout** | sessionStorage data | Tab-scoped sessionStorage clears on tab close; localStorage consent stays | Logout clears pending intent, invalidates query cache, but does not clear tool drafts, workflow context, demo results, or resume-carry from current tab's sessionStorage |
| 4 | **Password reset link exposure** | Reset token | New links use a fragment that is scrubbed after hydration; single-use password-hash-derived signing invalidates the token on password change | Legacy query-token links remain accepted temporarily for rollout compatibility and are scrubbed client-side |
| 5 | **Account deletion — data reappears from backup** | All user data | Cascading delete in single transaction; structured log emitted; no backups exist during thesis-demo phase, so no restore-reappearance risk currently | Before R5/beta launch, the accepted backup + restore procedure (D-032) must document how deletions are honored across a restore |
| 6 | **Incomplete account deletion** | User data | `delete_all_user_data()` deletes `evidence_items`, `tool_runs`, `workspaces`, and `users`; PostgreSQL independently cascades profile rows | No verification query after deletion; no audit trail beyond structured log event; if Sentry is active, previously-captured events remain in Sentry's retention window |

---

## §13 Current Behavior vs. Intended Deployment (Gap Inventory)

| # | Gap | Current | Intended | Risk | Owned By |
|---|-----|---------|----------|------|----------|
| 1 | Distributed limiter deployment unverified | Code rejects local storage outside development | Configure and capacity-test shared storage | Misconfiguration prevents startup; backend outage fails limited routes closed | #76 / #81 |
| 2 | In-memory result cache | Python dict, process-local | Redis or similar shared cache if scaling requires it | Fragmented caches in multi-instance; lost on restart | R10 |
| 3 | Docker runtime users | Frontend runs as the base image's `node` user; backend runs as dedicated UID 10001 with owned application and Playwright files | Non-root user with minimal capabilities | Image-build verification remains required where Docker is available | #81 |
| 4 | No dormant-account TTL cleanup | Data persists indefinitely while an account exists; deletion is user-initiated only | Accepted as final posture (D-031) — no automated cleanup planned | None; user-initiated erasure satisfies GDPR right-to-erasure | #74 (resolved) |
| 5 | No automated backups | No backup scripts, no cron jobs | Railway managed automated backups + rehearsed restore procedure, required before beta launch | Data loss on Railway incident until R5 lands the backup + restore rehearsal | #74 (resolved) / R5 |
| 6 | PostHog infrastructure present, SDK inactive | Build args + env vars + proxy config exist | Decision: activate PostHog OR remove dead config | Confusion about active processors; CookiePolicyPage claims no analytics but proxy exists | #82 |
| 7 | No email verification on password registration | Account immediately usable | Email verification before first tool use | Spam accounts, wrong-email lockouts | #75 |
| 8 | Low-cost endpoints remain unlimited | `GET /auth/me`, `POST /auth/logout`, `GET /auth/providers`, history GET/PATCH/DELETE | Add limits only if availability evidence shows abuse | Broad limiting can degrade normal authenticated navigation | R10 |
| 9 | Password reset URL exposure | New links use `#token=...`; the page consumes and scrubs fragment and legacy query tokens | Remove legacy query compatibility after the reset-token lifetime and rollout window | Old links can retain tokens in pre-existing browser history | #75 |
| 10 | CAPTCHA coverage is registration-only | Evidence can identify route-specific abuse, but the existing challenge contract covers registration | Add a reviewed challenge contract only to the attacked flow | Unconditional CAPTCHA harms access; unsupported activation would break clients | #76 follow-up if threshold triggers |
| 11 | Login error message distinction | "Invalid email or password" (ambiguous) | Same message for both cases (no enumeration) | Registration says "Email already registered" — enables enumeration | #75 |
| 12 | Dormant client ad/unlock path removed | `AdGatedLock`/`useAd`/`useAdUnlock`/`AdCountdownTimer`, their CSS, the `ad-unlocked:{runId}` key, and the ad/countdown telemetry names + `unlock_method` field are deleted; result content renders directly with no vendor script for any consent state (R9 #127) | Any future monetization uses the server-authoritative access seam with explicit candidate-specific consent, never a client-only gate (D-048, ADR 0003) | None from this path today; future agents must not revive a bypassable client gate | R9 / D-051 (resolved) |

---

## §14 Unknowns Requiring Human Decisions

Per D-116 (2026-07-10), the remaining rows below are production/staging **evidence
items** collected by the R3 Evidence Checklist in `docs/launch-checklist.md` during
the R5 staging rehearsal — except the narrowed D-UNK-5, which is a human decision.

| ID | Question | Impact | Required For |
|----|----------|--------|--------------|
| D-UNK-1 | What are the production values for `TRUST_PROXY_HEADERS` and `TRUSTED_PROXY_CIDRS`? | Rate limiter IP resolution depends on correct proxy trust | #76 |
| D-UNK-2 | What is the Railway PostgreSQL connection pool ceiling? | Current `pool_size=20, max_overflow=10` may need adjustment | #76 |
| D-UNK-3 | Is the production deployment 1 replica or more? | Affects cache and rate limiter correctness | #76, #81 |
| D-UNK-8 | What is the scope of the Google Cloud service account / API key permissions? | Limits blast radius of credential compromise | #79 |
| D-UNK-9 | Are there any additional production environment variables not in `.env.example`? | Complete attack surface enumeration | #81 |
| D-UNK-10 | What are the deployed frontend/backend domains, their registrable-site relationship, and is TLS configured end-to-end? | Cookie delivery, credentialed CORS, OAuth redirects, and HSTS viability | #75, #81 |

### Resolved

| ID | Resolution |
|----|-----------|
| D-UNK-4 | Resolved 2026-07-10 by D-117: production launches with `SENTRY_DSN` unset; enabling Sentry later requires R5 staging scrub verification first. |
| D-UNK-5 (product side) | Resolved 2026-07-10 by D-118: PostHog is not activated and is not a processor going forward; remnant proxy/configuration is removed as cleanup. |
| D-UNK-5 (historical data) | Resolved 2026-07-10 by D-119: delete the historical PostHog cloud project data without export; user console action tracked by #208. |
| D-UNK-6 | Retention periods accepted 2026-07-07: primary data indefinite until user deletion (D-031), logs use Railway-managed retention (D-033), Sentry events use processor-managed retention (D-034), deletion-audit is the existing structured log line (D-035). |
| D-UNK-7 | Backup posture accepted 2026-07-07: no backups during thesis-demo phase; Railway managed automated backups + a rehearsed restore procedure become required before beta launch (D-032, tracked by R5 in `docs/roadmap.md`). |

---

## §15 Blockers & Dependency Map

Each R3 sub-issue depends on specific sections of this document. Issues are
blocked only by their listed dependencies — all other context is available here.

| Issue | Depends On | Unblocked? |
|-------|-----------|------------|
| #74 — Retention/deletion lifecycle | §§4,12,13,14 — Asset inventory, privacy failures, gaps, unknowns D-UNK-6, D-UNK-7 | Unblocked — resolved by D-031 through D-035 (2026-07-07) |
| #75 — Auth, cookie, CORS, OAuth, CSRF posture | §§2,6,7 — Trust boundaries, API surface, session model | **Partially blocked:** code/default-development posture characterized; deployed origins, CORS/OAuth values, TLS, and staging browser evidence remain under D-UNK-10 |
| #76 — Distributed abuse and ATO controls | §§6,11,13 — API surface with rate limits, abuse cases, gaps #1,#2,#8,#10 | Unblocked (code evidence complete) |
| #77 — Browser storage minimization | §§4,5,12 — Asset inventory, storage inventory, privacy failure modes | Unblocked (code evidence complete) |
| #78 — Telemetry, Sentry, logs, deletion audit | §§10,12,13 — Observability, privacy failures, gaps #6 | Unblocked (code evidence complete; D-UNK-3 may affect) |
| #79 — Upload boundaries & parser resource limits | §8.5 — File upload handling | Unblocked (code evidence complete) |
| #80 — Scraper SSRF hardening | §§8.6,9.2 — Scraper implementation, Playwright integration | Unblocked (code evidence complete) |
| #81 — Deployment-compatible security headers | §§1,13 — Topology, gap inventory (#3, #6) | Frontend response implementation locally verified; production compatibility remains blocked by D-UNK-1, D-UNK-3, D-UNK-5, D-UNK-9, D-UNK-10 |
| #82 — Legal disclosure reconciliation | All sections + all prior issues | Blocked by #74–#81 |

---

## Verification Record

The following verifications were run against commit `bcbf887d` (chapter2 HEAD at
time of creation) and re-verified after review fixes against commit `aec1a824`.
All claims in this document that reference code paths were confirmed by direct
file inspection.

| Section | Verification | Result |
|---------|-------------|--------|
| §1 | `grep -n "numReplicas" railway.toml frontend/railway.toml` | `railway.toml:12`, `frontend/railway.toml:14` — 1 each |
| §1 | `grep "CMD" backend/Dockerfile` | `uvicorn app.main:app --host 0.0.0.0 --port 8000` |
| §2 | `grep -n "CORS_ORIGINS" backend/app/config.py` | Line 19 |
| §2 | `grep -n "allow_origins\|allow_credentials" backend/app/main.py` | Lines 100-106 |
| §3 | `grep -n "run_tool_pipeline" backend/app/services/tool_pipeline.py` | Primary pipeline function |
| §4 | `grep -n "result_payload\|hashed_password\|google_id" backend/app/models/` | All model fields confirmed |
| §5 | `grep -rn "localStorage\|sessionStorage" frontend/src/ --include="*.ts" --include="*.tsx" -l` | 14 files matched |
| §6 | `grep -rn "@router\.\(get\|post\|patch\|put\|delete\)" backend/app/routers/` | 37 route decorators |
| §6 | `grep -rn "limiter.limit" backend/app/routers/ --include="*.py"` | 24 rate-limit decorators |
| §6 | `grep -n "include_router" backend/app/main.py` | Lines 128-147 |
| §6.6 | `grep -n "_get_client_ip\|TRUST_PROXY_HEADERS" backend/app/limiter.py` | Lines 10-17 |
| §7 | `grep -n "ALGORITHM\|SECRET_KEY" backend/app/config.py` | Lines 17-18 |
| §7 | `grep -n "set_cookie\|delete_cookie\|set_auth_cookies\|clear_auth_cookies" backend/app/auth/security.py` | Lines 95-119 |
| §8 | `grep -n "sanitize_user_input\|_validate_url" backend/app/services/` | sanitizer + scraper guards confirmed |
| §8.6 | `grep -n "BeautifulSoup\|bs4" backend/app/services/job_scraper.py` | Lines 7, 99, 150, 165, 179 |
| §10 | `grep -rn "Sentry.init\|beforeSend\|_scrub_sentry_event"` | Both frontend and backend scrubbing |
| §13 | `grep "USER" backend/Dockerfile frontend/Dockerfile` | No USER instruction in either |
| §13 | `grep "posthog" frontend/package.json` | No match (SDK not installed) |
