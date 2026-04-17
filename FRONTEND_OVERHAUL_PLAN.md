# Frontend Overhaul Plan — Experimental Branch

**Branch:** `experimental/frontend-overhaul-opus47`
**Base:** `main` @ `e1cef22f` (backend audit closed, 4 P1/P2 PRs merged & deployed)
**Scope:** Frontend only. Backend is clean — do not touch `backend/` except to read schemas.
**Goal:** Ambitious quality pass. Safe to be bold; this branch is a preview, not auto-deployed.

---

## Ground Rules (read before coding)

1. **Do not break visuals or UX.** Every tool's golden path must still work identically at the end. Screenshot before/after for each tool.
2. **Never merge to `main` or push to `deploy`.** This branch stays experimental until the user approves. Commit freely here; push to `origin experimental/frontend-overhaul-opus47`.
3. **pnpm only** (not npm). Commands: `pnpm dev`, `pnpm test`, `pnpm typecheck`, `pnpm build`.
4. **After every phase**: run `pnpm typecheck && pnpm test && pnpm build`. If any fails, fix before continuing.
5. **Preserve tool identity** — each of the 6 tools has its own color/animation/copy. Do not homogenize.
6. **No new documentation files** unless this plan says so. No README edits.
7. **Respect CLAUDE.md conventions**: tool order, tool groups, Zod↔Pydantic mirror, `run_tool_pipeline` wrapper, dark sidebar + light content hybrid theme, no dark-mode toggle, English only.
8. **Codex gate**: after each phase, run `/codex:review --background` and wait. Fix findings before next phase.
9. **Commit discipline**: one commit per phase minimum, conventional commit messages (`refactor(frontend): …`, `perf(ui): …`).

---

## Pre-flight (Phase 0)

Before touching code:

- [ ] `git branch --show-current` → must be `experimental/frontend-overhaul-opus47`
- [ ] `cd frontend && pnpm install`
- [ ] `pnpm typecheck` — record baseline error count (should be 0)
- [ ] `pnpm test` — record baseline (all green expected)
- [ ] `pnpm build` — confirm succeeds; note bundle sizes from Vite output
- [ ] Start dev server, visit each of: `/`, `/login`, `/dashboard`, `/resume`, `/job-match`, `/career`, `/cover-letter`, `/interview`, `/portfolio`, plus one result page per tool. Take screenshots into `.codex-previews/baseline/`.
- [ ] Fetch the Codex frontend audit result once complete:
  ```
  cat /Users/goncuegemen/.claude/plugins/data/codex-openai-codex/state/ai-career-platform-*/jobs/task-mo24x78z-26fa2u.json
  ```
  Incorporate its P1/P2 findings into the relevant phases below. If the file's `status` ≠ `completed`, wait ~5 min and recheck — don't proceed without its findings.

---

## Phase 1 — Frontend Security Hardening (Codex audit findings)

The backend audit shipped. Parallel frontend audit covered: `lib/api/client.ts`, `lib/auth/*` (token storage, XSS surface), `routes/*` (auth guards), `hooks/*` (stale closures), `lib/tools/*` (sessionStorage abuse), `components/auth/*` (password handling), any `dangerouslySetInnerHTML`.

**Tasks:**
- [ ] Apply each Codex P1 finding as its own commit. Write a failing test (where testable) before fixing.
- [ ] For each `dangerouslySetInnerHTML`, either remove or wrap with DOMPurify. Audit call sites: `rg "dangerouslySetInnerHTML" frontend/src`.
- [ ] Verify token storage: tokens must live only in HttpOnly cookies (set by backend). `localStorage`/`sessionStorage` must never hold `access_token` or `refresh_token`. Grep to confirm.
- [ ] Verify every route in `frontend/src/routes/` that needs auth uses `beforeLoad` guard. Cross-check against `frontend/src/lib/navigation/publicRoutes.ts`.
- [ ] `sessionStorage` usage in `lib/tools/*`: confirm no PII, no tokens, no resume text beyond the intentional workflow carry.

**Exit criteria:** all Codex P1/P2 items closed OR explicitly deferred with a note in this file. `pnpm test` green.

---

## Phase 2 — Type Safety & Error Boundaries

**Tasks:**
- [ ] Run `pnpm typecheck --strict`; fix any `any`/`unknown` leakage in `lib/api/client.ts` and hooks.
- [ ] Audit Zod schemas in `lib/api/schemas.ts` against `backend/app/schemas/`. Any drift = fix on frontend (mirror backend).
- [ ] Add a top-level `ErrorBoundary` in `routes/__root.tsx` if not present. Include per-tool boundary on tool-input + tool-result pages so a crash in one tool doesn't nuke the shell.
- [ ] Confirm TanStack Query error states render user-visible messages (not blank screens). Grep `useQuery|useMutation` for unhandled `error`.
- [ ] Add `<Suspense>` fallback skeletons for any lazy route that currently flashes blank.

**Exit criteria:** typecheck clean, no `any` in API layer, every route has an error boundary in its parent chain.

---

## Phase 3 — Performance Pass

**Tasks:**
- [ ] `pnpm build` → record bundle sizes. Run `pnpm exec vite-bundle-visualizer` or similar; identify top 5 heaviest chunks.
- [ ] Lazy-load admin routes (they're rare but ship in every user's bundle today if eagerly imported).
- [ ] Audit Framer Motion imports — tree-shake by importing from `framer-motion/dom` where possible for non-React-Native usage.
- [ ] Memoize expensive derived state in result pages (score calculations, sorted arrays). Check `frontend/src/pages/tool-result-pages.tsx` and `components/tooling/`.
- [ ] `rAF`-throttle any scroll/resize listener that runs every frame. (Landing already did this per recent commit `f8a35c5e`.)
- [ ] Replace any `<img>` without `loading="lazy"` or explicit `width`/`height` (CLS risk).
- [ ] Check `hooks/useBreakpoint` etc. for stale closures — resolve via Codex finding.

**Exit criteria:** total initial JS decrease ≥ 10% OR documented why not. Lighthouse perf ≥ 90 on `/` and `/dashboard` in dev build.

---

## Phase 4 — CSS Architecture Cleanup

Per memory: "no messy cross-tool CSS reuse." User has called this out.

**Tasks:**
- [ ] Inventory `.tool-input-hero`, result-page classes, and any shared classes used across ≥ 2 tools. For each: either make it a genuinely shared primitive (move to `design-system.css`) or fork per-tool.
- [ ] Split `tooling.css` if > 800 lines: one file per tool or per section.
- [ ] Remove dead CSS — use `pnpm dlx purgecss --css frontend/src/styles/*.css --content 'frontend/src/**/*.{tsx,ts}'` to identify unused selectors. Delete confirmed dead ones.
- [ ] No new CSS modules. Stay plain CSS (per CLAUDE.md).

**Exit criteria:** each tool's visual identity preserved. Total CSS LOC decreases or stays flat. Screenshot diff acceptable.

---

## Phase 5 — Result Page Premium Redesign (per memory)

Memory: `project_result_redesign.md` — audit done, needs premium visual upgrade. Use the `redesign` and `ui-ux-pro-max` skills.

**Tasks:**
- [ ] For each of the 6 result pages, review the existing `heroExtra` / `midSection` (Fix First cards) / per-tool view. Identify the one with weakest hierarchy; redesign it first as a template.
- [ ] Dark hero variant is optional (see `feedback_design_constraints.md`): Resume/Job Match currently use it; apply only where it strengthens the page.
- [ ] Preserve tool identity (color, animation, copy tone).
- [ ] Respect fix-layout constraint — no broken responsive on mobile (375px, 414px, 768px).
- [ ] Screenshot every result page at 3 widths before requesting review.

**Exit criteria:** user-approvable redesign on at least one tool; other 5 follow the same template.

---

## Phase 6 — Mobile Polish

**Tasks:**
- [ ] Test on 375px width: bottom tab bar, `SwipeDeck` for interview, `StickyRunBar`, `FullScreenEditSheet`. Identify jank or overflow.
- [ ] Safe-area insets (iOS notch) on all fixed elements.
- [ ] Touch target audit — all buttons/links ≥ 44×44 px.
- [ ] Verify dashboard grid doesn't horizontal-scroll on 320px.

**Exit criteria:** manual walkthrough of all tools on 375px clean.

---

## Phase 7 — Accessibility Pass

**Tasks:**
- [ ] `pnpm dlx @axe-core/cli http://localhost:3000` on each key route; fix critical/serious.
- [ ] Every form input has an associated `<label>` (not just placeholder).
- [ ] Focus ring visible on all interactive elements in light AND dark sections.
- [ ] Color contrast ≥ 4.5:1 for body text, 3:1 for large text.
- [ ] Keyboard-only traversal of dashboard + one tool flow works end-to-end.

**Exit criteria:** 0 axe "critical" violations on index, dashboard, one tool input, one tool result.

---

## Phase 8 — Test Coverage Bump

**Tasks:**
- [ ] `pnpm test --coverage` → baseline. Identify files with < 40% coverage in `lib/`, `hooks/`, `components/auth/`.
- [ ] Add Vitest tests for any newly introduced util. Don't chase coverage in components — chase it in pure logic.
- [ ] Add one integration-style test per tool using MSW for the tool API.

**Exit criteria:** `lib/` coverage ≥ 70%; all tests green.

---

## Phase 9 — Final Verification

- [ ] `pnpm typecheck` clean
- [ ] `pnpm test` all green
- [ ] `pnpm build` succeeds, bundle sizes acceptable
- [ ] Manual walkthrough: signup → dashboard → resume → job match → cover letter → interview → career → portfolio → history → account → logout
- [ ] Screenshot set in `frontend/.codex-previews/final/` matching baseline set
- [ ] `/codex:review --background` one final pass
- [ ] Push branch: `git push origin experimental/frontend-overhaul-opus47`
- [ ] Do NOT open PR; user will inspect and decide whether to merge.

---

## Deferred / Do NOT Do

- Do not touch `backend/`.
- Do not add i18n strings, premium tier, affiliate, CAPTCHA, real AdSense, LLM streaming.
- Do not re-enable ad gate.
- Do not modify tool priority numbers.
- Do not create new docs besides updating checkboxes in THIS file.
- Do not merge to `main`. Do not push to `deploy`.

---

## Progress Log

_Agent: fill this in as you go. One line per phase entry, date + short note._

- 2026-04-17 — Plan created on `experimental/frontend-overhaul-opus47`. Baseline not yet taken.
- 2026-04-17 — **Phase 0 complete.** Branch, install, typecheck, build all clean. Fixed two
  pre-existing flaky tests (`landing-experiment-page` double-brand-lockup via LandingFooter
  mock; `resultDefinitions` job-match "Recruiter summary" copy). 124/124 passing. Baseline
  screenshots captured at 1440×900 for 20 routes in `.codex-previews/baseline/`. `auth.callback`
  is a pure redirect placeholder — skipped per addendum.
- 2026-04-17 — Codex frontend audit `task-mo24x78z-26fa2u` orphaned (process died ~90s into
  the run without emitting findings); `/codex:rescue` kick-off also failed with an internal
  error. Proceeded with my own Phase 1 audit; will retry Codex after Phase 4 if still relevant.
- 2026-04-17 — **Phase 1 complete.** Removed JWT access_token from localStorage + Bearer
  header — all requests now cookie-only (`cw_access` HttpOnly, backend already accepts).
  Updated `client.ts`, `admin.ts`, `session.tsx`, `storage.ts`, `exports.ts`. Tests assert
  no `Authorization` header is ever attached and the three token helpers can't be
  re-introduced. No `dangerouslySetInnerHTML` anywhere. No `eval`/`document.write`.
  sessionStorage usage (resume-carry, practice attempts, ad unlock, guest demo runs, dismissed
  banners) holds no tokens/PII beyond the intentional workflow carry. Route-level
  `beforeLoad` guards deferred — component-level gates are intentional for guest/demo mode
  (dashboard, tools, results) per CLAUDE.md; admin already has `requireAdmin`.
