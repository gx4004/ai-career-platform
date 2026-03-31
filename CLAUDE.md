# Career Workbench — Development Context

## What This Is
AI-powered job-search workspace. 6 tools (Resume Analyzer, Job Match, Cover Letter, Interview Q&A, Career Path, Portfolio Planner). Users upload resume once, use it across all tools. Hybrid monetization: ad-gated results + future premium tier.

## Stack
- **Frontend**: React 19 + TanStack Start/Router + Vite 7 + Tailwind 4 + Radix/shadcn + Framer Motion
- **Backend**: FastAPI + SQLAlchemy + Alembic + Railway Postgres
- **LLM**: Vertex AI Gemini 2.5 Flash (native async, single provider V1). Cheaper model for interview practice feedback.
- **Auth**: JWT in HttpOnly cookies (access 30min + refresh 7day) + Google OAuth (authlib) + password reset (Resend)
- **Deploy**: Full Railway (backend + frontend + Postgres). Same domain, path-based routing.
- **Monitoring**: Railway metrics + Sentry free tier
- **Package manager**: pnpm (not npm)

## Key Architecture Decisions
| Decision | Rationale |
|----------|-----------|
| TanStack Start, not Next.js | Lighter opinions, better router DX |
| Heuristic blend scoring only Resume + Job Match | Generative tools can't produce meaningful heuristic scores |
| Single LLM provider (Gemini Flash) | No multi-provider abstraction needed V1 |
| BS4 + Playwright fallback for scraping | Best effort at JS sites, graceful paste fallback |
| SameSite=Lax cookies, no CSRF tokens | Sufficient for SPA + JSON API |
| Client-side ad unlock (sessionStorage) | Bypass risk accepted, pragmatic for V1 |
| English only V1 | Realistic scope for solo dev |
| In-memory cache V1 | Redis V1.1 when traffic warrants |
| 3 retry + exponential backoff for LLM | 1s→2s→4s, then tool-specific fallback |
| Admin panel integrated in main frontend | No separate app, /admin/* routes |

## File Structure
```
frontend/src/routes/       — File-based route definitions
frontend/src/pages/         — Page component implementations
frontend/src/components/    — app/, auth/, dashboard/, tooling/, landing/, mobile/, ui/
frontend/src/hooks/         — useSession, useBreakpoint, useResumeCarry, useCarousel, etc.
frontend/src/lib/tools/     — Tool registry, drafts, workflow configs, exports
frontend/src/lib/auth/      — SessionProvider, token storage, pending intent
frontend/src/styles/        — CSS files (theme, shell, landing, tooling, results, responsive, etc.)
backend/app/routers/        — Route handlers per domain
backend/app/services/       — Business logic (LLM, parsing, scoring, scraping)
backend/app/prompts/        — Prompt builders per tool
backend/app/models/         — User, ToolRun, Workspace ORM models
backend/app/auth/           — JWT + bcrypt + Google OAuth
docs/spec.md                — Full spec + roadmap (reference doc)
```

## Commands
```bash
# Frontend
cd frontend && pnpm dev          # Dev server (port 3000)
cd frontend && pnpm test         # Vitest
cd frontend && pnpm typecheck    # TypeScript check
cd frontend && pnpm build        # Production build

# Backend
cd backend && uvicorn app.main:app --reload --port 8000
cd backend && pytest             # Tests
cd backend && alembic upgrade head  # Run migrations
```

## Code Conventions
- Tool order: Resume(1) → Job Match(2) → Career Path(3) → Cover Letter(4) → Interview Q&A(5) → Portfolio(6)
- All tool metadata lives in `frontend/src/lib/tools/registry.ts`
- CSS architecture: no CSS modules, plain CSS files in `styles/` with BEM-ish naming
- Hybrid theme: dark sidebar/topbar + light content area. No dark mode toggle.
- Mobile: bottom tab bar, SwipeDeck for interview, StickyRunBar, FullScreenEditSheet
- Re-generate always creates new ToolRun row (parent_run_id chain, never overwrite)
- Guest runs: in-memory Map only, never persisted, drives signup conversion
- Workflow context: sessionStorage, tab-scoped, no cross-tab sync

## What NOT to Do
- Don't add i18n translations (EN only V1, infrastructure stays)
- Don't implement premium/subscription tier (V1.1)
- Don't add affiliate links (V1.1)
- Don't add CAPTCHA (V1.1, rate limit sufficient)
- Don't implement real AdSense SDK (placeholder until approved)
- Don't add LLM streaming (v2)
- Don't create new documentation files unless asked
- Don't modify tool priority numbers without asking
