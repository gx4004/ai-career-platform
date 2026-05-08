# Chapter 2 — System architecture

This chapter describes the architecture of the implemented system: requirements, technology stack, backend and frontend structure, persistence, authentication, and deployment. Design rationales are included only where they affect the thesis evaluation or operational behaviour.


## 2.1 Functional and non-functional requirements

The system was designed to satisfy six functional requirements, one per user-facing tool, and seven non-functional requirements.

### 2.1.1 Functional requirements

| ID / tool | Required behaviour |
|----|--------------------|
| F1 Resume Analyzer | Assess a resume with overall score, sub-scores, issues, actions, and strengths. |
| F2 Job Match | Compare a resume with a job description and return score, matched and missing keywords, verdict, and action items. |
| F3 Career Path | Suggest ranked career paths with rationale, required skills, and progression timeline. |
| F4 Cover Letter | Generate a tailored cover letter from resume and job description. |
| F5 Interview Q&A | Generate likely interview questions by category with coaching notes. |
| F6 Portfolio Planner | Identify skill gaps and concrete portfolio artefact ideas for a target role. |

The same uploaded resume must serve all six tools without re-entry. Tool runs must be re-runnable, and previous results must be usable as context for later tools.

### 2.1.2 Non-functional requirements

The non-functional requirements reflect a single-developer, thesis-scoped deployment.

* **N1 (Latency).** Two targets are separated because the analytical core supports two scoring modes (Section 4.2.9). **N1a:** the heuristic-only path should remain below 50 ms at the 95th percentile. **N1b:** the blended cold path should remain below 25 s at the 95th percentile, dominated by the upstream Gemini call; cached production requests are materially faster as reported in Section 3.9.
* **N2 (Cost ceiling).** LLM cost is bounded by Gemini 2.5 Flash. Fully heuristic mode reduces LLM-side marginal cost to zero.
* **N3 (Availability).** Analytical tools fall back to heuristic-only output after LLM failure and surface a `confidence_note`. Generative tools fail with a structured retry-able error rather than fabricating content.
* **N4 (Auditability).** Each persisted tool invocation stores hashed inputs, full output, timing, access mode, and linkage metadata for later inspection and for the study in Chapter 4.
* **N5 (Privacy).** Logged-in screens load no third-party advertising or analytics scripts. Personal data is encrypted in transit and at rest by the managed provider; passwords are stored as bcrypt hashes.
* **N6 (Single deployment surface).** The thesis deployment runs as one Railway project with frontend, backend, and managed PostgreSQL behind one external origin.
* **N7 (Demonstrability).** The system must be operable from a laptop and must allow the analytical core to switch between blended and fully heuristic modes during a diploma-defence demonstration.

The latency requirement was split after measurement. An earlier single cold-path target below five seconds did not match the observed behaviour of structured LLM calls. Separating N1a and N1b keeps the requirement honest: the heuristic path is evaluated as local computation, while the blended path is evaluated as an upstream-service workflow whose tail latency is outside the application's direct control.


## 2.2 Technology stack and rationale

The technology stack is summarised in Table 2.1.

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Backend | FastAPI 0.115, SQLAlchemy 2.0, Alembic | Python-native API, typed validation, mature relational persistence. |
| Database | PostgreSQL 16 (Railway managed) | Single-node managed database is sufficient for thesis traffic. |
| LLM provider | Google Vertex AI Gemini 2.5 Flash | Low-cost structured-output model with an asynchronous client. |
| Frontend | React 19, TanStack Start, Vite 7 | SPA workspace, type-safe file routing, fast development build. |
| Styling and UI | Tailwind 4, Radix UI, Framer Motion | Accessible primitives, utility styling, controlled animation. |
| Authentication | JWT HttpOnly cookies, Google OAuth | No client-readable tokens and standard refresh rotation. |
| Operations | Railway, Resend, Sentry | Unified deployment, transactional reset email, lightweight error tracking. |

FastAPI was selected over a TypeScript backend because the analytical core benefits from Python's mature text-processing ecosystem (`re`, `difflib`, `unicodedata`, and optional retrieval libraries) and from the official Google Vertex AI client. Keeping scoring logic in Python reduces the risk of language-boundary differences in the comparative study.

TanStack Start was selected over Next.js because the application is an authenticated workspace rather than a content site. Type-safe file routing and co-located search-parameter state fit the multi-tool workflow, while server components and ISR would add little to the thesis scope.

The deployment stack also reflects the thesis boundary. Railway provides enough operational structure for a live system without requiring a separate platform-engineering layer. PostgreSQL is used instead of a document store because tool history, users, regeneration chains, and workspaces are relational by nature. Sentry and Railway metrics are sufficient for defect investigation at thesis traffic levels.


## 2.3 Backend architecture

The backend is structured in four horizontal layers (Figure 2.1).

![Figure 2.1: Backend layered architecture. The FastAPI surface (routers and schemas) delegates to a service layer that runs every analytical tool through the shared `run_tool_pipeline`, which in turn invokes the heuristic prepass, the LLM gateway (Vertex AI Gemini 2.5 Flash via `ai_client.py`), and the persistence layer (SQLAlchemy 2.0 + Alembic over PostgreSQL).](figures/v2/figure-2-1.png)

### 2.3.1 Routers

Routers live in `app/routers/` and are mounted under `/api/v1`. Each router validates the request body with the relevant Pydantic schema, resolves dependencies such as the current user and database session, invokes a service function, and returns the response. Keeping routers thin makes the tool services and the shared pipeline the main units of behaviour.

### 2.3.2 The shared tool pipeline

The six tools share `run_tool_pipeline(...)` in `services/tool_pipeline.py`. Its stages are shown in Figure 2.2.

1. **Sanitise.** Resume text, job descriptions, and feedback strings are normalised and bounded before reaching prompts.
2. **Cache lookup.** A hash of the tool name, sanitised inputs, user identifier, and tool-specific keys is checked against the in-memory cache.
3. **Service call.** The tool-specific coroutine performs heuristic extraction, prompt construction, LLM invocation where applicable, and post-processing.
4. **Persistence.** Authenticated results are stored as `ToolRun` rows with labels, payloads, linked context, workspace identifiers, regeneration parent ids, and feedback text.
5. **Response assembly.** A unified response shape returns the history identifier and access mode.
6. **Observability.** Structured start, success, and failure events record tool name, access mode, duration, and error category.

![Figure 2.2: Tool pipeline (`run_tool_pipeline`). Six sequential stages form the cross-cutting wrapper around every analytical tool service: sanitise, cache, service, persist, respond, observe. The LLM gateway is shown as an external dependency exercised inside the service stage, with the four-retry exponential-backoff schedule and the heuristic-only fallback path that activates after the retries are exhausted.](figures/v2/figure-2-2.png)

The pipeline gives every tool the same cache, persistence, and observability behaviour. It also lets Chapter 4 reason about mode switching and fallback uniformly rather than per endpoint.

This common wrapper is especially important for regenerated results. A regeneration is just another pipeline run with a `parent_run_id`, optional feedback, and the same persistence contract. The design avoids hidden per-tool exceptions: whether the run is a resume analysis, a cover letter, or a portfolio plan, the frontend can expect a history identifier and a stable result page.

### 2.3.3 Tool services and prompt builders

Each tool is implemented through a service module and a prompt module. The service orchestrates the heuristic prepass, invokes `complete_structured` from `services/ai_client.py`, and post-processes the validated result. The prompt module assembles the system and user messages from inputs and the locked heuristic payload. This split keeps prompt content versioned but separate from service orchestration.

The service modules are also where mode-specific behaviour is isolated. Analytical services can return a heuristic-only response when `SCORING_MODE=heuristic` or when the LLM path fails. Generative services do not attempt a heuristic substitute, because a deterministic cover letter or interview answer would be misleading.

### 2.3.4 The heuristic prepass

Resume Analyzer and Job Match compute a deterministic prepass before the LLM call. The prepass detects sections, bullets, quantified achievements, matched and missing keywords, skill phrases, and five sub-scores: keyword alignment, impact, structure, clarity, and completeness. The payload is appended to the prompt as a locked block that the LLM must treat as ground truth. This stabilises scoring and makes heuristic-only fallback and fully heuristic mode possible without a separate response contract.


## 2.4 Frontend architecture

The frontend is a single-page application served from the same Railway project as the backend. The backend handles `/api/*`; the frontend handles the remaining routes.

### 2.4.1 Route structure

Routes live in `frontend/src/routes/` and are generated by TanStack Router. Each tool has an input route such as `/resume` or `/job-match` and a result route at `/<tool>_/result/$historyId`, where `$historyId` points to the persisted `ToolRun`. Additional routes cover dashboard, account settings, login, password reset, history, and the admin scoring-mode surface.

### 2.4.2 State management

State is split into three scopes. Server state is held in TanStack Query, including session, history, and loaded results. Workflow state, such as the carried resume and linked result context, is stored in `sessionStorage` through hooks such as `useResumeCarry` and `useSession`. Component state remains local to inputs, sheets, animations, and transient UI flags.

### 2.4.3 Layout shell and navigation

The application shell uses a dark sidebar, topbar, and light content area. The sidebar groups the six tools into primary, application, and planning clusters. On mobile, navigation collapses into `MobileNav` and `ToolGridSheet`. Tool metadata is centralised in `frontend/src/lib/tools/registry.ts`, so adding a tool requires one registry entry rather than repeated UI edits.


## 2.5 Data model and persistence

The persistence model contains three primary tables, summarised in Table 2.2.

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `users` | One row per registered account | `id` (UUID), `email`, `password_hash` (bcrypt) or null for OAuth-only accounts, `google_subject` for federated identities, timestamps. |
| `tool_runs` | One row per tool invocation that the system chose to persist | `id`, `user_id`, `tool_name`, `label`, `result_json`, `parent_run_id` for regeneration chains, `linked_context_ids`, `workspace_id`, `feedback_text`, `created_at`. |
| `workspaces` | Optional grouping of tool runs around a single role search | `id`, `user_id`, `label`, timestamps. |

Regeneration never overwrites an existing result: a regenerated run creates a new `tool_runs` row with `parent_run_id` pointing to the earlier row. Guest runs are not persisted to PostgreSQL; they live briefly in memory behind a session cookie, which keeps the database focused on authenticated history.

The `linked_context_ids` field supports the workflow argument of the thesis. When a user invokes a cover letter from a Job Match result, or opens Interview Q&A from an analysed resume, the new result can record the prior run it depended on. This creates a graph of tool usage without requiring a separate workflow engine.


## 2.6 Authentication and security

Authentication uses JWTs in HttpOnly cookies: a 30-minute access token and a 7-day refresh token. The refresh token is sent only to `/auth/refresh` and is rotated on every successful refresh to prevent replay. Cookies are marked `Secure`, `SameSite=Lax`, and `HttpOnly`; CSRF tokens are not issued because the API accepts JSON request bodies and the SameSite policy matches the threat model.

Google OAuth is implemented with `authlib`. Password reset uses a single-use token sent through Resend and bound to the current password hash. Inputs are sanitised before prompt construction (Section 2.3.2), disposable-email domains are blocklisted, and `slowapi` rate limits login and password-reset endpoints more strictly than tool endpoints.


## 2.7 Deployment topology

The production deployment runs as a single Railway project with frontend service, backend service, and managed PostgreSQL add-on (Figure 2.3).

![Figure 2.3: Production deployment topology. Browser traffic resolves through Cloudflare DNS and TLS into a single Railway hostname; path-based routing at the Railway edge delivers the `/` path to the Vite-built frontend service and the `/api/v1/*` path to the FastAPI backend service. The backend uses a Railway-managed PostgreSQL add-on for persistence and three external dependencies: Vertex AI Gemini 2.5 Flash for inference, Resend for transactional email, and Sentry for error tracking. Both services emit metrics and breadcrumbs to the observability tier.](figures/v2/figure-2-3.png)

The shared hostname removes cross-origin complexity for SPA API calls and simplifies cookie configuration. PostgreSQL backups retain seven daily snapshots. Continuous deployment is tied to the `deploy` branch, while `main` remains a development checkpoint. This two-branch model keeps the thesis deployment surface narrow without introducing a CI/CD system larger than the project requires.

Railway was chosen because it keeps frontend, backend, database, logs, and metrics under one operational surface. A split deployment, such as frontend hosting plus a separate backend host, was considered but rejected because it would add CORS, cookie, and routing overhead without improving the thesis evaluation.

The single-origin deployment is also relevant to authentication. HttpOnly cookies are simpler when the SPA and API share one origin, and path-based routing avoids the browser-policy complexity of maintaining separate frontend and backend domains. For a larger product this architecture could be split later, but doing so during the thesis would have added operational risk without strengthening the research result.

The next chapter details the six tools supported by this architecture.
