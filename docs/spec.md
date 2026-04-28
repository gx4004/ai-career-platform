# Career Workbench — Development Roadmap

> Last updated: 2026-03-31 | Solo dev, student in Poland (RODO/GDPR) | Production product with real users, hybrid ad + subscription revenue

---

## Completed Phases

### Pre-Phase: Foundation (initial commit → landing polish)

Built all 6 tools (Resume Analyzer, Job Match, Cover Letter, Interview Q&A, Career Path, Portfolio Planner), dashboard with hero/showcase/carousel, landing page, mobile components (SwipeDeck, StickyRunBar, BottomTabBar), design system (hybrid dark nav + light content theme), bespoke tool input/result pages, admin panel integrated at `/admin/*`.

Multiple design iterations: Material 3 tokens, Sovereign Archive palette, stitch redesign, editorial layout. Final: current hybrid theme with per-tool accent colors. Unused variants removed.

### Phase 1: Cleanup (2026-03)

Removed dead code: preview routes, unused UI components, mock payloads. Archived legacy `admin/` directory. Cleaned up 477 unused images from `pics/`. Optimized hero image (1.5MB PNG -> 300KB JPEG).

### Phase 2: Auth (2026-03)

Google OAuth via authlib. Password reset via Resend free tier. JWT in two HttpOnly cookies (access 30min + refresh 7day, SameSite=Lax). Disposable email domain blocklist. Silent token refresh with in-place auth dialog fallback.

### Phase 3: LLM (2026-03)

Switched to native async Vertex AI (`generate_content_async`). 3 retries + exponential backoff (1s/2s/4s). Configured cheaper practice model for interview feedback. Single provider (Gemini 2.5 Flash), no multi-provider abstraction.

### Phase 4: Scraper (2026-03)

BS4 primary + Playwright headless Chromium fallback for JS-heavy sites (LinkedIn, Indeed). 5s/10s timeouts. Graceful fallback to paste textarea when both fail. Partial data pre-fills textarea.

### Phase 5: Monetization (2026-03)

Ad-gate: summary free, details locked behind ad interaction. Client-side sessionStorage unlock (keyed by runId). 30-second countdown fallback for ad-blocker users. `useAd()` hook with bait-element detection. AdSense placeholder only — real SDK pending approval.

### Phase 6: Deployment (2026-03)

Dockerfile for Railway. Railway config for backend + frontend + Postgres (3-service architecture, same domain, path-based routing). Sentry free tier integration (frontend ErrorBoundary + backend middleware). Alembic auto-migration as pre-deploy command.

### Post-Phase: Hardening (2026-03)

Security hardening: open redirect prevention, SSRF blocklist for scraper, model override consistency. Landing page: tool card equal heights, correct tool priority order, reduced hero gap. A11y: reduced motion for scroll stagger, webp migration.

---

### Phase 7: Visual Redesign (2026-04)

Premium visual pass across all tool pages:

**Tool input pages**: Dark-to-light gradient hero (`tool-input-hero`) with per-tool CSS animations (scan beam, breathing venn circles, typing cursor, card shuffle, branch grow, tile cascade). Per-tool chip pills (Skills/Score/Tips, Fit/Keywords/Gap, etc.). Shared `ToolInputHero` + `ToolStatusInline` components. Glass-morphism guest banner on dark hero. Smooth gradient flow (no hard dark/white edge).

**Tool result pages**: Restored premium redesign from `feat/railway-deploy` — dark hero variant for Resume/Job Match with score ring, heroExtra sections for all 6 tools, midSection with Fix First cards, confidence_note subtitles. Per-tool result views: document preview for Cover Letter, question cards for Interview, career path roadmaps, portfolio build sequences.

**Ad gate bypassed**: `AdGatedLock` returns children immediately for thesis demo. All results fully visible without watching ads. Re-enable by removing early return in `AdGatedLock.tsx` when AdSense is approved.

**Deployment**: Railway watches `deploy` branch. Both `main` and `deploy` must be pushed together.

## Current Phase: Thesis Demo Polish

- [x] Tool card equal heights + correct priority order
- [x] Hero gap reduction
- [x] Security hardening (open redirect, SSRF blocklist)
- [x] Premium tool input page redesign (dark hero + animations)
- [x] Premium result page redesign (all 6 tools)
- [x] Ad gate bypassed for thesis demo
- [x] Railway deployment on `deploy` branch
- [x] Auth surface refinements (dialog/sheet glass card, gradient page, Google button polish)
- [x] Full mobile CSS audit across all 6 tools (grids collapse, sticky footer, hero scaling)
- [x] White-page race condition fix (query cache fallback for guest results)
- [x] Error state redesign (icon-based, no stock photos)

---

## Next: MVP1 Launch Checklist

### Cleanup (from audit)

- [x] Remove preview routes — files never existed, already clean
- [x] Remove `ToolResultPreview.tsx` + `mockPayloads.ts` — files never existed, already clean
- [x] Remove unused UI components: `accordion.tsx`, `border-beam.tsx`, `breadcrumb.tsx`, `number-ticker.tsx` — deleted
- [x] Remove separate `admin/` directory — integrated admin pages built at `/admin/*`
- [ ] Remove root `package-lock.json` (project uses pnpm)
- [ ] Remove duplicate scripts: `gen_carousel_fix.py`, `gen_carousel_fix2.py` (keep `gen_carousel_v3.py`)
- [ ] Remove unused landing variants
- [x] Delete `frontend-legacy/` (536MB, gitignored, not tracked — deleted from disk)

### .gitignore additions

- [ ] `.idea/`, `.cta.json`, `.DS_Store`, `.vite/`

### Verify before launch

- [ ] `pics/` directory — which images are actually referenced vs design working files (~186MB)
- [ ] CSS files — check `landing.css` (123KB) and `tooling-fullscreen.css` (45KB) for dead rules
- [ ] Root `package.json` — empty `{}`, needed for workspace config or removable?
- [ ] AdSense approval + real SDK integration (currently placeholder)
- [ ] Full test pass (frontend + backend + typecheck)
- [ ] Production environment variables configured on Railway
- [ ] Domain + SSL configured
- [ ] GDPR/RODO: Google CMP (TCF 2.2) consent management active

---

## Future (V1.1+)

- Premium subscription tier ($5-10/month, no ads, unlimited runs) — payment processor TBD (Stripe/Paddle/Lemon Squeezy)
- Affiliate links in result pages (Coursera, TopResume, Udemy, LinkedIn Premium)
- CAPTCHA (Cloudflare Turnstile) if abuse detected post-launch
- Redis cache (replace in-memory dict)
- LLM streaming (v2)
- i18n translations (TR, DE, FR, ES)
- Fallback LLM provider (OpenAI) for resilience
- Google Ad Manager + GPT Rewarded (at 10K+ sessions)
- Mediavine/Raptive premium ad network (at 25K+ pageviews)

---

## Architecture Decision Log (2026-03-30)

All decisions made during spec interview sessions.

| # | Topic | Decision | Rationale |
|---|-------|----------|-----------|
| 1 | Result screen architecture | **Hybrid** — shared wrapper + tool-specific middle content | Best separation of concerns |
| 2 | Heuristic scoring scope | **Only Resume Analyzer & Job Match** use blended heuristic+LLM scoring | Generative tools can't produce meaningful heuristic scores |
| 3 | Guest result expiry | **"Result expired — run again"** on back-navigation | Drives signup |
| 4 | Guest ad-gate | **Client-side temp UUID** for ad-unlock tracking | Same ad experience for guest and auth |
| 5 | Interview limits | **3–12 questions, 3 practice attempts per question** (defaults: 6 questions; UI quick-picks 4/6/8/10) | Cost control: bounded by `LLM_PRACTICE_MODEL` (cheaper) and per-IP rate limit |
| 6 | Practice feedback model | **Cheaper/lighter model** for practice evaluations | Cost optimization |
| 7 | LLM fallback | **Tool-specific** — silent heuristic for Resume/Job Match, explicit error for generative | Can't fake a cover letter with heuristics |
| 8 | Job scraping | **BS4 + Playwright fallback** | Best effort at JS-rendered sites |
| 9 | Auth token storage | **Two HttpOnly cookies** (access 30min + refresh 7day) | Cross-tab, XSS-resistant, path-scoped refresh |
| 10 | CSRF protection | **SameSite=Lax cookies** (no double-submit pattern) | Sufficient for modern SPA + JSON API |
| 11 | Cross-tab workflow | **Tab-scoped only** (sessionStorage) | Simplicity, no sync bugs |
| 12 | Re-generate storage | **New ToolRun row always** (parent_run_id chain) | Preserves history, enables score delta |
| 13 | LLM async strategy | **Native async** (generate_content_async) | Proper async, no thread overhead |
| 14 | LLM retry strategy | **4 retries + exponential backoff with jitter** (5s/10s/20s/40s, per-call timeout 120s) | Robust handling of transient Vertex errors; 3-min worst case before tool-specific fallback |
| 15 | Score visualization | **Universal ScoreRing** component across all tools | Consistent UX |
| 16 | Monetization model | **Hybrid**: ads V1 + premium subscription V1.1 | Hybrid generates 3x ad-only revenue |
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

## Product Gaps (Acknowledged, Not Planned)

| Gap | Status |
|-----|--------|
| Real-time LLM streaming | Future (v2) |
| Collaboration / sharing | Not planned (export covers this) |
| Automated job discovery | Not planned |
| Mobile native app | Not planned (responsive web) |
| A/B testing framework | Not planned |
| Portfolio project tracking | Out of scope |
| Full dark mode | Not planned (hybrid theme is the design) |
| CV library / version management | Not planned (each run is independent) |
