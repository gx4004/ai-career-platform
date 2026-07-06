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
env var and relies on Alembic locking for migration safety. However, two critical
subsystems are process-local and would degrade in a multi-instance deployment:

| Subsystem | Current | Multi-Instance Impact |
|-----------|---------|-----------------------|
| Rate limiter | In-memory slowapi dict | Leaks — each instance has independent counters |
| Result cache | In-memory Python dict | Fragmented — no cache sharing between instances |

— `backend/app/services/result_cache.py` (docstring acknowledges this)
— `backend/app/limiter.py` (slowapi default in-memory storage)

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
| SSR → API | HTTP within Railway network | CORS `allow_origins` whitelist (defaults: `localhost:5173,localhost:3000` + `FRONTEND_URL`; `backend/app/config.py:19`, `backend/app/main.py:100-106`), `allow_credentials=True` | Railway internal network is trusted; no mTLS between services |
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
  → Resend email with reset URL: {FRONTEND_URL}/reset-password?token=TOKEN

Browser → POST /auth/password-reset/confirm {email, token, new_password}
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
| 8 | Tool metadata (scores, skill gaps, recommendations) | Medium | `tool_runs.result_payload` | Until deletion | Career profile inference |
| 9 | Workspace labels and structure | Low | `workspaces.label`, `workspaces.is_pinned` | Until deletion | Organizational preference leakage |
| 10 | Behavioral telemetry (event names, routes, timestamps) | Low | Log stdout, Sentry (if enabled) | Undefined (no TTL) | Usage pattern inference |
| 11 | Sidebar state, language preference | None | `sidebar_state` cookie, `app_language` localStorage | 7 days / forever | None |

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
| `career-workbench:draft:{toolId}` | `src/lib/tools/drafts.ts:77` | `{resumeText, jobDescription, ...}` | **High** — full resume + JD text | Tab close | `clearToolDraft()` or tab close |
| `career-workbench:workflow-context` | `src/lib/tools/drafts.ts:97` | `{resumeText, jobDescription, resumeAnalysis, jobMatch, ...}` | **High** — full analysis results | 4 hours / tab close | `clearWorkflowContext()`, TTL, or tab close |
| `cw:demo-result:{id}` | `src/lib/tools/demoRuns.ts:52` | Full `ToolRunDetail` (all LLM output) | **High** — complete tool result | Tab close | `clearTransientResults()` or tab close |
| `cw:resume-carry` | `src/hooks/use-resume-carry.ts:21,35` | Raw resume text (plain string) | **High** — unstructured resume | Tab close | `clearResume()` or tab close |
| `cw:resume-carry-filename` | `src/hooks/use-resume-carry.ts:35` | Filename string | Low | Tab close | `clearResume()` or tab close |
| `ad-unlocked:{runId}` | `src/hooks/useAdUnlock.ts:6,15` | `"1"` flag | None | Tab close | Tab close |
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

All four are tab-scoped (die on tab close, with a 4-hour TTL only on workflow
context). For authenticated users, the same data is also server-persisted in
`tool_runs.result_payload`.

**No localStorage key stores resume text, JD text, or generated content.**
The legacy `auth_token`/`refresh_token` keys were a pre-cookie-only migration
artifact and are deleted on every app mount.

---

## §6 API Surface & Authorization Matrix

All routes are mounted under `/api/v1` in `backend/app/main.py:128-147`.

### 6.1 No Authentication Required (5 endpoints)

| Method | Path | Rate Limit | Purpose |
|--------|------|------------|---------|
| `GET` | `/health` | None | Railway health probe (DB check) |
| `POST` | `/auth/login` | 10/min | Email/password login |
| `POST` | `/auth/register` | 5/min | Account registration |
| `GET` | `/auth/google/login` | None | Google OAuth redirect |
| `GET` | `/auth/google/callback` | None | Google OAuth callback |

### 6.2 Optional Authentication — Guest or Authenticated (10 endpoints)

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
| `POST` | `/files/parse-cv` | 20/min |
| `POST` | `/job-posts/import-url` | 10/min |
| `POST` | `/telemetry/events` | 60/min |

### 6.3 Authentication Required (15 endpoints)

| Method | Path | Rate Limit |
|--------|------|------------|
| `GET` | `/auth/me` | None |
| `POST` | `/auth/refresh` | 20/min |
| `POST` | `/auth/logout` | None |
| `POST` | `/auth/me/delete` | 5/min |
| `POST` | `/auth/password-reset/request` | 3/min |
| `POST` | `/auth/password-reset/confirm` | 10/min |
| `GET` | `/auth/providers` | None |
| `GET` | `/history` | None |
| `GET` | `/history/workspaces` | None |
| `PATCH` | `/history/workspaces/{id}` | None |
| `GET` | `/history/{id}` | None |
| `GET` | `/history/{run_id}/export/pdf` | 10/min |
| `DELETE` | `/history/{id}` | None |
| `PATCH` | `/history/{id}/favorite` | None |
| `PATCH` | `/history/{id}` | None |

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

The following authenticated endpoints have no rate limit:
`GET /auth/me`, `POST /auth/logout`, `GET /auth/providers`, all history
`GET`/`PATCH`/`DELETE` endpoints (except PDF export), and the OAuth endpoints.

### 6.6 Rate-Limit Identity

The limiter keys on `_get_client_ip()` (`backend/app/limiter.py:10`). When
`TRUST_PROXY_HEADERS=False` (the default), it uses `request.client.host` directly
— the immediate TCP peer, which behind Railway's proxy is the proxy IP, not the
real client. When `TRUST_PROXY_HEADERS=True`, it parses `X-Forwarded-For` only if
the immediate peer is a trusted proxy (loopback/private or in
`TRUSTED_PROXY_CIDRS`). Production values for both settings are unknown — see
D-UNK-1.

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

### 7.6 Password Hashing

Uses bcrypt via `bcrypt.hashpw` / `bcrypt.checkpw` with auto-generated salts.

— `backend/app/auth/security.py:17-26`

### 7.7 Password Reset Token Design

The reset token signing secret is derived as:
```
SECRET_KEY + ":reset:" + password_hash[:16]
```

This means a reset token is automatically invalidated once the password changes —
no token blacklist needed. The token URL is:
```
{FRONTEND_URL}/reset-password?token=TOKEN
```
Note: the token appears in the URL query string, meaning it leaks to browser
history, server access logs, and HTTP Referer headers.

— `backend/app/auth/security.py:69-71`

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
clears auth cookies, cascading-deletes all `tool_runs`, `workspaces`, and the
`users` row in a single transaction.

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
- **Size limit:** 10 MB (`MAX_CV_SIZE`)
- **Allowed extensions:** `.pdf`, `.docx` only
- **Magic byte validation:** `%PDF-` for PDF, `PK\x03\x04` for DOCX
- **Extraction:** Entire file read into memory; never touches disk
- **PDF parser:** PyMuPDF (`fitz`) — extracts text from all pages
- **DOCX parser:** `python-docx` — extracts paragraph text

— `backend/app/routers/files.py`
— `backend/app/services/cv_parser.py`

### 8.6 Scraper & SSRF Protections

- **Endpoint:** `POST /job-posts/import-url`, rate-limited at 10/min
- **Scheme restriction:** HTTP or HTTPS only
- **DNS-level SSRF guard:** Resolves hostname to all IPs; blocks any IP that is
  private, loopback, link-local, or reserved (`ipaddress.ip_address.is_*`)
- **Redirect re-validation:** Each redirect target is re-validated by
  `_validate_url()` (max 5 redirects)
- **Tier 1:** `httpx.AsyncClient` with 5.0s timeout; HTML parsed with BeautifulSoup
  (`bs4`) for title, company, and description extraction
- **Tier 2:** Playwright headless Chromium with 10s timeout; every
  navigation/sub-resource passes through `_validate_url()` route guard
- **Tier 3:** Graceful failure with paste-textarea prompt

— `backend/app/services/job_scraper.py`

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
| What is sent | Target URL and all sub-resource requests triggered by the page |
| Auth mechanism | None — requests as headless Chromium |
| Network path | Direct TCP to resolved IPs (post-`_validate_url()`) |
| Sandboxing | Chromium sandbox within container |
| Failure mode | 10s timeout → falls through to graceful textarea fallback |

### 9.3 Resend (Email)

| Concern | Detail |
|---------|--------|
| What is sent | Recipient email + reset URL containing JWT token |
| Auth mechanism | `RESEND_API_KEY` env var |
| Network path | HTTPS to `api.resend.com` |
| Failure mode | Background task; failure is silently logged, user always sees success |

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
| What is scrubbed | Request body, cookies, query strings, auth/cookie headers, user email, user IP |
| Opt-in behavior | Sentry SDK only initializes if `SENTRY_DSN` env var is set (empty by default) |
| Backend scrubbing | `_scrub_sentry_event()` — `backend/app/main.py:37-65` |
| Frontend scrubbing | `beforeSend` + `beforeBreadcrumb` — `frontend/src/routes/__root.tsx:14-58` |

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
| `tool_run_started` | tool_name, access_mode, workspace_id, linked_context_count | info |
| `tool_run_completed` | tool_name, access_mode, duration_ms, saved, history_id, workspace_id | info |
| `tool_run_failed` | tool_name, access_mode, duration_ms, workspace_id, failure_category | error |
| `user_account_deleted` | user_id, runs_deleted, workspaces_deleted, user_record_deleted | info |
| `frontend_telemetry` | Raw payload from frontend | info |

**Deliberately NOT logged:** Resume text, job descriptions, generated content,
passwords, tokens, cookies, email addresses, IP addresses.

— `backend/app/services/observability.py`

### 10.2 Frontend Telemetry

- **Transport:** `navigator.sendBeacon()` with `application/json` Blob; fallback to
  `fetch` with `keepalive: true`
- **Endpoint:** `POST /api/v1/telemetry/events` (rate-limited at 60/min)
- **Consent gate:** Skipped if `getStoredConsent() === 'rejected'`
- **Event names:** `tool_run_started`, `tool_run_succeeded`, `tool_run_failed`,
  `result_page_loaded`, `export_action_used`, `workspace_resumed`,
  `frontend_error`, `tool_regenerate`, `ad_shown`, `ad_completed`,
  `ad_blocked`, `countdown_completed`, `auth_signup_source`,
  `workflow_continued`, `result_page_cache_miss`
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

### 10.4 Google AdSense — Consent-Gated

Loaded only if cookie consent is accepted AND `VITE_AD_CLIENT_ID` env var is set.
Ad-blocker detection via bait div render check. 30-second countdown fallback.

— `frontend/src/hooks/useAd.ts`

---

## §11 Attacker Model & Abuse Cases (Ranked by Impact × Likelihood)

| Rank | Abuse Case | Trust Boundary | Impact | Current Mitigation | Gap |
|------|------------|----------------|--------|--------------------|-----|
| 1 | **Unauthenticated LLM cost abuse** | API → Vertex AI | High — uncontrolled model spend | Per-endpoint rate limits (10/min), guest 3–5 runs/day cookie | Cookie-based guest limit is trivially bypassable; no CAPTCHA; no per-IP global rate limit |
| 2 | **Credential stuffing / brute force** | API → Auth | Medium-High — account takeover | Login 10/min, register 5/min, bcrypt hashing | No account lockout after repeated failures; no password composition requirements. Lockout-DoS is currently moot (no lockout mechanism exists), but any future lockout must weigh account-takeover protection against denial-of-service via intentional lockout |
| 3 | **SSRF via job URL import** | API → Internet | Medium — internal network access | DNS-level IP check (private/loopback/reserved), redirect re-validation | IPv6 special ranges checked; DNS rebinding depends on single `getaddrinfo` call; no connect-time enforcement |
| 4 | **Session hijacking (cookie theft)** | Browser → API | High — full account access | HttpOnly cookies, SameSite=Lax, Secure in production | No token binding; refresh token lives 7 days; no device/session fingerprinting |
| 5 | **Persistent XSS via stored/generated content** | DB → Browser | Medium — session theft, credential capture | Tool output is rendered in React (auto-escaped), no raw HTML insertion | Generated content includes untrusted LLM output; no CSP allowing inline scripts; no output sanitization beyond React defaults |
| 6 | **Malicious file upload** | Browser → API | Medium — DoS, parser exploitation | 10MB limit, magic byte validation, PDF/DOCX only | No page count limit; no ZIP bomb protection for DOCX; PyMuPDF processes arbitrary PDFs |
| 7 | **Prompt injection to extract system prompts or influence outputs** | API → Vertex AI | Low-Medium — output manipulation | 17 regex patterns in `input_sanitizer.py` | Regex cannot block all injection vectors; no system prompt hardening / delimiters |
| 8 | **Account enumeration** | API → Auth | Low — privacy | Login/register return distinct errors; password reset always returns 200 | Login says "Invalid email or password" (ambiguous), but registration says "Email already registered" (distinct) |

---

## §12 Privacy Failure Modes (Ranked by Impact)

| Rank | Failure Mode | Affected Asset | Current Protection | Gap |
|------|-------------|----------------|-------------------|-----|
| 1 | **Resume/JD leakage via logs or error reports** | Resume text, generated content | Sentry scrubs body/cookies/query; structured logs exclude content | Sentry is opt-in but captures stack traces; if `SENTRY_DSN` unset, no log scrubbing in stdout (structured events exclude content by schema) |
| 2 | **Generated content accessible to wrong user** | ToolRun results | User-scoped cache keys; DB queries filter by `user_id` | In-memory cache key includes user scope; no cross-user access observed in code — confidence is high but only code-audit, not penetration-test, verified |
| 3 | **Browser storage persistence after logout** | sessionStorage data | Tab-scoped sessionStorage clears on tab close; localStorage consent stays | Logout clears pending intent, invalidates query cache, but does not clear tool drafts, workflow context, demo results, or resume-carry from current tab's sessionStorage |
| 4 | **Password reset token in URL** | Reset token | Single-use (password-hash-derived secret auto-invalidates on password change) | Token in URL query string leaks to browser history, server access logs, and Referer header if reset page loads external resources |
| 5 | **Account deletion — data reappears from backup** | All user data | Cascading delete in single transaction; structured log emitted | No backup restoration procedure documented; no verification step |
| 6 | **Incomplete account deletion** | User data | `delete_all_user_data()` cascading deletes `tool_runs`, `workspaces`, `users` | No verification query after deletion; no audit trail beyond structured log event; if Sentry is active, previously-captured events remain in Sentry's retention window |

---

## §13 Current Behavior vs. Intended Deployment (Gap Inventory)

| # | Gap | Current | Intended | Risk | Owned By |
|---|-----|---------|----------|------|----------|
| 1 | In-memory rate limiter | slowapi in-memory dict, per-process counters | Distributed rate limiter (e.g., Redis-backed) | Leaks across instances if scaled beyond 1 replica | #76 |
| 2 | In-memory result cache | Python dict, process-local | Redis or similar shared cache | Fragmented caches in multi-instance; lost on restart | #76 |
| 3 | Docker runs as root | No `USER` instruction in either Dockerfile | Non-root user with minimal capabilities | Container escape has root on host | #81 |
| 4 | No retention/deletion policy | Data persists indefinitely; no TTL cleanup | Bounded retention periods + automated cleanup | Unlimited sensitive data accumulation; no GDPR compliance path | #74 |
| 5 | No automated backups | No backup scripts, no cron jobs | Regular database backups with documented restore procedure | Data loss on Railway incident | #74 |
| 6 | PostHog infrastructure present, SDK inactive | Build args + env vars + proxy config exist | Decision: activate PostHog OR remove dead config | Confusion about active processors; CookiePolicyPage claims no analytics but proxy exists | #82 |
| 7 | No email verification on password registration | Account immediately usable | Email verification before first tool use | Spam accounts, wrong-email lockouts | #75 |
| 8 | Rate limits missing on several auth endpoints | `GET /auth/me`, `POST /auth/logout`, `GET /auth/providers`, history GET/PATCH/DELETE | Rate limits on all authenticated endpoints | Enumeration amplification, DoS | #76 |
| 9 | Password reset token in URL query string | `?token=...` | Token in POST body or fragment | Leaks to browser history and server logs | #75 |
| 10 | No per-IP global rate limit | Per-endpoint decorators only | Global per-IP rate limit + progressive delay | Sustained abuse across different endpoints under individual limits | #76 |
| 11 | Login error message distinction | "Invalid email or password" (ambiguous) | Same message for both cases (no enumeration) | Registration says "Email already registered" — enables enumeration | #75 |

---

## §14 Unknowns Requiring Human Decisions

| ID | Question | Impact | Required For |
|----|----------|--------|--------------|
| D-UNK-1 | What are the production values for `TRUST_PROXY_HEADERS` and `TRUSTED_PROXY_CIDRS`? | Rate limiter IP resolution depends on correct proxy trust | #76 |
| D-UNK-2 | What is the Railway PostgreSQL connection pool ceiling? | Current `pool_size=20, max_overflow=10` may need adjustment | #76 |
| D-UNK-3 | Is the production deployment 1 replica or more? | Affects cache and rate limiter correctness | #76, #81 |
| D-UNK-4 | Is `SENTRY_DSN` set in production? | Determines whether error data leaves the Railway network | #78 |
| D-UNK-5 | Should PostHog be activated (and proxy cleaned up if not)? | Changes processor inventory and privacy disclosure requirements | #82 |
| D-UNK-6 | What are the accepted retention periods for: primary data, backups, logs, Sentry events, audit records? (Overlaps with `docs/decisions.md` D-NEXT-3) | Required for GDPR compliance and privacy disclosures | #74 |
| D-UNK-7 | What is the backup schedule and restore procedure? | Data recovery posture before beta launch | #74 |
| D-UNK-8 | What is the scope of the Google Cloud service account / API key permissions? | Limits blast radius of credential compromise | #79 |
| D-UNK-9 | Are there any additional production environment variables not in `.env.example`? | Complete attack surface enumeration | #81 |
| D-UNK-10 | What is the Railway domain and is TLS configured end-to-end? | Cookie `Secure` flag correctness; HSTS viability | #81 |

---

## §15 Blockers & Dependency Map

Each R3 sub-issue depends on specific sections of this document. Issues are
blocked only by their listed dependencies — all other context is available here.

| Issue | Depends On | Unblocked? |
|-------|-----------|------------|
| #74 — Retention/deletion lifecycle | §§4,12,13,14 — Asset inventory, privacy failures, gaps, unknowns D-UNK-6, D-UNK-7 | **Blocked by human decisions** (D-UNK-6, D-UNK-7) |
| #75 — Auth, cookie, CORS, OAuth, CSRF posture | §§2,6,7 — Trust boundaries, API surface, session model | Unblocked (code evidence complete; SameSite=Lax authoritative per PRD #72) |
| #76 — Distributed abuse and ATO controls | §§6,11,13 — API surface with rate limits, abuse cases, gaps #1,#2,#8,#10 | Unblocked (code evidence complete) |
| #77 — Browser storage minimization | §§4,5,12 — Asset inventory, storage inventory, privacy failure modes | Unblocked (code evidence complete) |
| #78 — Telemetry, Sentry, logs, deletion audit | §§10,12,13 — Observability, privacy failures, gaps #6 | Unblocked (code evidence complete; D-UNK-3 may affect) |
| #79 — Upload boundaries & parser resource limits | §8.5 — File upload handling | Unblocked (code evidence complete) |
| #80 — Scraper SSRF hardening | §§8.6,9.2 — Scraper implementation, Playwright integration | Unblocked (code evidence complete) |
| #81 — Deployment-compatible security headers | §§1,13 — Topology, gap inventory (#3, #6) | Partially blocked (D-UNK-1, D-UNK-3, D-UNK-5, D-UNK-9, D-UNK-10) |
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
