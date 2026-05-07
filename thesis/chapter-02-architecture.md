# Chapter 2 — System architecture

This chapter describes the architecture of the system whose evaluation is the subject of the thesis. The chapter is organised in the same order in which design decisions were made during implementation: requirements first, then the choice of technology stack, then the backend, the frontend, the persistence model, and finally the deployment topology that ties the running components together. Where a decision could plausibly have been made differently, the rationale is stated explicitly so that the reasoning is auditable rather than implicit.


## 2.1 Functional and non-functional requirements

The system was designed to satisfy six functional requirements, each corresponding to one of the user-facing tools, and seven non-functional requirements that constrain how those tools are delivered.

### 2.1.1 Functional requirements

| ID | Tool | Required behaviour |
|----|------|--------------------|
| F1 | Resume Analyzer | Accept a free-text or uploaded resume, return a structured assessment with overall score, per-category sub-scores, identified issues, prioritised actions, and detected strengths. |
| F2 | Job Match | Accept a resume and a job description (text or URL), return a match score, matched keywords, missing keywords, a recruiter-style verdict, and a list of evidence-grounded action items. |
| F3 | Career Path | Accept a resume and optional preferences, return a ranked list of suggested career paths with rationale, requisite skills, and a notional progression timeline. |
| F4 | Cover Letter | Accept a resume and a job description, return a tailored cover letter with explicit structural sections that the user can copy and adapt. |
| F5 | Interview Q&A | Accept a resume and a job description, return a curated list of likely interview questions clustered by category (behavioural, technical, role-specific), each with a coaching note. |
| F6 | Portfolio Planner | Accept a resume and a target role, return a prioritised list of skill gaps and concrete artefact ideas (project briefs, contributions, certifications) that would close those gaps. |

The same uploaded resume must serve as input across all six tools without re-entry. Tool runs must be re-runnable (regeneration must produce a new history record rather than overwriting the original), and a previously generated result must be referenceable as context when invoking another tool.

### 2.1.2 Non-functional requirements

The non-functional requirements were derived from the practical constraints of a single-developer, thesis-scoped deployment.

* **N1 (Latency).** Two targets are stated separately because the analytical core supports two scoring modes (Section 4.2.9) whose cost models differ by two orders of magnitude.
  * **N1a (heuristic-only path):** end-to-end tool latency at the 95th percentile under nominal load should remain below 50 ms; everything in the path is local string processing on commodity hardware.
  * **N1b (blended LLM path):** end-to-end tool latency at the 95th percentile under nominal load should remain below 25 s on the cold path, dominated by the upstream Gemini structured-output call; production cached-path latency is materially lower as reported in Section 3.9. The original single-target 95th-percentile-under-five-seconds figure that an earlier draft of this section stated cannot be met by the cold-path blended mode and was split into the two targets above to match the measured behaviour reported in Section 4.3.3.
* **N2 (Cost ceiling).** Per-call LLM cost is bounded by the choice of Gemini 2.5 Flash, a low-cost variant of the model family. The fully-heuristic mode introduced in Chapter 4 reduces this to zero on the LLM side.
* **N3 (Availability).** A degraded but useful service is preferred over a hard failure. When the LLM call fails or times out, analytical tools (Resume, Job Match) fall back to a heuristic-only response and surface a `confidence_note` to the user. Generative tools (Cover Letter, Interview Q&A) fail loudly with a structured error rather than producing fabricated content.
* **N4 (Auditability).** Every tool invocation produces a persistent record with the inputs (hashed), the output (full), and the timing and access mode. This supports the experimental work in Chapter 4 and gives the operator a forensic trail.
* **N5 (Privacy).** No third-party analytics or advertising scripts are loaded on a logged-in user's screen. Personal data is encrypted in transit and at rest by the managed PostgreSQL provider; passwords are stored as bcrypt hashes only.
* **N6 (Single deployment surface).** The thesis-scoped deployment runs as a single Railway project that bundles the frontend service, the backend service, and a managed Postgres add-on. The two application services share a single hostname through path-based routing, so externally the system presents itself as one origin. There is no separate microservice architecture, no message broker, and no container orchestrator beyond what Railway provides natively.
* **N7 (Demonstrability).** The running system must be operable and demonstrable from a laptop without specialised tooling. Both modes of the analytical core (blended and fully heuristic) must be switchable at runtime through an administrative interface, so that the comparative study reported in Chapter 4 can be reproduced live during the diploma defence.


## 2.2 Technology stack and rationale

The technology stack is summarised in Table 2.1.

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Backend framework | FastAPI 0.115 | Python-native, asynchronous, automatic OpenAPI generation, Pydantic-driven schema validation. |
| ORM and migrations | SQLAlchemy 2.0 + Alembic | Mature, type-safe in 2.0, integrates with FastAPI's dependency injection. |
| Database | PostgreSQL 16 (Railway managed) | Single-node managed Postgres is sufficient for the workload; no sharding required. |
| LLM provider | Google Vertex AI Gemini 2.5 Flash | Lowest cost per 1M tokens in the production-quality tier at the time of selection; native asynchronous client; reliable structured-output mode. |
| Frontend framework | React 19 | Concurrent rendering, automatic batching, and the most mature component ecosystem. |
| Routing | TanStack Router via TanStack Start | File-based routes, type-safe links, search-param state co-location. |
| Build tool | Vite 7 | Sub-second hot module replacement during development. |
| Styling | Tailwind 4 + Radix UI primitives | Utility-first CSS without a parallel design-token system; Radix provides accessibility-correct primitives for menus, dialogs, and toggles. |
| Animation | Framer Motion | Declarative timeline animations for the input page heroes. |
| Authentication | JWT in HttpOnly cookies + Google OAuth (authlib) | No client-readable tokens; standard refresh-rotation pattern. |
| Transactional email | Resend | Used only for password-reset emails (no welcome or marketing email is sent in V1). |
| Hosting | Railway (backend, frontend, Postgres) | Single dashboard, single billing relationship, native GitHub deploy hooks. |
| Observability | Railway built-in metrics + Sentry free tier | Sufficient for thesis-scope traffic; can be extended to a paid tier without code changes. |

Two stack decisions deserve explicit defence because either could plausibly have been made differently.

**Why FastAPI rather than a Node/TypeScript backend.** A unified TypeScript backend would have eliminated the language boundary at the API contract. FastAPI was preferred because the official Google Vertex AI client (used for the LLM path described in Chapter 3) and the most mature standard-library and third-party tools for text processing (Python's `re`, `difflib`, `unicodedata`, and the optional `rapidfuzz` and `scikit-learn` ecosystems available if the heuristic is later extended) are all native Python. Keeping the analytical core in Python avoids introducing fidelity risks on the critical path of the comparative study reported in Chapter 4, where any subtle difference between, for example, a Python regex and a JavaScript regex would be a confound rather than a finding.

**Why TanStack Start rather than Next.js.** Next.js is the dominant framework for React applications in production. The decision to use TanStack Start instead was driven by three considerations specific to this project: (i) the application is fundamentally an authenticated single-page workspace rather than a content site, so server components and ISR offer little benefit; (ii) TanStack Router's file-based, type-safe routing produces fewer subtle bugs at refactor time; and (iii) co-locating search-parameter state and route-level data loaders made the multi-tool workflow easier to reason about. The trade-off is a thinner ecosystem of templates and tutorials.

In practice this trade-off was occasionally felt during the early weeks of frontend work, when answers to TanStack Start questions on Stack Overflow were still sparse and the official documentation had to fill the gap. By mid-development the framework's type-safety wins were paying back the early friction; the result-page route pattern `tool_/result/$historyId.tsx` would have required substantially more glue in a Next.js setup.


## 2.3 Backend architecture

The backend is structured in four horizontal layers (Figure 2.1).

![Figure 2.1: Backend layered architecture. The FastAPI surface (routers and schemas) delegates to a service layer that runs every analytical tool through the shared `run_tool_pipeline`, which in turn invokes the heuristic prepass, the LLM gateway (Vertex AI Gemini 2.5 Flash via `ai_client.py`), and the persistence layer (SQLAlchemy 2.0 + Alembic over PostgreSQL).](figures/figure-2-1-architecture.png)

### 2.3.1 Routers

Each domain has its own router file in `app/routers/`: `auth`, `google_auth`, `resume`, `job_match`, `career`, `cover_letter`, `interview`, `portfolio`, `history`, `files`, `admin`, `health`, and `telemetry`. All routers are mounted under the API prefix `/api/v1`. Routers are deliberately thin: they parse and validate the request body via the corresponding Pydantic schema, resolve dependencies (current user, database session), invoke the relevant service function, and return the response.

### 2.3.2 The shared tool pipeline

The six functional tools share a single cross-cutting pipeline implemented in `services/tool_pipeline.py` and exposed as the asynchronous function `run_tool_pipeline(...)`. Every tool router invokes this pipeline rather than calling the tool service directly. The pipeline has six stages, executed in order (Figure 2.2):

1. **Sanitise.** The resume text, the job description (if any), and any feedback string are passed through `sanitize_user_input`, which strips control characters, normalises whitespace, and bounds the input length. This is a defence-in-depth measure against prompt-injection-style payloads embedded in resumes.
2. **Cache lookup.** A content hash is computed from the tool name, the sanitised inputs, the user's identifier (so authenticated users never see another user's cached result), and any tool-specific cache keys. If a result is present in the in-memory cache, it is returned without calling the LLM.
3. **Service call.** The tool-specific service function is invoked. Each tool service is a coroutine that returns a fully populated response dictionary.
4. **Persistence.** The result is persisted as a `ToolRun` record. The record stores the tool name, a human-readable label produced by a tool-specific labelling function, the full result payload, the linked context identifiers, the workspace identifier, the parent run identifier (for regeneration chains), and any feedback text supplied by the user.
5. **Response assembly.** A unified response shape is built from the persisted record, including the history identifier and the access mode.
6. **Observability.** A structured event is emitted on start, success, and failure, including the tool name, access mode, duration, and the error category if applicable. These events feed both the Sentry breadcrumb trail and the operator-facing metrics.

![Figure 2.2: Tool pipeline (`run_tool_pipeline`). Six sequential stages form the cross-cutting wrapper around every analytical tool service: sanitise, cache, service, persist, respond, observe. The LLM gateway is shown as an external dependency exercised inside the service stage, with the four-retry exponential-backoff schedule and the heuristic-only fallback path that activates after the retries are exhausted.](figures/figure-2-2-pipeline.png)

This single point of indirection has two practical consequences for the thesis. First, every tool inherits the same cache, persistence, and observability behaviour by default; adding a new tool requires no plumbing beyond the service function and the prompt builder. Second, the comparative study in Chapter 4 can reason about cache and persistence behaviour uniformly across all tools, rather than maintaining a per-tool exception table.

The pipeline-first design was not the original plan. The Resume Analyzer and the Job Match tool were the first two endpoints implemented, each with its own cache wrapper, its own persistence call, and its own observability lines copy-pasted from the other. By the time the third tool was added the duplication was painful enough to motivate the refactor that produced `run_tool_pipeline`. That refactor is small in lines but is the single architectural change that has saved the most engineering effort across the project.

### 2.3.3 Tool services and prompt builders

The body of each tool's logic lives in two files: a service module (`services/<tool>_*.py`) and a prompt module (`prompts/<tool>.py`). The service module orchestrates the heuristic prepass, builds the prompt by delegating to the prompt module, calls `complete_structured` from `services/ai_client.py` to obtain a validated JSON response from Gemini, and post-processes the result. The prompt module is responsible only for assembling the `system` and `user` messages from the inputs and the heuristic prepass. Splitting these responsibilities keeps the prompt content under version control without coupling it to the service-orchestration code.

### 2.3.4 The heuristic prepass

For tools that produce a numerical score (Resume Analyzer and Job Match) the service computes a deterministic prepass before the LLM call. The prepass extracts evidence from the resume (detected sections, bullet counts, quantified bullets, matched and missing keywords against the job description, detected skill phrases), and computes a five-axis breakdown (keyword alignment, impact, structure, clarity, completeness). The prepass payload is appended to the prompt as a *locked payload*: text the LLM is instructed to use as authoritative ground truth rather than to overwrite. This has two effects: it stabilises the LLM's score against prompt-perturbation noise, and it makes the heuristic-only fallback (and the fully-heuristic mode) implementable without a parallel codepath.


## 2.4 Frontend architecture

The frontend is a single-page application served from a Railway service that lives in the same Railway project as the backend service; both share one external hostname through path-based routing (the backend handles `/api/*`, the frontend handles everything else). The deployment topology is described in detail in Section 2.7.

### 2.4.1 Route structure

Routes live in `frontend/src/routes/` and are file-based. The route tree is generated at build time by TanStack Router. Each tool has a pair of routes:

- An *input* route at `/<tool>` (for example, `/resume`, `/job-match`); this workspace page contains the resume input, the job-description input where applicable, and per-tool animation, copy, and chips.
- A *result* route at `/<tool>_/result/$historyId`, the page rendered after a tool run completes. The route segment `_/` declares a layout split, and the dynamic segment `$historyId` is the persistent identifier of the `ToolRun` record on the backend.

In addition, routes exist for the dashboard, account settings, login, password reset, history, and the small admin surface introduced in Chapter 4.

### 2.4.2 State management

Application state is partitioned into three scopes.

1. **Server state** (anything that originates from the backend) is held in TanStack Query. This includes the current session, the list of tool runs in the user's history, and the result of any previously completed tool run. TanStack Query handles staleness, refetching, and request deduplication.
2. **Workflow state** (the resume text being carried between tools and the most recent tool result the user is referencing) is held in `sessionStorage` and read through small custom hooks (`useResumeCarry`, `useSession`). Workflow state is tab-scoped by design: opening the same site in a second tab does not share workflow context, which prevents accidental cross-talk.
3. **Component state** (input values, sheet open/closed flags, animation timing) is local to each component and uses standard React `useState` and `useReducer`.

### 2.4.3 Layout shell and navigation

The application shell consists of a dark sidebar and topbar with a light content area; there is no dark-mode toggle. The sidebar groups the six tools into three semantic clusters, *primary* (Resume, Job Match), *application* (Cover Letter, Interview Q&A), and *planning* (Career Path, Portfolio), to reduce the cognitive load of navigation. On mobile breakpoints, the sidebar collapses into a bottom tab bar (`MobileNav`) and a tools sheet (`ToolGridSheet`). All tool metadata that drives the sidebar, the dashboard cards, and the tools-sheet grid is centralised in `frontend/src/lib/tools/registry.ts`, so a new tool can be exposed across the entire UI with a single registry entry.


## 2.5 Data model and persistence

The persistence model contains three primary tables, summarised in Table 2.2.

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `users` | One row per registered account | `id` (UUID), `email`, `password_hash` (bcrypt) or null for OAuth-only accounts, `google_subject` for federated identities, timestamps. |
| `tool_runs` | One row per tool invocation that the system chose to persist | `id`, `user_id`, `tool_name`, `label`, `result_json`, `parent_run_id` for regeneration chains, `linked_context_ids`, `workspace_id`, `feedback_text`, `created_at`. |
| `workspaces` | Optional grouping of tool runs around a single role search | `id`, `user_id`, `label`, timestamps. |

Two design choices on the data model deserve note.

First, **regeneration never overwrites**. A regenerated tool run is a new `tool_runs` row whose `parent_run_id` points to the original. This produces a complete audit trail of the user's iteration on any single piece of analytical work, and supports rolling back a result that the user found less useful than its predecessor.

Second, **guest tool runs are never persisted to the database**. Unauthenticated users can run any tool from the demo landing page; the result is held in an in-memory map keyed by a session cookie and discarded after a short TTL. This keeps the user research path open without polluting the persistence layer with low-value records, and isolates the cost-relevant tool runs (authenticated, persisted) from the cost-irrelevant ones (guest, ephemeral).


## 2.6 Authentication and security

Authentication uses JSON Web Tokens carried in HttpOnly cookies. There are two cookies: a 30-minute *access* token and a 7-day *refresh* token. The access token carries the user identifier and is validated on every protected request through a FastAPI dependency. The refresh token is sent only to a single endpoint (`/auth/refresh`) and is rotated on every successful refresh; the previous refresh token is invalidated atomically with the issue of the new pair to prevent replay. Cookies are marked `Secure`, `SameSite=Lax`, and `HttpOnly`. No CSRF tokens are issued, because the API accepts only `application/json` request bodies and the SameSite policy is sufficient against the threat model.

Federated login is supported through Google OAuth using the `authlib` library. Password reset is implemented through a single-use token sent by Resend; the token is bound to a hash of the user's current password hash, so a successful reset implicitly invalidates earlier reset tokens.

Beyond authentication, three additional security measures are worth noting. Inputs are sanitised before reaching any prompt builder (Section 2.3.2). Disposable-email domains are blocklisted at signup. Rate limiting is enforced through `slowapi`, with stricter limits on login and password-reset endpoints than on the tool endpoints.


## 2.7 Deployment topology

The production deployment runs as a single Railway project containing two application services (frontend and backend) plus a managed PostgreSQL add-on (Figure 2.3).

![Figure 2.3: Production deployment topology. Browser traffic resolves through Cloudflare DNS and TLS into a single Railway hostname; path-based routing at the Railway edge delivers the `/` path to the Vite-built frontend service and the `/api/v1/*` path to the FastAPI backend service. The backend uses a Railway-managed PostgreSQL add-on for persistence and three external dependencies: Vertex AI Gemini 2.5 Flash for inference, Resend for transactional email, and Sentry for error tracking. Both services emit metrics and breadcrumbs to the observability tier.](figures/figure-2-3-deployment.png)

The frontend and the backend share a single hostname, with path-based routing decided at the Railway edge. This eliminates cross-origin concerns for the SPA's API calls and simplifies cookie configuration. The Postgres database is provisioned as a managed Railway add-on; backups are configured to retain seven daily snapshots.

Continuous deployment is wired to a single branch (`deploy`). Pushing to `main` is a development checkpoint; promoting a commit to `deploy` triggers a Railway build and rolls out the new revision with a brief health-check window before traffic is cut over. This two-branch model is intentional: it keeps the deployment surface narrow without introducing a CI/CD pipeline whose maintenance overhead is out of proportion to a thesis-scoped project.

The Railway choice was driven by the desire for a unified deployment surface. Serving the frontend at `/` and the backend at `/api/*` from a single hostname collapses the entire system into one domain, which removes an entire class of CORS and `SameSite`-cookie configuration bugs from the project before they can be introduced. Split-deployment alternatives (typically a frontend host such as Vercel paired with a separate backend host) were considered briefly, but the operational overhead of running two services without a team to absorb that overhead did not seem justified at the project's scope. The same single-domain choice also meant that no separate edge router was required to glue the two halves of the application together at the boundary.

The next chapter details the implementation of each of the six tools that this architecture supports.
