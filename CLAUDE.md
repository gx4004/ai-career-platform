# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Career Workbench — Development Context

## What This Is
AI-powered job-search workspace. Six tools in canonical order: Resume Analyzer,
Job Match, Career Path, Cover Letter, Interview Q&A, and Portfolio Planner. Users
can carry resume context across the connected workflow. Results remain fully
visible with no ad gate; no future monetization candidate is selected or
authorized.

**Sept 2026 reset:** local-only, feature-first. Beyond the six tools the product
includes CV Studio (flagship), Evidence Profile, Applications (the former
Campaigns and Approval Queue, merged), Job Discovery, and an experimental Autopilot. In-app pages follow
the work-tool design (2026-09-30 overhaul) described under Code Conventions.
Direction and phases: `docs/roadmap.md` (umbrella #319).

## Stack
- **Frontend**: React 19 + TanStack Start/Router + Vite 7 + Tailwind 4 + Radix/shadcn (motion is plain CSS; no animation library)
- **Backend**: FastAPI + SQLAlchemy + Alembic + Railway Postgres
- **LLM**: one provider per deployment, chosen by `LLM_PROVIDER`: `vertex` (default, Gemini 2.5 Flash), `google` (API key), `anthropic` (Claude Haiku 4.5), or `fake` (deterministic local fixtures; the backend refuses to boot with it outside development). No fallback between providers. Cheaper model for interview practice feedback.
- **Auth**: JWT in HttpOnly cookies (access 30min + refresh 7day) + Google OAuth (authlib) + password reset (Resend)
- **Deploy**: Full Railway (backend + frontend + Postgres). Same domain, path-based routing.
- **Monitoring**: structured stdout logs and Railway metrics. No Sentry, CAPTCHA or analytics vendor exists in the code (wiring removed in #352); re-add deliberately, with a legal-page update, before any hosted launch
- **Package manager**: pnpm (not npm)

## Key Architecture Decisions
| Decision | Rationale |
|----------|-----------|
| TanStack Start, not Next.js | Lighter opinions, better router DX |
| Heuristic blend scoring only Resume + Job Match | Generative tools can't produce meaningful heuristic scores |
| One configured LLM provider, no fallback | Provider is a setting (`LLM_PROVIDER`); requests are never hedged across providers |
| BS4 + Playwright fallback for scraping | Best effort at JS sites, graceful paste fallback |
| SameSite=Lax cookies, no CSRF tokens | Sufficient for SPA + JSON API |
| No client-side ad/unlock path | Dormant ad gate + `ad-unlocked` sessionStorage contract removed (R9 #127, D-051); any future monetized access must be server-authoritative (D-048) |
| English only V1 | Realistic scope for solo dev |
| In-memory cache today | Review distributed coordination only if the R10 multi-instance trigger fires |
| 4 retry + exponential backoff for LLM | 5s→10s→20s→40s + jitter, 120s per-call timeout, then tool-specific fallback (heuristic for Resume / Job Match, explicit error for generative tools) |
| Admin panel integrated in main frontend | No separate app, /admin/* routes |

## File Structure
```
frontend/src/routes/        — File-based route definitions (tool_.result.$historyId.tsx pattern for result pages)
frontend/src/pages/         — Page component implementations
frontend/src/components/    — kit/ (the shared component layer), app/, auth/, dashboard/, tooling/, landing/, mobile/, ui/ (sidebar only)
frontend/src/hooks/         — useSession, useBreakpoint, useResumeCarry, useCarousel, etc.
frontend/src/lib/tools/     — Tool registry, drafts, workflow configs, exports
frontend/src/lib/auth/      — SessionProvider, token storage, pending intent
frontend/src/lib/api/       — client.ts (fetch wrapper), schemas.ts (Zod response schemas)
frontend/src/lib/navigation/ — routeMeta, publicRoutes, redirect helpers
frontend/src/lib/query/     — TanStack Query client config
frontend/src/styles/        — CSS files (theme tokens, shell, landing, tooling, results, etc.); kit/ holds the kit's CSS
backend/app/routers/        — Route handlers per domain (all mounted under /api/v1)
backend/app/services/       — Business logic (LLM, parsing, scoring, scraping)
backend/app/services/tool_pipeline.py — Shared pipeline: sanitize→cache→service→persist→respond
backend/app/prompts/        — Prompt builders per tool
backend/app/models/         — User, ToolRun, Workspace ORM models
backend/app/schemas/        — Pydantic request/response schemas
backend/app/auth/           — JWT + bcrypt + Google OAuth
docs/spec.md                — Product contract (direction + phases: docs/roadmap.md, reset 2026-09-24)
```

## Commands
```bash
# Frontend
cd frontend && pnpm dev                   # Dev server (port 3000)
cd frontend && pnpm test                  # Vitest (all tests)
cd frontend && pnpm test src/lib/tools    # Vitest (single file or pattern)
cd frontend && pnpm typecheck             # TypeScript check
cd frontend && pnpm build                 # Production build

# Backend
cd backend && uvicorn app.main:app --reload --port 8000
cd backend && pytest                      # All tests
cd backend && pytest app/path/test_foo.py # Single test file
cd backend && alembic upgrade head        # Run migrations
```

## Code Conventions
- Hosted GitHub Actions are paused by policy: `.github/workflows/ci.yml` must stay
  manual-dispatch only. Run all feasible gates locally; pushes may update PRs but
  must not add automatic `push`, `pull_request`, or scheduled triggers. Only the
  owner decides when to dispatch the preserved hosted workflow.
- Tool order: Resume(1) → Job Match(2) → Career Path(3) → Cover Letter(4) → Interview Q&A(5) → Portfolio(6)
- Tool groups: `primary` (resume, job-match) | `application` (cover-letter, interview) | `planning` (career, portfolio)
- All tool metadata lives in `frontend/src/lib/tools/registry.ts`
- Zod schemas in `frontend/src/lib/api/schemas.ts` must mirror backend Pydantic schemas in `backend/app/schemas/`
- Every tool router endpoint calls `run_tool_pipeline()` — don't bypass it for new tools
- CSS architecture: no CSS modules, plain CSS files in `styles/` with BEM-ish naming
- Design system (2026-10-05 "Sticker", chosen by the owner from a five-way design lab; it replaced the "Editorial, warm" look): cool light-tint ground, white surfaces, 2px ink outlines, ONE hard offset shadow (no blur), flat saturated tone blocks assigned by meaning (tangerine = primary action and score, lemon = attention / fix first / active nav, mint = good, lilac = thinking and CV, rose = time pressure, aqua = portfolio), text on a tone fill is always ink. Bricolage Grotesque (display: page titles, big numbers, lead sentences, empty-state headings) and Onest (all UI), both self-hosted via fontsource (no third-party font host, CSP `font-src 'self'`); tabular numerals for data. No blue, no dark mode. The scalloped `ScoreSeal` stamps in once per navigation and never under reduced motion; plate tilt (1-2deg) is for a few stickers only, never for interactive controls or text. All tokens live in `styles/theme.css` (type scale, 4px spacing, radii, shadow, 120-160ms motion, status roles, focus ring); never hard-code a colour outside theme.css. The CV paper preview and the PDF/DOCX exports are print-faithful and are deliberately NOT sticker (their colours are the other exception). The landing page uses the same tokens.
- Component kit: every page is built from `components/kit` (Button, Badge/Chip, Field/Input/Select/..., Dialog/Sheet/DropdownMenu/Toast/Tabs/Disclosure, Page/PageHeader/Split/Section/MetaRow/KeyValue/Stat/ScoreBar/Notice/Card/List/Row/Table/Toolbar/Pagination/EmptyState/ErrorState/Skeleton, plus the Sticker set: Sticker, ScoreSeal, ToolTile, StageMark, FitStamp, SkillPips, Panel/PanelSurface, JumpNav, NumberDisc, RoundStamp, Highlight, ToneDot). CSS in `styles/kit/*.css`, class prefix `kit-`, no `!important`, hover only under `(hover: hover)`, 44px touch targets. Pages must not define their own badge, section heading, row, button, input, empty-state or dialog styling; extend the kit additively (specimen in the gallery + test) instead. The hidden, public, noindex `/_kit` route shows every component in every state. `ui/` keeps only the sidebar primitive. Hooks `useRevealOnce`, `useCountUp` and `usePrefersReducedMotion` drive the few moments of motion.
- Page shape: every in-app page starts with the compact left-aligned `PageHeader` and shows the user's data in the first screen; no icon tiles, centred heroes, gradients/glows, pill-chip rows, hover lifts, entrance animations (the once-per-navigation score stamp is the one sanctioned moment) or decorative illustrations; lists/tables over card grids (cards only for real objects: a job, an application); one filled primary button per view; the account menu lives in the sidebar footer, ⌘K opens the command palette, desktop has no top bar. No dark mode toggle.
- Tool input pages: compact header + form column with a side rail (kit `Split`: the form column holds the notices and one form Panel with the resume source control, fields and one submit; the rail holds the user's recent runs of that tool and "What you get", three lines from the registry's `delivers`). Side by side when the content is 52rem or wider (`Split breakpoint="compact"`, so 1024 with the sidebar collapsed to its rail is side by side), stacked (rail after the form) below that. Result pages: report layout (header with Re-generate, summary row, plain sections).
- Deploy: Railway watches `deploy`. Promote reviewed release commits deliberately from
  `chapter2` to `main`, then to `deploy`; never push experimental work directly to
  either stable branch.
- Mobile: bottom tab bar (`MobileNav`) + tools sheet (`ToolGridSheet`); responsive CSS for the existing layouts. No bespoke mobile-only components beyond those.
- Re-generate always creates new ToolRun row (parent_run_id chain, never overwrite)
- Guest runs: in-memory Map only, never persisted, drives signup conversion
- Workflow context: sessionStorage, tab-scoped, no cross-tab sync

## Codex Integration

### When to Use Codex
- **After every feature/fix**: Run `/codex:review --background` before creating PR
- **Complex bugs**: `/codex:rescue --background investigate <problem>` — independent second opinion
- **Critical changes (auth, security, data)**: `/codex:adversarial-review --background <focus>`
- **Design decisions**: `/codex:adversarial-review challenge whether <decision> was the right call`
- **Stuck on a bug**: `/codex:rescue --background fix <description>` — let Codex try while Claude continues

### Review Gate (DISABLED)
Review gate is OFF — Codex does not automatically review Claude's output. Request reviews manually with `/codex:review` before creating a PR.
- Enable: `/codex:setup --enable-review-gate`
- Disable: `/codex:setup --disable-review-gate`
- Warning: when enabled it drains usage faster — keep it off during rapid iteration; consider enabling before high-risk merges (auth, payments, data models)

### Collaboration Patterns
- **Claude implements → Codex reviews**: Default workflow. Claude writes code, Codex validates.
- **Parallel investigation**: Claude works on Task A, Codex investigates Task B in background.
- **Codex → Claude handoff**: Codex finds issue via rescue, Claude implements the fix.
- **Dual review**: Both Claude (`/review`) and Codex (`/codex:review`) review before merge.

### Proactive Reminders
- Remind user "Want a Codex review on this?" after completing significant work
- Suggest `/codex:rescue` when debugging takes >2 attempts
- Suggest `/codex:adversarial-review` before any PR that touches auth, payments, or data models

### Config
- Model: use GPT-5.6 Sol at xhigh/Ultra for cumulative, security-sensitive, or
  cross-cutting repository work. Terra is appropriate for small, well-bounded,
  low-risk edits with complete tests.
- Results: `/codex:status` for progress, `/codex:result` for output
- Resume in Codex: `codex resume <session-id>` to continue work directly in Codex CLI

## What NOT to Do
- Don't add i18n translations (EN only V1, infrastructure stays)
- Don't implement premium/subscription tier (V1.1)
- Don't add affiliate links (V1.1)
- Don't add CAPTCHA/Turnstile without an explicit owner decision (none exists in the code today)
- Don't implement real AdSense SDK (placeholder until approved)
- Don't re-introduce a client ad gate (dormant path removed in R9 #127; results are fully free; any future access gate must be server-authoritative per D-048)
- Don't send welcome or account-deletion confirmation emails (V1.1; password-reset is the only transactional email V1)
- Don't add LLM streaming (v2)
- Don't create new documentation files unless asked
- Don't modify tool priority numbers without asking
- Never push experimental work directly to `main` or `deploy`

## Agent skills

### Issue tracker

Work is tracked in GitHub Issues; external pull requests are not a triage request
surface. See `docs/agents/issue-tracker.md`.

### Triage labels

The canonical Matt Pocock triage roles map directly to GitHub labels. See
`docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository with `CONTEXT.md` at the root and ADRs under
`docs/adr/`. See `docs/agents/domain.md`.

### Workflow

Use the full `/grill-with-docs` → `/to-prd` → `/to-issues` → `/implement` (with
`/tdd` where appropriate) → `/code-review` → `/triage` flow for major outcomes.
For small fixes, use only the skills relevant to the risk and scope.
