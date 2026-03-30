# Career Workbench — Technical Specification

> Last updated: 2026-03-30 (post-interview revision #2)
> Project intent: Production product with real users and hybrid ad + subscription revenue
> Developer: Student based in Poland (RODO/GDPR jurisdiction)

---

## 1. Overview & Vision

Career Workbench is a full-stack AI-powered job-search workspace. Users upload their resume once and use it as context across **six interconnected tools** that guide them through resume analysis, job matching, application preparation, and career planning.

### Core Premise

One resume, six tools, multiple workflow paths. Each tool produces structured output that can feed into the next, creating a cohesive career preparation experience rather than six isolated utilities.

### Access Modes

| Mode | Persistence | Features |
|------|------------|----------|
| **Guest** | None — results are never stored, not even in sessionStorage | Run any tool (max 3-5 runs/day), view results in-session. To save results, user must sign up. Guest runs are intentionally ephemeral to drive conversion. |
| **Authenticated** | Server-side (Postgres) | Full workspace: save runs, favorites, workspace grouping, history search, cross-session continuity, PDF export. |

**Guest → Auth conversion**: Guest runs are never persisted. If a user wants to save results, the platform prompts them to sign up. This is a deliberate conversion lever — the value is visible but saving requires authentication. When a guest signs up, their previous in-session results are **not** migrated — they must re-run the tool. This keeps the system simple and incentivizes early signup.

**Guest daily limit**: Guest users are limited to **3-5 tool runs per day** (tracked via cookie). After the limit, a signup prompt appears. This prevents LLM cost abuse while giving enough runs to demonstrate value. Cookie-based tracking is bypassable but acceptable — rate limiting (IP-based) provides secondary defense. Technical users are not the target audience.

**Guest result expiry**: Guest results exist only in an in-memory Map. If a guest navigates away from a result page and returns, the result is gone — "Result expired — run again" message is shown. This is intentional to drive signup.

### V1 Scope

All 6 tools ship in v1. No phased rollout — the workflow continuity model requires all tools present. Interview Practice Mode ships in v1 in simplified form (list format, SwipeDeck on mobile).

---

## 2. Tech Stack

### Frontend

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | React | 19.2.0 |
| Routing | TanStack Start + TanStack React Router | 1.166.6 |
| Build | Vite | 7.3.1 |
| Styling | Tailwind CSS (Vite plugin mode) | 4.1.18 |
| UI Primitives | Radix UI | 1.4.3 |
| Component Library | shadcn/ui (custom Tailwind implementations) | — |
| Icons | Lucide | 0.545.0 |
| Animation | Framer Motion + Motion | 12.35.2 / 12.38.0 |
| Server State | TanStack React Query | 5.90.21 |
| Validation | Zod | 4.3.6 |
| Language | TypeScript (strict mode) | 5.7.2 |
| Package Manager | pnpm | 10.30.3 |
| Testing | Vitest + @testing-library/react | 3.0.5 / 16.3.0 |

### Backend

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | FastAPI | 0.115.0 |
| Server | Uvicorn (async) | 0.34.0 |
| ORM | SQLAlchemy (declarative) | 2.0.0 |
| Migrations | Alembic | 1.14.0 |
| Database | Railway Postgres (dev + prod) | — |
| Auth | python-jose (JWT/HS256) + bcrypt + authlib (Google OAuth) | 4.0.0 |
| Email | Resend (free tier — password reset) | — |
| Validation | Pydantic + pydantic-settings | 2.0 |
| HTTP Client | httpx (async) | 0.28.0 |
| Rate Limiting | slowapi (token bucket, per-IP) | — |
| PDF Parsing | PyMuPDF (fitz) | — |
| DOCX Parsing | python-docx | — |
| Web Scraping | beautifulsoup4 + Playwright (fallback) | 4.13.0 |
| Error Tracking | Sentry (free tier) | — |
| Linting | ruff | 0.9.0 |
| Testing | pytest + pytest-asyncio | 8.0.0 / 0.24.0 |
| Python | 3.10+ | — |

### LLM Provider (single provider for V1)

| Provider | Model | Role |
|----------|-------|------|
| Google Vertex AI | Gemini 2.5 Flash | Primary & only (analysis, generation) |
| Google Vertex AI | Gemini Flash Lite (or equivalent) | Interview practice feedback (cheaper) |

**V1 decision**: Single provider only. Multi-provider abstraction removed — eliminates response format normalization, per-provider error handling, and prompt tuning complexity. Fallback provider (OpenAI) may be added in V1.1 if resilience becomes a concern.

### Deployment

| Layer | Platform |
|-------|----------|
| Backend | Railway (FastAPI container) |
| Frontend | Railway (static SPA) |
| Database | Railway Postgres |
| Monitoring | Railway metrics + Sentry free tier |
| SSL | Railway automatic (Let's Encrypt) |

---

## 3. Architecture

### Repository Layout

```
ai-career-platform/
├── frontend/          # React 19 + TanStack Start SPA
│   ├── src/
│   │   ├── routes/    # File-based route definitions
│   │   ├── pages/     # Page component implementations
│   │   ├── components/
│   │   │   ├── app/       # Shell, sidebar, nav, error boundary
│   │   │   ├── auth/      # Login/register forms, dialogs
│   │   │   ├── dashboard/ # Hero, cards, showcase grid
│   │   │   ├── tooling/   # Tool input pages + result screens
│   │   │   ├── landing/   # Marketing landing page
│   │   │   ├── mobile/    # Mobile-specific: SwipeDeck, StickyRunBar, FilterChips, etc.
│   │   │   ├── onboarding/# Guided tour
│   │   │   ├── illustrations/ # Scene visuals
│   │   │   └── ui/        # Radix + shadcn base components
│   │   ├── assets/        # Tool icons, carousel images, branding PNGs
│   │   ├── hooks/         # useSession, useBreakpoint, useResumeCarry, etc.
│   │   ├── lib/
│   │   │   ├── api/       # API client, Zod schemas, error handling
│   │   │   ├── auth/      # SessionProvider, token storage, pending intent
│   │   │   ├── tools/     # Tool registry, drafts, workflow configs, exports
│   │   │   ├── query/     # React Query client setup
│   │   │   ├── navigation/# Public routes, route meta, redirect helpers
│   │   │   └── telemetry/ # Event tracking wrapper
│   │   └── styles/        # CSS files (theme, design system, animations, responsive)
│   └── vite.config.ts
│
├── backend/           # FastAPI + SQLAlchemy
│   ├── app/
│   │   ├── main.py        # App factory, middleware, router mounting
│   │   ├── config.py      # pydantic BaseSettings
│   │   ├── database.py    # Engine + session factory
│   │   ├── auth/          # JWT + bcrypt + Google OAuth security
│   │   ├── models/        # User, ToolRun, Workspace ORM models
│   │   ├── routers/       # Route handlers per domain
│   │   ├── services/      # Business logic (LLM, parsing, scoring)
│   │   ├── schemas/       # Pydantic request/response models
│   │   └── prompts/       # Prompt builders per tool
│   ├── alembic/           # Database migrations
│   └── tests/             # pytest suite
│
├── docs/              # Specs, QA checklists
├── scripts/           # Image generation pipeline (Vertex Imagen)
└── pics/              # Brand assets
```

**Note**: The `admin/` directory (separate admin app) and `frontend-legacy/` directory are scheduled for removal — see §20 Cleanup Checklist.

### State Management Strategy

| What | Where | Lifetime |
|------|-------|----------|
| Auth state (user, status, health) | React Context (`SessionProvider`) | App lifecycle |
| Server data (history, runs) | TanStack React Query cache | Configurable stale time |
| Tool form drafts | `sessionStorage` (keyed per tool) | Tab lifecycle |
| Workflow context (cross-tool state) | `sessionStorage` | Tab lifecycle |
| Auth access token (JWT) | `HttpOnly secure cookie` (SameSite=Lax, 30min) | Until expiry |
| Auth refresh token (JWT) | `HttpOnly secure cookie` (SameSite=Lax, 7day, path=/auth/refresh) | Until expiry or logout |
| Guest demo runs | In-memory `Map` (never persisted) | Page lifecycle |
| Persisted runs & workspaces | Postgres via API | Permanent |
| Resume carry (cross-tool) | `sessionStorage` (`useResumeCarry`) | Tab lifecycle |
| Interview practice attempts | `sessionStorage` | Tab lifecycle |
| Theme preference | N/A (hybrid theme, no toggle) | — |
| Ad-gate unlock state | `sessionStorage` (keyed by runId) | Tab lifecycle |

> **Note**: Workflow context is intentionally **tab-scoped only**. Each browser tab has its own workflow. No cross-tab sync — users who want continuity should stay in one tab. This avoids sync complexity and race conditions.

> **Note**: Guest demo runs are NOT stored in sessionStorage. They exist only in an in-memory Map during the session. If the user navigates away, the results are gone — this is intentional to drive signup.

### Key Abstractions

- **ToolDefinition Registry** (`lib/tools/registry.ts`): Centralized metadata for all 6 tools — routes, icons, labels, configs, validators. Adding a new tool means adding one registry entry + prompt + service + router. No plugin system needed — the registry is extensible by design.
- **ApplicationHandoff** (`lib/tools/applicationHandoff.ts`): Passes resume analysis + job match results forward to cover letter & interview tools for richer context. **Silent when absent** — if a user skips earlier tools and goes directly to cover letter, handoff data is simply empty. No warning, no forced workflow order.
- **WorkflowContext** (`lib/tools/workflowContext.ts`): SessionStorage-persisted cross-tool state. Tracks resume text, job description, target role, and all intermediate results. Tab-scoped by design.
- **Tool Pipeline** (`services/tool_pipeline.py`): Shared decorator/pipeline for all 6 tool services. Handles: input sanitization → cache check → LLM call → heuristic fallback → cache set → persist. Each service only implements its own LLM call + prompt logic.
- **Vertex AI Client** (`services/ai_client.py`): Direct Vertex AI / Gemini Flash integration using **native async** (`generate_content_async`). Single provider for V1 — no multi-provider abstraction.
- **Quality Signals** (`services/quality_signals.py`): Heuristic prepass (detect sections, skills, keywords, quantified bullets) that runs before the LLM call. Used for scoring (Resume Analyzer & Job Match only), fallbacks, and evidence attribution.
- **Premium Outputs** (`services/premium_outputs.py`): Post-processing layer that enriches LLM results with computed metadata and workspace info.

---

## 4. The Six Tools

All tools follow the same UX pattern:
1. **Input Screen** — Resume upload/paste + tool-specific parameters
2. **CinematicLoader** — Animated loading with phase-based status messages (see §5 Loading UX)
3. **Result Screen** — Summary, verdict, top actions, detailed findings, export buttons, next-action cards

### Result Screen Architecture — Hybrid

**Shared wrapper** renders common elements: score ring (universal `ScoreRing` component), export bar, next-action cards, ad-gate overlay.
**Tool-specific component** renders the middle content area (e.g., Interview renders flip-cards/SwipeDeck, Cover Letter renders editable blocks, Resume renders issue list).
Adding a new tool = write one tool-specific result component + register in tool registry. Wrapper untouched.

### Score Visualization — Universal ScoreRing

All tools that display a score use the same `ScoreRing` component (SVG circular progress ring). Color semantics:

| Range | Color | Meaning |
|-------|-------|---------|
| 0–40 | Red-ish (`#ef4444`) | Weak / needs significant work |
| 41–69 | Amber/orange (`#f59e0b`) | Moderate / room for improvement |
| 70–100 | Green-ish (`#22c55e`) | Strong / on track |

The ring animates from 0 to the final score on first render (500ms ease-out). Score text uses tabular-nums for stable layout.

### 4.1 Resume Analyzer

**Route**: `/resume` → `/resume/result/$historyId`

**Input**: Resume text + optional job description

**Output**:
- Overall score (0-100) with confidence note
- Score breakdown: keywords, impact, structure, clarity, completeness
- Strengths list
- Issues list (severity, category, title, why_it_matters, evidence, fix)
- Evidence: detected_sections, detected_skills, matched_keywords, missing_keywords, quantified_bullets
- Optional role_fit (when job description provided)
- Top actions (prioritized)

**Score Semantics**: When a job description is provided, the score is **role-relative** (how well does this CV fit this specific role). Without a JD, the score is **absolute structural quality** (sections, quantified bullets, clarity, completeness). Scores are **independent per tool**. Each result screen includes a score explanation tooltip.

**Scoring**: **Weighted blend** of heuristic + LLM scores (see §9 for details). This is one of only two tools that use blended scoring.

**AI Details**: Prompt includes locked numeric fields and prepass heuristics. Quality signals module provides scoring baseline; LLM refines and validates. Final score = weighted blend of heuristic + LLM scores.

**Sector Detection**: When a JD is provided, the LLM automatically infers the sector (tech, finance, healthcare, creative) and adjusts the analysis criteria accordingly. No manual selector needed.

**Flows to**: Job Match, Portfolio, Career

### 4.2 Job Match

**Route**: `/job-match` → `/job-match/result/$historyId`

**Input**: Resume text + job description (both required)

**Output**:
- Overall fit score (0-100) + fit verdict (strong/moderate/weak)
- Matched keywords (green) + missing keywords (red)
- Requirements breakdown: must-have vs preferred, matched/partial/missing
- Resume evidence per requirement
- **Contextual improvement suggestions** (not raw keyword lists — see §4.2.1)
- Recruiter summary

**Scoring**: **Weighted blend** of heuristic + LLM scores. This is one of only two tools that use blended scoring.

**AI Details**: Extracts requirements from job posting, maps resume evidence to each, scores based on keyword overlap + evidence signals.

#### 4.2.1 Keyword Stuffing Prevention

Missing keywords are never shown as a raw list. Instead, each missing keyword is presented with **contextual guidance**:

> Instead of: "Missing: Docker"
> Shows: "Docker — Mention your Docker experience in the Experience section with a specific project example. Avoid simply listing it in skills."

The result screen includes an explicit warning: "These suggestions are for highlighting real experience, not for adding keywords you don't have."

**Flows to**: Cover Letter, Interview

### 4.3 Cover Letter Generator

**Route**: `/cover-letter` → `/cover-letter/result/$historyId`

**Input**: Resume + job description + tone (Professional / Confident / Warm)

**Optional Handoff**: Resume analysis + job match results for richer context

**Output**:
- Full letter draft with editable sections (opening, body paragraphs, closing)
- Per-section: why-this-paragraph notes, requirements used, evidence used
- Customization suggestions
- Confidence note ("advisory draft")

**Scoring**: LLM-only quality assessment (no heuristic blend). Score reflects letter completeness and personalization.

#### Tone Behavior — Structural Shift (~60% shared content)

Tone selection produces **structurally different** letters, not just vocabulary swaps:

| Tone | Opening Strategy | Body Focus | Evidence Selection |
|------|-----------------|------------|-------------------|
| **Professional** | Leads with qualifications and credentials | Systematic requirement-to-evidence mapping | Formal metrics and certifications |
| **Confident** | Leads with top achievements and impact | Bold claims backed by quantified results | Strongest accomplishments first |
| **Warm** | Leads with personal connection to company/mission | Narrative around passion + competence | Anecdotes and collaborative wins |

**Tone preview**: Each tone option shows a 1-sentence example opening (tooltip or inline preview) so users can see the concrete difference before choosing. Default: Professional.

#### Editable Blocks

Users can edit any section of the generated letter. Edits are **local only** — no auto re-evaluation, no coherence check between paragraphs. This is the user's responsibility. A "Re-evaluate with AI" button sends the edited version back through the LLM for consistency review and improvement suggestions. Export always uses the user's **last edited version** with no AI disclaimer.

**Flows to**: Interview, Job Match

### 4.4 Interview Q&A

**Route**: `/interview` → `/interview/result/$historyId`

**Input**: Resume + job description + num_questions (3-5)

**Optional Handoff**: Resume analysis + job match results

**Output**:
- Question deck (list mode or flip-card mode)
- Per question: text, difficulty label (Easy/Medium/Hard — display only, no filter), answer structure, weak signals addressed, key talking points, resume evidence
- Focus areas ranked by priority
- Gap-first practice plan

**Scoring**: LLM-only quality assessment (no heuristic blend).

#### Practice Mode

In addition to passive flip-cards, an **active practice mode** is available:
1. User sees a question
2. User types their answer in a text area
3. User submits → **separate lightweight LLM call** (cheaper model — Gemini Flash Lite or equivalent) evaluates the answer:
   - Strengths in the answer
   - Weak points / missing elements
   - Suggested improvements
   - Comparison with the ideal answer framework
4. User can re-attempt (max **2 attempts per question**)
5. After 2nd attempt → ideal answer framework shown + "Move to next question"
6. **Empty/blank submissions**: Count as an attempt but return guidance instead of evaluation
7. Attempt count shown: "Attempt 1/2"

**Cost control**: Max 5 questions × 2 attempts = 10 practice calls worst case (~$0.01-0.02). One interstitial ad covers this. Practice feedback uses a cheaper/lighter model than the main analysis to minimize cost.

**AI Details**: Generates role-specific questions, identifies weak signals from job match, builds answer frameworks around matched keywords + evidence.

**Flows to**: Cover Letter, Career

### 4.5 Career Path Recommender

**Route**: `/career` → `/career/result/$historyId`

**Input**: Resume + optional target role

**Output**:
- 3-5 recommended career directions
- Per path: discipline label, fit score (0-100), timeline (years), top skills to develop, rationale
- Missing skills analysis
- Seniority progression
- Next steps

**Scoring**: LLM-only quality assessment (no heuristic blend). Fit scores per path are LLM-generated.

**Personalization**: The LLM infers seniority level, years of experience, and career stage directly from the resume content. No additional survey or input fields needed.

**AI Details**: Infers current discipline + seniority from resume. Maps to `DISCIPLINE_TARGET_SKILLS` lookup. Scores paths based on resume fit and identifies skill gaps.

**Flows to**: Portfolio, Resume

### 4.6 Portfolio Planner

**Route**: `/portfolio` → `/portfolio/result/$historyId`

**Input**: Resume + target role (required)

**Output**:
- Strategy summary
- Recommended first project (title, description, complexity, deliverables)
- Full project roadmap (3-5 projects: foundational → intermediate → advanced)
- Per project: title, description, skills demonstrated, complexity, why this project, deliverables, hiring signals, estimated timeline
- Skill focus areas

**Scoring**: LLM-only quality assessment (no heuristic blend).

**Personalization**: Projects are **highly specific to the user's CV gaps**, not generic templates.

**Scope Note**: Portfolio Planner only recommends projects. It does **not** track project completion.

**AI Details**: Uses `ROLE_FOCUS_SKILLS` + `PROJECT_TEMPLATES` lookups. Selects templates matching target role. Personalizes descriptions based on resume content.

**Flows to**: Career, Resume

---

## 5. UI & UX

### Design System

**Hybrid theme** — dark sidebar/topbar with light content area. No light/dark toggle. Single cohesive hybrid theme.

| Token | Value | Scope |
|-------|-------|-------|
| Nav/sidebar background | `#0f1a2e` | Sidebar, topbar |
| Content background | `#edf3fa` | Main content area |
| Surface raised | `#ffffff` | Cards, panels |
| Primary interactive | `#0a66c2` | Buttons, links, accents |
| Primary hover | `#0a4f98` | Hover states |

Each tool has its own accent color via CSS custom properties (`--resume-accent`, `--match-accent`, `--letter-accent`, `--interview-accent`, `--career-accent`, `--portfolio-accent`) for visual differentiation in dashboard cards and tool pages.

### Internationalization (i18n)

**V1 language**: English only. The i18n infrastructure (react-i18next) may remain in the codebase for future use, but no translations are shipped in V1.

**LLM output language**: Independent of UI language — the LLM auto-detects input language and responds in the same language. If a user submits a Turkish CV, analysis comes back in Turkish.

**V1.1+**: Add language selector and translations (TR, DE, FR, ES, etc.).

### Page Anatomy

**Dashboard**:
- Hero section with resume dropzone (primary entry point)
- Tool showcase grid (all 6 tools as cards)
- Recent runs section (authenticated only)
- Favorite runs section (authenticated only, max 6 cards)
- First-time onboarding tour overlay (auto-starts, see §5.4)

**Tool Input Page** (`/[tool]`):
- Optional workspace dropdown at the top (not required — see §7.1)
- Resume upload area (drag-and-drop PDF/DOCX or paste text)
- Tool-specific parameters (job description, tone, question count, target role)
- **Input quality validation**: Soft warning if resume text is too short (<50 words). Does not block submission.
- "Run" action button

**Result Screen** (`/[tool]/result/$historyId`):
- Summary header with score/verdict + confidence note + score explanation tooltip
- Ad-gate overlay (see §10)
- Top actions panel (high/medium/low priority)
- Detailed findings sections
- Editable content blocks (where applicable)
- Export buttons (TXT, Markdown, PDF)
- Re-generate button with feedback field (see §5.3)
- Next-action cards linking to downstream tools (static, always the same per tool)

**History Page** (`/history`):
- Search by workspace label + tool name + result summary/verdict (not full payload)
- Filter by tool type
- Pagination (12 items/page)
- Workspace pinning + relabeling
- Pinned workspaces shown at top
- Favorite filter toggle
- Linked context tracking (cross-tool run chains)

### 5.1 Loading UX — Phase-Based Status

CinematicLoader shows **phase-based status messages** that reflect approximate processing stages:

```
Resume Analyzer:    "Reading your document..." → "Scanning the resume..." → "Extracting the text..." → "Preparing your analysis..."
Job Match:          "Reading the resume..." → "Comparing against the role..." → "Scoring fit and gaps..." → "Preparing the match view..."
Cover Letter:       "Reading your context..." → "Structuring the letter..." → "Tailoring the draft..." → "Finalizing the letter..."
Interview:          "Reading your resume..." → "Shaping interview questions..." → "Drafting answer guidance..." → "Preparing the practice deck..."
Career Path:        "Reading your experience..." → "Mapping possible directions..." → "Comparing role fit..." → "Preparing the path options..."
Portfolio:          "Reading your background..." → "Finding proof-building projects..." → "Sequencing the roadmap..." → "Preparing the plan..."
```

These are approximate, not tied to real backend events. Messages rotate on a timer.

**Minimum display time**: Even if the LLM responds in <2 seconds, the loader displays for a **minimum of 3 seconds** with at least 2 phase transitions.

**Page refresh protection**: While the loader is active, `beforeunload` event shows a browser confirmation dialog.

### 5.2 Resume Parse UX

When a user uploads a PDF/DOCX, the parsed text is shown as a "Resume text loaded" notice (via `ParsedResumeNotice`). The full extracted text is **hidden by default** — the user can click "Review extracted text" to expand and edit if needed.

If parsing fails completely, there is no recovery — the user must paste their resume text manually.

### 5.3 Re-generate with Feedback

Every result screen has a "Re-generate" button with an optional feedback text field:

1. User clicks "Re-generate"
2. **Confirmation dialog**: "Current result will be replaced. Continue?"
3. Optional: Types what was wrong ("Too generic, make it more specific")
4. Feedback is injected into the prompt as additional instruction
5. Temperature may be slightly increased for variation
6. **Re-generate bypasses cache** — always makes a fresh LLM call
7. **New ToolRun row is always created** — old result preserved in DB via `parent_run_id` chain. Authenticated users can find previous runs in history. Score delta tracking enabled.

### 5.4 Onboarding Tour

**Trigger**: Auto-starts on first visit. Skip button available at every step.

**Steps** (3-4):
1. Resume dropzone introduction
2. Tool showcase grid
3. Workflow continuity
4. Guest vs Auth

**Replay**: Available from Settings page.

### 5.5 Error Handling

**React Error Boundary**: Catches render crashes. Shows a friendly error page with:
- "Something went wrong" message
- "Try Again" button (re-renders the component tree)
- "Go to Home" link
- Background: `frontend_error` telemetry event + Sentry error report

### 5.6 Export Formats

| Format | Available For | Access | Implementation |
|--------|--------------|--------|---------------|
| TXT | All tools | Everyone (guest + auth) | Client-side generation from result JSON |
| Markdown | All tools | Everyone (guest + auth) | Client-side generation from result JSON |
| PDF | Cover Letter, Interview Q&A | Auth only | Backend generation (WeasyPrint/ReportLab) |

Export always uses the user's **last edited version**. No AI disclaimer in exports.

### CSS Architecture

```
styles/
├── theme.css              # CSS custom properties (colors, spacing, radii, per-tool accents)
├── design-system.css      # Utility classes
├── base.css               # Reset + global styles
├── typography.css         # Font definitions, size scale
├── animations.css         # Keyframe animations (fade, slide, spin, pulse)
├── shell.css              # Layout (sidebar, topbar, main content area)
├── landing.css            # Marketing hero, CTA, gradients
├── dashboard.css          # Dashboard-specific styles
├── tooling.css            # Tool input/result layouts
├── tooling-fullscreen.css # Mobile full-screen edit sheets, swipe deck
├── results.css            # Result card templates
├── settings.css           # Settings page
├── history.css            # History page
├── auth.css               # Auth dialogs
└── responsive.css         # Mobile-first breakpoints
```

### Responsive Strategy

Mobile-first with three breakpoints via `useBreakpoint` hook:

| Breakpoint | Max Width | Behavior |
|-----------|-----------|----------|
| `mobile` | 639px | Bottom tab bar, stacked layouts, SwipeDeck for results, StickyRunBar |
| `tablet` | 1024px | Hybrid layout, collapsible sidebar |
| `desktop` | >1024px | Full sidebar, split layouts, showcase grid |

### Accessibility

Target: **WCAG 2.1 AA** full compliance.

- Keyboard navigation for all interactive elements
- ARIA labels on custom components
- Sufficient color contrast ratios (4.5:1 minimum for text)
- Focus indicators on all focusable elements
- Live regions for CinematicLoader phase announcements
- Focus management for ad-gate overlay (focus trap)
- Color-independent status indicators (not just green/red — use icons + labels)
- All animations respect `prefers-reduced-motion`

---

## 6. Data Flow & API

### Base URL: `/api/v1`

### Endpoints

#### Auth
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | No | Email + password → JWT token (set as HttpOnly cookies) |
| POST | `/auth/register` | No | Create account → user object. Disposable email domains blocked. |
| POST | `/auth/refresh` | Refresh cookie | Refresh token → new access token cookie |
| GET | `/auth/me` | Bearer | Current user profile |
| DELETE | `/auth/me` | Bearer | Delete account + all data (GDPR/RODO compliance) |
| GET | `/auth/providers` | No | OAuth provider list (`["google"]`) |
| GET | `/auth/google` | No | Initiate Google OAuth flow → redirect to Google |
| GET | `/auth/google/callback` | No | Google OAuth callback → JWT cookies + redirect |
| POST | `/auth/password-reset/request` | No | Send password reset email (via Resend) |
| POST | `/auth/password-reset/confirm` | No | Reset token + new password → update password |

#### Files
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/files/parse-cv` | No | PDF/DOCX upload (max 10MB) → extracted text |

#### Job Posts
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/job-posts/import-url` | No | URL → scraped job description (BS4, Playwright fallback) |

#### Tools (all POST, auth optional — required for persistence)
| Path | Input | Output |
|------|-------|--------|
| `/resume/analyze` | resume_text, job_description?, parent_run_id?, feedback?, workspace_context? | Score, breakdown, issues, evidence |
| `/job-match/match` | resume_text, job_description, parent_run_id?, feedback?, workspace_context? | Fit score, verdict, keyword analysis |
| `/cover-letter/generate` | resume_text, job_description, tone?, parent_run_id?, feedback?, resume_analysis?, job_match?, workspace_context? | Letter draft with sections |
| `/interview/questions` | resume_text, job_description, num_questions?, parent_run_id?, feedback?, resume_analysis?, job_match?, workspace_context? | Question deck with answer frameworks |
| `/interview/practice-feedback` | question, user_answer, model_answer | Strengths, weaknesses, suggestions |
| `/career/recommend` | resume_text, target_role?, parent_run_id?, feedback?, workspace_context? | Career paths with scores |
| `/portfolio/recommend` | resume_text, target_role, parent_run_id?, feedback?, workspace_context? | Project roadmap |

#### History (authenticated only)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/history?tool=&favorite=&q=&page=&page_size=` | Paginated run list |
| GET | `/history/{id}` | Run detail with full result payload |
| DELETE | `/history/{id}` | Delete a run |
| PATCH | `/history/{id}/favorite` | Toggle favorite |
| GET | `/history/{id}/export/pdf` | PDF export (auth required) |
| GET | `/history/workspaces` | Workspace list |
| PATCH | `/history/workspaces/{id}` | Update label/pin |

#### Other
| Method | Path | Description |
|--------|------|-------------|
| POST | `/telemetry/events` | Async event logging |
| GET | `/health` | Backend health check |

### 6.1 Job Scraper — BS4 + Playwright Fallback

1. **BS4 first**: Lightweight HTML parsing for static pages. Fast, no dependencies.
2. **Playwright fallback**: If BS4 returns insufficient data, retry with headless Chromium (JS rendering). Handles LinkedIn, Indeed, and other JS-heavy sites.
3. **Both fail**: "Could not extract the job description. Please copy and paste it." + textarea immediately shown.
4. **Partial data**: Pre-fill textarea with whatever was scraped, highlight missing sections.
5. **Timeout**: 10 seconds per attempt (BS4: 5s, Playwright: 10s).
6. **Legal**: User-initiated single-page scraping. Not bulk harvesting. Minimal legal risk.
7. **Technical blocking**: LinkedIn/Indeed may CAPTCHA or block. Playwright improves success rate but doesn't guarantee it. Graceful fallback to paste is the safety net.

### Data Models

```
User
├── id (UUID)
├── email (unique)
├── hashed_password (nullable — null for OAuth-only users)
├── full_name (optional)
├── google_id (optional — for OAuth users)
├── is_admin (boolean, default false)
├── created_at
└── updated_at

ToolRun
├── id (UUID)
├── user_id (FK → User)
├── workspace_id (FK → Workspace, optional)
├── parent_run_id (FK → ToolRun, optional — for revision chains)
├── feedback_text (optional — user's re-generate feedback)
├── tool_name (enum: resume, job-match, cover-letter, interview, career, portfolio)
├── result_payload (JSON — full LLM response)
├── _workspace_meta (JSON — summary, recommendations, linked IDs)
├── is_favorite (boolean)
├── created_at
└── updated_at

Workspace
├── id (UUID)
├── user_id (FK → User)
├── label (string — e.g., "Google - Backend Dev", "Stripe - SRE")
├── is_pinned (boolean)
├── created_at
└── updated_at
```

### Run Lineage (Revision Chain)

Every re-generate creates a **new ToolRun row** with `parent_run_id` pointing to the previous run. Old results are always preserved in history. When linked:
- Result screen shows score delta ("+14 since last run")
- History shows revision chain as grouped entries
- Workspace view shows improvement progression

### Account Deletion (GDPR/RODO)

Settings page includes a single "Delete my account" button. On confirmation:
- All tool runs deleted
- All workspaces deleted
- User record deleted
- Immediate, no 30-day grace period
- Compliant with GDPR/RODO "right to be forgotten"

### Schema Versioning & Compatibility

Result payloads include version tags (e.g., `quality_v2`, `planning_v1`). When schema evolves:
- **Read-time transform**: Old data is never migrated. Frontend checks the version tag on read and transforms to current format.
- No write-time data migrations on result_payload.

---

## 7. Workflow Continuity

### Workflow Paths

```
Resume Analyzer ──→ Job Match ──→ Cover Letter
                              └──→ Interview Q&A

Resume Analyzer ──→ Career Path ──→ Portfolio Planner

(any tool) ──→ Resume Analyzer (refresh context)
```

### How It Works

1. **WorkflowContext** persists in sessionStorage across tool navigations. Stores: resume text, job description, target role, and all prior tool results. **Tab-scoped** — each tab has its own workflow.

2. **ApplicationHandoff** bundles resume analysis + job match results into a context object that cover letter and interview tools consume. **Silent when absent**.

3. **Linked Context IDs** track which runs are part of the same workflow chain.

4. **Next-Action Cards** on every result screen suggest the logical next tool. **Static** — always the same cards per tool:
   - Resume → Job Match, Portfolio
   - Job Match → Cover Letter, Interview
   - Cover Letter → Interview, Job Match
   - Interview → Cover Letter, Career
   - Career → Portfolio, Resume
   - Portfolio → Career, Resume

### 7.1 Workspace Scope — Application-Based

Each job application is a separate workspace. Label format suggestion: `"Company - Role"` — shown as placeholder, **not enforced**.

**Workspace picker**: Optional dropdown at the top of tool input pages. Not required — if no workspace is selected, the run is saved as "Unassigned".

**Auto-suggest**: After a tool run with JD, the system suggests a workspace name by extracting company + role from the JD content.

---

## 8. Authentication & Security

### Authentication Flow

**Email/Password**:
1. User submits email + password to `/auth/login`
2. Backend verifies with bcrypt, issues JWT
3. **Two HttpOnly secure cookies set**: access token (30min, SameSite=Lax) + refresh token (7day, SameSite=Lax, path=/auth/refresh)
4. All subsequent requests include cookies automatically

**Google OAuth**:
1. User clicks "Sign in with Google" → redirected to `/auth/google`
2. Backend (authlib) redirects to Google consent screen
3. Google redirects back to `/auth/google/callback` with auth code
4. Backend exchanges code for Google user info, creates/matches User record (via `google_id` or email)
5. Backend issues own JWT cookies (same as email/password flow)
6. User redirected to dashboard

**No email verification required** — users can register and immediately use all features. Zero friction signup.

**Disposable email blocking**: Registration rejects emails from known disposable/temporary email domains (mailinator, guerrillamail, etc.) using a maintained blocklist. This prevents guest limit bypass via throwaway accounts.

### Password Reset

1. User clicks "Forgot password" on login page
2. Submits email → backend sends reset email via Resend (free tier)
3. Email contains a time-limited reset link (token expires in 1 hour)
4. User clicks link → enters new password → password updated
5. All existing sessions invalidated

### Silent Token Refresh

Access tokens expire in 30 minutes. Before expiry, the frontend calls `/auth/refresh` (which reads the refresh cookie). This happens silently. If refresh fails (user inactive >7 days), an in-place auth dialog opens — no page redirect.

### CSRF Protection

**SameSite=Lax cookies** provide CSRF protection. Combined with CORS (only whitelisted origins) and JSON Content-Type (triggers preflight for cross-origin), this is sufficient for a modern SPA. No double-submit cookie pattern needed.

### Prompt Injection Protection

1. **System prompt guard**: Explicit instruction to never follow instructions embedded in user content.
2. **Heuristic independence**: Numeric scores from heuristic prepass are computed independently of the LLM.

**No input sanitization** — pattern-based filtering produces false positives and is trivially bypassed.

### Security Headers

| Header | Value |
|--------|-------|
| Content-Security-Policy | `default-src 'none'; frame-ancestors 'none'` |
| X-Content-Type-Options | `nosniff` |
| X-Frame-Options | `DENY` |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Permissions-Policy | No camera, microphone, geolocation |

### Rate Limiting

| Endpoint Group | Limit |
|---------------|-------|
| Tool endpoints (analyze, match, etc.) | 10 req/min per IP |
| Login | 10 req/min per IP |
| Register | 5 req/min per IP |
| Parse CV | 20 req/min per IP |
| Password reset request | 3 req/min per IP |

### Abuse Protection

- **Rate limiting** (slowapi, IP-based) is the primary defense
- **Disposable email blocking** prevents throwaway account abuse
- **Google OAuth** naturally filters bots (hard to automate Google sign-in)
- **CAPTCHA**: Deferred to V1.1. If abuse is detected post-launch, Cloudflare Turnstile (invisible) will be added.

### CORS

Configured in FastAPI CORSMiddleware. Origins whitelist set via `CORS_ORIGINS` env var. Railway provides same-domain routing so CORS is minimal.

### Terms of Service

Registration requires ToS acceptance. ToS includes comprehensive disclaimer: "AI-generated content is advisory. The platform is not responsible for outcomes of using AI-generated materials in real job applications."

---

## 9. LLM Integration Details

### Provider Architecture

```
Vertex AI Client (ai_client.py)
│
├── Primary → Google Vertex AI (Gemini 2.5 Flash)
│              Native async (generate_content_async)
│              JSON response_mime_type
│
└── Practice → Google Vertex AI (Gemini Flash Lite or equivalent)
               Lower cost model for interview practice feedback
```

**V1**: Single provider, no routing layer. Direct Vertex AI integration using **native async** (`generate_content_async`). No `asyncio.to_thread` wrapper needed.

### Prompt Architecture

Each tool has a dedicated prompt builder in `backend/app/prompts/`:

1. **System Prompt**: Role instructions, expected JSON schema, rules, prompt injection guard, language detection
2. **User Prompt**: Locked numeric fields (precomputed scores), prepass analysis, raw content, optional feedback, optional sector
3. **Optional JSON Schema**: For strict schema mode

### Score Authority — Blended Scoring (Resume Analyzer & Job Match Only)

**Only Resume Analyzer and Job Match** use weighted blend scoring:

```
final_score = (heuristic_weight × heuristic_score) + (llm_weight × llm_score)
```

Default weights: heuristic 40%, LLM 60%. When the gap between heuristic and LLM is large (>20 points), the confidence note reflects this.

**All other tools** (Cover Letter, Interview, Career, Portfolio) use **LLM-only scoring**. Heuristics for generative tools don't produce meaningful scores — you can't meaningfully score a cover letter draft with paragraph counts.

Config flag `BLENDED_SCORING_ENABLED` allows toggling blended scoring on/off.

### Quality Signals Pipeline

```
Raw Input
  │
  ▼
Heuristic Prepass (quality_signals.py)
  ├── Detect sections (education, experience, skills, etc.)
  ├── Extract skills (semi-static skill lists + LLM augmentation)
  ├── Find quantified bullets ("increased X by Y%")
  ├── Compute keyword overlap (resume vs job description)
  └── Generate preliminary scores (Resume Analyzer & Job Match only)
  │
  ▼
LLM Call (ai_client.py — native async)
  ├── System prompt + user prompt with prepass data
  ├── Temperature: 0.3 (low variance)
  ├── Timeout: 120 seconds
  └── Response parsed as JSON
  │
  ▼
Post-Processing (premium_outputs.py)
  ├── Validate LLM output against expected schema
  ├── Blend heuristic + LLM scores (Resume & Job Match only)
  ├── Attach workspace metadata
  └── Persist to database (if authenticated)
```

### Retry Strategy

**3 retries with exponential backoff** on LLM failures:

| Attempt | Wait | Trigger |
|---------|------|---------|
| 1st retry | 1 second | JSON parse error, timeout, provider error |
| 2nd retry | 2 seconds | Same |
| 3rd retry | 4 seconds | Same |
| After 3rd | Fallback | Tool-specific fallback (see below) |

### Result Caching

Identical inputs (content-hash) return cached results for **1 hour**. Cache key: SHA-256 of normalized input.

**Implementation**: In-memory dict with TTL. Does not survive server restarts. Acceptable for V1 — migrate to Redis when production traffic warrants it.

**Re-generate bypass**: Re-generate requests always skip the cache.

Config flags: `RESULT_CACHE_ENABLED`, `RESULT_CACHE_TTL_SECONDS`.

### Request Lifecycle — Orphan Request Handling

Frontend uses **AbortController** to cancel in-flight requests when:
- User closes the tab (via `beforeunload`)
- User navigates to an external URL

**SPA-internal navigation does NOT abort requests** — the request continues in the background. The MiniLoader indicator tracks the pending request.

### Fallback Strategy — Tool-Specific

**Silent heuristic fallback** (Resume Analyzer, Job Match):
- Heuristic-only results presented as normal — no degraded-mode notice
- Score is heuristic-only (no blend)

**Explicit error + retry** (Cover Letter, Interview Q&A, Career Path, Portfolio):
- These tools cannot produce meaningful output from heuristics alone
- Show error message: "Analysis could not be completed. Please try again."
- Retry button available

### Language Handling

No explicit language selector. The LLM **auto-detects input language** and responds in the same language.

---

## 10. Monetization — Hybrid Revenue Model

### Model: Ad-Gated Partial Lock + Future Premium Tier

The platform uses a **hybrid monetization** approach:

**V1 (Launch)**: Ad-gated partial lock for all users
**V1.1**: Add premium subscription tier ($5-10/month) for ad-free unlimited access

### V1 Ad-Gate Flow

1. User submits input → tool runs → analysis completes
2. **Summary section is shown for free** (score, verdict, top-level findings)
3. **Detailed sections are locked** (full issue list, evidence, fixes, export, editable blocks)
4. To unlock: user watches/clicks through an ad
5. Full results are revealed after ad interaction

### Ad Completion Verification

Ad unlock uses **client-side sessionStorage** keyed by run ID: `ad-unlocked:{runId}`.

- Client-side: Ad SDK completion callback triggers immediate unlock
- Tab open → unlocked persists
- Tab close → reset (sessionStorage behavior)
- History revisit in new tab → ad required again
- Guest runs use a client-side temporary UUID as the runId key
- **Bypass risk accepted**: DevTools-savvy users can bypass. This is pragmatic for V1 — the technical %1 is not worth server-side unlock infrastructure.

**Unlock UX**: After ad completion, sections use **progressive reveal** — lock icons disappear and sections become tappable, but remain collapsed. No sudden page growth.

### Ad Provider Roadmap

| Phase | Timing | Provider | Format | Expected CPM |
|-------|--------|----------|--------|-------------|
| **Phase 1** | Launch | Google AdSense | Vignette interstitials + Auto Ads | $3-$8 (career niche) |
| **Phase 2** | Month 2-3 | Google AdSense Rewarded | "Watch ad to unlock" format | $15-$35 (career niche, Tier-1) |
| **Phase 3** | 10K+ sessions | Google Ad Manager + GPT Rewarded | Header bidding, true rewarded callbacks | +20-50% revenue uplift |
| **Phase 4** | 25K+ pageviews | Mediavine or Raptive | Premium managed ad network | $15-$30 CPM |

### Revenue Projections

| Daily Runs | Monthly Ad Revenue (conservative) | Monthly Ad Revenue (strong) |
|---|---|---|
| 1,000 | $51 | $136 |
| 10,000 | $510 | $1,360 |
| 100,000 | $5,100 | $13,600 |

*After 35% ad-blocker loss and 90% fill rate. Career/jobs niche commands premium CPMs.*

### Ad Blocker Handling

If ad blocker is detected (bait-element technique):
- **Alternative unlock: 30-second countdown timer** — "Results unlocking in 30s..."
- Results unlock after countdown completes
- No revenue from this user but engagement preserved
- The 30-second wait creates equivalent friction to ad viewing
- Signing up does NOT bypass ads — it only enables result persistence

### V1.1 Premium Tier (Planned)

- **Price**: $5-10/month
- **Features**: No ads, unlimited tool runs, priority processing
- **Payment processor**: TBD (Stripe, Paddle, or Lemon Squeezy — decision deferred to V1.1)
- **Projected revenue**: At 10K DAU with 3% conversion = ~$2,100/month (exceeds ad revenue)

### V1.1 Affiliate Revenue (Planned)

- Contextual affiliate links in result pages (Coursera, TopResume, Udemy, LinkedIn Premium)
- Career niche has natural affiliate fit — 15-45% commissions
- Also serves as ad-blocker fallback (show affiliate offers instead of ads)

### SPA Ad Implementation

```
useAd() Hook
├── Detect ad blocker (bait-element probe)
├── If no blocker:
│   ├── Phase 1: Trigger AdSense vignette
│   └── Phase 2+: Trigger GPT rewarded slot
│       ├── On reward granted → unlock content
│       └── On dismiss/error → fallback to countdown
├── If blocker detected:
│   └── Show 30-second countdown timer
└── Track events (telemetry: unlock_method, geo, completion)
```

**Critical SPA rules**:
- Load ad scripts ONCE (not per route change)
- Refresh ads on route change via `googletag.pubads().refresh()`
- Destroy ad slots on component unmount

### GDPR/RODO Ad Compliance

- Google AdSense includes TCF 2.2 consent management (CMP)
- CMP detects user location and shows appropriate consent form
- Non-personalized ads served when consent is declined (~50% lower CPM)
- Poland (RODO) follows GDPR — Google CMP handles this automatically

---

## 11. Admin Panel

### V1: Integrated Admin Routes

Admin panel lives **inside the main frontend** as `/admin/*` routes, protected by `is_admin` check. No separate application, no separate deployment.

**Note**: The separate `admin/` directory in the repo is legacy and should be removed (see §20 Cleanup).

### Features

- **User management**: List, search by email, view user details with recent runs, toggle admin flag
- **Telemetry dashboard**: Total users, total runs, runs today, active users (7d), runs-by-tool breakdown
- **Run moderation**: View all runs cross-user, filter by tool type, click for full result_payload JSON viewer
- **System health**: Database status, LLM provider/model, cache enabled/entries, environment

### Admin API Endpoints

All endpoints require `is_admin = true`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/users?page=&page_size=&q=` | Paginated user list, searchable by email |
| GET | `/admin/users/{id}` | User detail with 10 most recent runs |
| PATCH | `/admin/users/{id}/admin` | Toggle is_admin flag (cannot modify self) |
| GET | `/admin/runs?page=&page_size=&tool=&user_id=` | Paginated runs list |
| GET | `/admin/runs/{id}` | Full run detail with result_payload |
| GET | `/admin/stats` | Aggregate metrics |
| GET | `/admin/health` | Extended health |

### Access Control

Admin users are identified by `is_admin` boolean on the User model. Initially set via direct database access. Admin API endpoints are protected with `get_current_admin` FastAPI dependency.

---

## 12. Concerns & Tradeoffs

### Architecture Decisions

| Decision | Why | Tradeoff |
|----------|-----|----------|
| **TanStack Start over Next.js** | More flexibility, lighter framework opinions, better router DX | Smaller ecosystem, fewer deployment targets |
| **Railway for everything** | Single platform, student-friendly pricing, Postgres included | Less CDN optimization than Vercel for frontend |
| **SessionStorage for client state** | Fast, no server round-trips, clean tab isolation | Lost on tab close, no cross-device sync |
| **Single-provider LLM (Gemini Flash)** | No response format normalization, simpler code | Vendor lock-in risk, no failover |
| **Heuristic prepass (Resume + Job Match only)** | Grounds scoring in measurable signals, provides fallback | Maintenance burden for heuristic rules |
| **Hybrid monetization (ads + future premium)** | Covers LLM costs now, subscription revenue later | Ad UX friction; premium tier deferred |
| **Google OAuth V1** | Reduces signup friction dramatically | Additional auth complexity |
| **BS4 + Playwright scraper** | Best effort at JS-rendered sites | Playwright adds ~150MB, sites may still block |
| **Client-side ad unlock** | Simple, no server infrastructure | Bypassable via DevTools |
| **English only V1** | Realistic scope for single developer | Excludes non-English users |
| **In-memory cache** | Simple, no external dependencies | Lost on restart |
| **SameSite cookie (no CSRF tokens)** | Modern browsers handle it, simpler code | Older browsers may not support SameSite |

### Security Considerations

| Concern | Current State | Risk Level |
|---------|--------------|------------|
| **JWT in HttpOnly cookies** | Two cookies (access + refresh), SameSite=Lax | Low |
| **Google OAuth** | authlib, standard OAuth2 flow | Low |
| **No email verification** | Disposable email blocklist as mitigation | Low-Medium |
| **Prompt injection** | System prompt guard + heuristic independence | Low-Medium |
| **Rate limiting by IP** | slowapi per-IP token bucket | Low-Medium |
| **Password reset** | Time-limited token via email | Low |

### Performance Concerns

| Concern | Impact | Mitigation |
|---------|--------|------------|
| **LLM latency (5-30s)** | Long perceived wait | Phase-based CinematicLoader with 3s minimum |
| **No streaming** | Full request-response cycle | Future consideration for v2 |
| **Job scraping fragility** | BS4 fails on JS sites, Playwright may be blocked | Graceful fallback to copy-paste |
| **Railway Postgres cold start** | First request slightly slower | Acceptable |
| **Playwright container size** | ~150MB addition | Acceptable on Railway (Docker) |

### Product Gaps (Acknowledged, Not Planned)

| Gap | Status |
|-----|--------|
| No real-time LLM streaming | Future (v2) |
| No collaboration / sharing | Not planned — export covers this |
| No automated job discovery | Not planned |
| No mobile native app | Not planned (responsive web sufficient) |
| No A/B testing framework | Not planned |
| Portfolio project tracking | Out of scope |
| Full dark mode | Not planned — hybrid theme is the design |
| CV library / version management | Not planned — each run is independent |

---

## 13. Testing & QA

### Automated Testing

**Frontend** (Vitest + React Testing Library):
- Setup: `src/test/setup.ts`
- Pattern: Render component → simulate interaction → assert DOM state
- Coverage: Components, hooks, utilities, integration flows

**Backend** (pytest + pytest-asyncio):
- Fixtures: In-memory database, mock LLM responses
- Pattern: Create test client → hit endpoint → assert response schema
- Coverage: Route handlers, services, auth flows, validation

### Manual Test Flow

1. Upload resume (PDF/DOCX or paste text)
2. Run Resume Analyzer → verify score + issues
3. Run Job Match with a target job → verify fit score + keyword analysis
4. Generate Cover Letter → verify sections + evidence
5. Generate Interview Q&A → verify questions + answer frameworks
6. Export results as TXT/Markdown/PDF → verify formatting
7. Test re-generate with feedback → verify different output + new history entry
8. Sign in (email + Google OAuth) → verify run persistence
9. Test favorites, workspace pinning, search, pagination
10. Test ad gate → verify partial lock/unlock flow
11. Test ad blocker → verify 30-second countdown fallback
12. Test input validation → verify soft warnings on short input
13. Test scraper failure → verify graceful fallback to paste
14. Test account deletion → verify all data removed
15. Test password reset flow → verify email + token + password update

---

## 14. Environment & Deployment

### Environment Variables

#### Backend

```env
# Database (Railway Postgres)
DATABASE_URL=postgresql://...                  # Railway connection string

# Auth
SECRET_KEY=<random-secret-min-32-chars>
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
ALGORITHM=HS256

# Google OAuth
GOOGLE_CLIENT_ID=<google-oauth-client-id>
GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
GOOGLE_REDIRECT_URI=https://app.com/api/v1/auth/google/callback

# Email (Resend)
RESEND_API_KEY=<resend-api-key>
PASSWORD_RESET_FROM_EMAIL=noreply@app.com

# LLM Provider (V1: Vertex AI only)
LLM_PROVIDER=vertex
LLM_MODEL=gemini-2.5-flash
LLM_PRACTICE_MODEL=gemini-flash-lite
VERTEX_PROJECT_ID=<gcp-project-id>
VERTEX_LOCATION=us-central1

# Feature Flags
RESULT_CACHE_ENABLED=true
RESULT_CACHE_TTL_SECONDS=3600
BLENDED_SCORING_ENABLED=true

# Server
CORS_ORIGINS=https://app.com
ENVIRONMENT=production
SENTRY_DSN=<sentry-dsn>
```

#### Frontend

```env
VITE_API_URL=https://app.com/api/v1
VITE_AD_CLIENT_ID=<adsense-publisher-id>
VITE_SENTRY_DSN=<sentry-frontend-dsn>
```

### Local Development

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
pnpm install
pnpm dev
```

### Production Deployment (Railway)

**Architecture**: Single Railway project with three services:

1. **Backend service**: FastAPI container (Dockerfile or Nixpack auto-detect)
   - Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - Pre-deploy command: `alembic upgrade head` (automatic migration)
2. **Frontend service**: Static SPA (Vite build output served via a simple static server)
3. **Postgres service**: Railway managed Postgres

**Domain routing** (same domain, path-based):
- `app.com/api/*` → backend service
- `app.com/*` → frontend service
- Railway handles SSL automatically

**Security**: Railway provides automatic SSL, private networking between services, encrypted environment variables. Cloudflare can be added later for DDoS protection if needed.

**Database migrations**: `alembic upgrade head` runs automatically as a pre-deploy command. Rollback: `alembic downgrade -1` via Railway CLI.

### Monitoring

- **Railway dashboard**: CPU, RAM, uptime, request logs
- **Sentry (free tier)**: Error tracking, 5K events/month. Integrated in both frontend (React ErrorBoundary) and backend (FastAPI middleware).
- **Telemetry**: Custom events via `/telemetry/events` endpoint → admin dashboard

---

## 15. Telemetry & Analytics

### Purpose: Product Analytics (Session-Scoped, User-Blind)

Telemetry events are **session-scoped** — an anonymous `session_id` (UUID, generated client-side) is attached to events. No `user_id` is ever attached. GDPR/RODO-safe, no consent banner required for telemetry (no PII collected).

### Events Tracked

| Event | Data |
|-------|------|
| `tool_run_started` | tool_id, access_mode (guest/auth) |
| `tool_run_succeeded` | tool_id, access_mode, history_id, saved |
| `tool_run_failed` | tool_id, error_message, access_mode |
| `tool_regenerate` | tool_id, has_feedback |
| `export_action_used` | tool_id, format (txt/md/pdf) |
| `ad_shown` | tool_id, ad_type |
| `ad_completed` | tool_id, ad_type, unlock_method |
| `ad_blocked` | tool_id (ad blocker detected) |
| `countdown_completed` | tool_id (30s timer finished) |
| `auth_signup_source` | source (organic/post-run), method (email/google) |
| `workflow_continued` | from_tool, to_tool |
| `frontend_error` | route, error_message |

---

## 16. Schema Versioning

Result payloads include version tags. New schema versions are handled via **read-time transform** — old data is never migrated.

---

## 17. Mobile Frontend Specification

> Design philosophy: Apple/Stripe-inspired simplicity. Premium feel, zero clutter.

### 17.1 Breakpoints

| Tier | Range | Layout Behavior |
|------|-------|----------------|
| **Mobile** | `<640px` | Bottom tab bar, single-column, full-screen sheets, swipe gestures |
| **Tablet** | `640–1024px` | Sidebar visible but compact, 2-column tool grid |
| **Desktop** | `>1024px` | Full sidebar, multi-column layouts, hover interactions |

### 17.2 Navigation

**Bottom Tab Bar** (mobile only):

**Guest** (3 tabs): Home | Tools | Sign In
**Authenticated** (4 tabs): Home | Tools | History | Profile

### 17.3 Dashboard (Mobile)

- Upload Resume box: Large, prominent, primary CTA
- Tool grid: 2 columns × 3 rows with scroll-triggered entrance animation
- Recent runs + Favorites: Horizontal scroll carousels (auth only)

### 17.4 Tool Input Pages

- **Resume auto-carry** via sessionStorage
- **Upload primary** (no drag-and-drop on mobile) + collapsed paste textarea
- **Job description**: URL input first, textarea collapsed below
- **Sticky bottom Run bar** with smart keyboard hide
- **Workspace selector**: Hidden by default, "Add to application" chip

### 17.5 CinematicLoader (Mobile)

Full-screen, **swipe down to minimize**. Backend request continues in background. MiniLoader indicator tracks pending request.

### 17.6 Result Pages (Mobile)

- Score + verdict + top actions: Always expanded, above fold
- Remaining sections: Accordion, collapsed
- Export: Single "Share" button → native OS share sheet
- Re-generate: Bottom sheet with feedback textarea
- Next-action cards: Horizontal scroll carousel

### 17.7 Ad Gate (Mobile)

Clean "Unlock Full Results" button. Full-screen interstitial ad. Progressive reveal after unlock.

### 17.8 Interview Q&A — Swipe Deck (Mobile)

Tinder-style card deck. Swipe right/left for navigation. Tap to flip. Two buttons: "Flip Answer" (passive) + "Practice" (active, opens full-screen sheet).

### 17.9 History Page (Mobile)

Search bar + horizontal filter chips + full-width run cards. Swipe-to-delete. Pull-to-refresh. Infinite scroll.

### 17.10 Performance Budget

| Metric | Target |
|--------|--------|
| Initial JS bundle (gzip) | <200KB (route-based code splitting) |
| Lighthouse Performance (mobile) | >90 |
| First Contentful Paint | <1.5s (4G) |
| Time to Interactive | <3.0s (4G) |
| Largest Contentful Paint | <2.5s (4G) |

### 17.11 PWA Support

**Manifest only** — "Add to Home Screen" without service worker. Platform is fully online-dependent.

### 17.12 Touch Targets & Spacing

All interactive elements: minimum 44×44px (Apple HIG). Button/input height: 48px on mobile.

### 17.13 Animations

All animations respect `prefers-reduced-motion`. Key animations: dashboard card pop-in, CinematicLoader sequence, page transitions (200ms fade), bottom sheet slide, card flip (400ms 3D Y-axis), accordion expand.

---

## 18. Frontend Implementation Details

### 18.1 Theme

Hybrid theme (dark navigation + light content). No toggle. Theme variables in `frontend/src/styles/theme.css`.

### 18.2 Guest Workflow — Lightweight Handoff

Guest cover letters and interview prep get personalization from prior runs via lightweight summary (~2KB) in sessionStorage — score, top keywords, matched requirements, verdict. Full result_payload is NOT stored.

### 18.3 Editable Blocks — Scope

| Tool | Editable? | What's editable |
|------|-----------|----------------|
| **Resume Analyzer** | Read-only | Nothing |
| **Job Match** | Read-only | Nothing |
| **Cover Letter** | ✓ Editable | Opening, body paragraphs, closing |
| **Interview Q&A** | Read-only | Nothing |
| **Career Path** | Read-only | Nothing |
| **Portfolio** | Read-only | Nothing |

### 18.4 Workspace Creation — Lazy + Auto-Suggest

Workspaces are created **after** a tool run. Auto-suggest workspace name by extracting company + role from JD content.

### 18.5 Token Expiry — In-Place Auth

When silent token refresh fails, an in-place auth dialog opens — no page redirect. Form state preserved.

### 18.6 Landing Page — Single Variant

The current active landing page is the final production variant. All other landing experiments/variants should be removed (see §20 Cleanup).

### 18.7 Input Validation — Comprehensive

| Check | Type | Trigger |
|-------|------|---------|
| Resume < 50 words | Soft warning | onBlur |
| Resume > 50,000 chars | Hard block | onChange |
| JD > 20,000 chars | Hard block | onChange |
| JD looks like URL | Soft warning | onBlur |
| Required field empty | Submit disabled | onChange |

### 18.8 History Search — Backend

`GET /history?q=searchterm`. Backend SQL `LIKE` search. Frontend sends debounced queries (300ms).

### 18.9 PDF Export — Backend Generated

Endpoint: `GET /history/{id}/export/pdf`. Auth required. Cover Letter: business letter format. Interview Q&A: question-answer card format.

### 18.10 Error Recovery

First crash → error page + "Try Again". Second consecutive crash → auto-redirect to dashboard. `frontend_error` telemetry + Sentry report on each crash.

---

## 19. Interview Decision Log (2026-03-30)

Summary of all decisions made during the spec interview sessions.

| # | Topic | Decision | Rationale |
|---|-------|----------|-----------|
| 1 | Result screen architecture | **Hybrid** — shared wrapper + tool-specific middle content | Best separation of concerns |
| 2 | Heuristic scoring scope | **Only Resume Analyzer & Job Match** use blended heuristic+LLM scoring | Generative tools can't produce meaningful heuristic scores |
| 3 | Guest result expiry | **"Result expired — run again"** on back-navigation | Drives signup |
| 4 | Guest ad-gate | **Client-side temp UUID** for ad-unlock tracking | Same ad experience for guest and auth |
| 5 | Interview limits | **Max 5 questions, 2 practice attempts** | Cost control: worst case ~$0.02 |
| 6 | Practice feedback model | **Cheaper/lighter model** for practice evaluations | Cost optimization |
| 7 | LLM fallback | **Tool-specific** — silent heuristic for Resume/Job Match, explicit error for generative | Can't fake a cover letter with heuristics |
| 8 | Job scraping | **BS4 + Playwright fallback** | Best effort at JS-rendered sites |
| 9 | Auth token storage | **Two HttpOnly cookies** (access 30min + refresh 7day) | Cross-tab, XSS-resistant, path-scoped refresh |
| 10 | CSRF protection | **SameSite=Lax cookies** (no double-submit pattern) | Sufficient for modern SPA + JSON API |
| 11 | Cross-tab workflow | **Tab-scoped only** (sessionStorage) | Simplicity, no sync bugs |
| 12 | Re-generate storage | **New ToolRun row always** (parent_run_id chain) | Preserves history, enables score delta |
| 13 | LLM async strategy | **Native async** (generate_content_async) | Proper async, no thread overhead |
| 14 | LLM retry strategy | **3 retries + exponential backoff** (1s→2s→4s) | Robust error handling |
| 15 | Score visualization | **Universal ScoreRing** component across all tools | Consistent UX |
| 16 | Monetization model | **Hybrid**: ads V1 + premium subscription V1.1 | Research shows hybrid generates 3x ad-only revenue |
| 17 | Ad provider | **Google AdSense** Day 1, GAM + Rewarded Phase 2 | No traffic minimum, career niche = premium CPM |
| 18 | Ad unlock security | **Client-side sessionStorage** | Bypass risk accepted, pragmatic |
| 19 | Ad blocker handling | **30-second countdown** fallback | Don't lose 30-40% of users |
| 20 | Deployment platform | **Full Railway** (backend + frontend + Postgres) | Single platform, student-friendly, Docker support |
| 21 | Database | **Railway Postgres** (replaces Neon) | Integrated with Railway, free tier |
| 22 | Google OAuth | **V1** with authlib | Reduces signup friction |
| 23 | Password reset | **V1** via Resend free tier | Essential UX for email/password users |
| 24 | Disposable email blocking | **Blocklist** of known disposable domains | Prevents guest limit bypass |
| 25 | i18n scope | **English only V1** | Realistic scope for single developer |
| 26 | Preview routes | **Remove from production** | Dev-only tooling |
| 27 | Admin panel | **Integrated** in main frontend, admin/ dir removed | Single codebase |
| 28 | frontend-legacy/ | **Archive to separate branch**, remove from main | Clean up repo |
| 29 | Landing page | **Current active variant** is final, remove others | No A/B testing |
| 30 | Monitoring | **Railway metrics + Sentry free tier** | Error tracking + uptime |
| 31 | Cache backend | **In-memory V1**, Redis V1.1 | Low traffic, acceptable |
| 32 | Bundle budget | **200KB initial** with route-based code splitting | Realistic with tree-shaking |
| 33 | DB migrations | **Automatic during deploy** (pre-deploy command) | Never forgotten |
| 34 | Bot protection | **Rate limit V1**, CAPTCHA V1.1 | Google OAuth naturally filters bots |
| 35 | Developer location | **Poland (student)** — RODO/GDPR compliance | Not Turkey |
| 36 | Affiliate revenue | **V1.1** | Focus on core product first |
| 37 | Payment processor | **V1.1** (Stripe/Paddle/Lemon Squeezy TBD) | Premium tier deferred |
| 38 | Injection guard | **System prompt guard + heuristic only** | No input sanitization (false positive risk) |
| 39 | Guest daily limit | **3-5 runs/day** (cookie tracked, bypass accepted) | Prevents LLM cost abuse |
| 40 | Performance budget | **200KB** initial JS | Realistic with code splitting |
| 41 | GDPR ad compliance | **Google CMP (TCF 2.2)** handles consent | Auto-detects user location |

---

## 20. Cleanup Checklist

Dead code and unused files identified via code audit. Must be cleaned up before production.

### Remove from Repository

| Category | Files/Paths | Reason |
|----------|------------|--------|
| **Preview routes** | `frontend/src/routes/resume_.preview.tsx`, `career_.preview.tsx`, `cover-letter_.preview.tsx`, `interview_.preview.tsx`, `job-match_.preview.tsx`, `portfolio_.preview.tsx` | Dev-only, not in spec |
| **Preview component** | `frontend/src/components/tooling/ToolResultPreview.tsx` | Only used by preview routes |
| **Mock payloads** | `frontend/src/lib/tools/mockPayloads.ts` | Only used by preview routes |
| **Unused UI components** | `frontend/src/components/ui/alert-dialog.tsx`, `animated-generate-button-shadcn-tailwind.tsx`, `card.tsx`, `container-scroll-animation.tsx`, `faqs-1.tsx`, `hover-card.tsx`, `lamp.tsx`, `navbar-1.tsx`, `scroll-area.tsx` | Not imported anywhere |
| **Separate admin app** | `admin/` directory (entire) | Replaced by integrated admin routes |
| **Redundant lock file** | `package-lock.json` at root | Project uses pnpm (pnpm-lock.yaml) |
| **Duplicate scripts** | `scripts/gen_carousel_fix.py`, `scripts/gen_carousel_fix2.py` (keep `gen_carousel_v3.py` as canonical) | Superseded versions |
| **Unused landing variants** | Any landing component variants not used by the active landing page | Only one variant ships |

### Archive to Separate Branch

| Path | Reason |
|------|--------|
| `frontend-legacy/` (536MB) | Full legacy backup — archive to `archive/legacy-frontend` branch, remove from main |

### Add to .gitignore

| Path | Reason |
|------|--------|
| `.idea/` | IntelliJ IDEA project settings |
| `.cta.json` | Project generation config |
| `.DS_Store` | macOS metadata |
| `.vite/` | Vite cache directory |

### Verify

| Item | Check |
|------|-------|
| `pics/` directory | Verify which images are actually referenced in code vs design working files. ~186MB, most appears unused. |
| CSS files | Verify all CSS files in `styles/` are actively used. `landing.css` (123KB) and `tooling-fullscreen.css` (45KB) are large — ensure they're not carrying dead rules. |
| Root `package.json` | Currently empty (`{}`). Verify if needed for workspace config or can be removed. |
