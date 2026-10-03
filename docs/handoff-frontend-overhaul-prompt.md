# Handoff prompt — Career Workbench frontend overhaul (orchestrator)

> Paste everything below the line into a fresh Claude Code session running **Sonnet 5.5**
> as the orchestrator, with the repo at `/Users/egemen/code/ai-career-platform`.
> Written 2026-10-03. Branch state: `overhaul/work-tool` (draft PR #427 into `chapter2`).

---

You are the **orchestrator** for a large frontend overhaul of Career Workbench, an AI job-search
workspace (React 19 + TanStack Start/Router + Vite + Tailwind 4 + Radix/shadcn; FastAPI backend).
Read `CLAUDE.md` first, then this whole prompt, then `docs/handoff-2026-09-30.md` for product
context. You own the outcome. Delegate implementation to subagents, but follow the sequencing
rules below — they exist because parallelism already hurt this project once.

## 1. The goal, in the owner's words

The owner (egemen) opened the app and said it "looks so AI / so bad". After one rebuild they said
"do better, go hardcore", then asked whether it is now a *high-end, anti-vibe-code* website. The
honest answer was **no**. The target is a product that feels designed by a person with taste:
distinctive, calm, dense where it is a tool, consistent to the pixel. Judge every decision against
"would this pass for a well-funded product team's work, not a generated template?"

Chosen identity (owner decision, 2026-10-03): **Editorial, warm.**
- Display type: **Newsreader** (serif) for page titles, big numbers and the occasional lead
  sentence. UI type: **Instrument Sans**. Tabular numerals for data.
- Warm paper surfaces (`--background #f6f3ec`, raised `#fdfbf7`), ink text (`#1d1b17`), one deep
  accent — **forest `#1f5d46`**. Oxblood for destructive, amber for warning, a green distinct
  from the forest accent for success. No blue anywhere in the app.
- It should feel like a well-made document or a good editorial tool, not a SaaS dashboard.
- The public landing page (`/`, `/landing-*`) is out of scope except that it must not break
  visually when tokens change (check it; fix only what breaks).

Structure decisions already made (keep): dense work-tool layout, left-aligned, data in the first
screen, no centred heroes, no icon tiles, no pill-chip rows, no gradients/glows, no hover lifts,
no entrance animations inside the app. Desktop has **no topbar**; the account menu lives in the
sidebar footer; **⌘K command palette** exists. One primary (filled) button per view.

## 2. Where things stand (read the code, don't trust this blindly)

Branch `overhaul/work-tool`, last commit `c9f8906` (WIP). Earlier commits on the branch rebuilt
every in-app page (Dashboard, Discover, Applications + detail, six tool input pages, six result
pages, CV Studio, Profile, History, Settings, Account, Admin, login, 404). Gate on commit
`e65b6c1`: typecheck clean, 508 vitest, production build, **54/54 Playwright**. All 18 pages were
checked for horizontal overflow at 375px.

**The latest commit (`c9f8906`) only swapped tokens + fonts** (`styles/theme.css`, the Google
Fonts link in `routes/__root.tsx`). It has NOT been looked at in a browser. Expect contrast and
colour regressions (hard-coded hex values, `rgba(...)` blues, `#fff` assumptions) — finding and
fixing those is part of Phase 1.

### What is wrong (be harsh about this)
1. **Inter-grey-blue was the new vibe-code default.** The identity above replaces it, but the
   *implementation* is still generic: type scale is flat, hierarchy is weak, serif is not yet used
   anywhere.
2. **Drifting primitives.** Six parallel agents each wrote their own components and CSS. Audit
   results: **5 separate badge systems** (`.camp-badge`, `.rbadge`, `.status-pill`, `.fact-badge`,
   `.history-pill`, plus `.admin-badge`/`.cvs-badge`) and **~15 section-title styles**
   (`.camp-panel__title`, `.rs-section__title`, `.dash-section__title`, `.profile-section__title`,
   `.cvs-panel__title`, `.workspace-panel__title`, `.settings-section-heading` …). Row heights,
   button sizes, spacing and empty states differ page to page. This inconsistency is the single
   biggest tell.
3. **Patched, not built.** `styles/workbench.css` (≈600 lines) overrides older CSS using
   `!important` (≈36 uses; ≈180 across `base.css`, `shell.css`, `landing.css`…). Dead CSS remains
   (`animations.css`, `responsive.css`, `base.css` still carry rules for removed `.dash-hero*`,
   `.tool-illust-*`, `.dropzone-*`, `.result-hero*`, `.workspace-*` entrance/glow, `.error-gradient-bg`).
4. **No brand mark.** The logo is the old blue gradient image (`src/assets/branding/*.webp`).
5. **States are untouched/untested:** hover, focus-visible, active, disabled, empty, loading
   (skeletons), error, dialogs/drawers/sheets, dropdown menus, toasts, tooltips, form validation,
   long-text and zero/one/many data cases.
6. **Visual QA was thin.** Only Dashboard, Discover, Applications, CV Studio and one result page
   were looked at after the hardcore pass, at 1440 and 375. Never looked at: Profile, History,
   Settings, Account, Admin, login, tool input pages, CV Studio Design/Versions/ATS tabs, the
   Discover drawer, any dialog.

## 3. Phases and sequencing (this is the important part)

**Rule: Phase 1 is done by ONE agent (or you), sequentially. Fan out only in Phase 3, and only
onto pages that consume the finished kit.** Parallel agents writing their own primitives is what
caused problem #2.

### Phase 0 — Baseline (you, 30 min)
- Start the stack (section 5), seed demo data, screenshot every page at 1440×900 and 375×812
  into `scratchpad/before/` using the real browser tool. Write one line per page of what looks
  wrong. This is the "before" evidence and the audit checklist.
- Create a tracking list (TaskCreate or a scratch file) with every page × viewport × state.

### Phase 1 — Tokens and identity (single agent)
- Finish `styles/theme.css`: define a real **type scale** (display 32/28, title 20, section 14,
  body 13.5, meta 12, micro 11), **spacing scale** (4px grid), **radius** set (4/6/8/12),
  **elevation** (hairline + one soft shadow + one overlay shadow), **motion** (120ms ease-out
  colour/opacity only), semantic colour roles incl. status tints (success/warning/danger/info/
  neutral, each with fg/bg/border), focus ring token (2px forest at 35% + 1px offset).
- Make Newsreader do real work: page titles, score numbers, section lead sentences, the empty
  state heading. Instrument Sans for everything else; tabular-nums on all numeric data.
  Verify the Google Fonts request includes the weights/axes actually used; add `font-display:
  swap` fallbacks that match metrics (size-adjust) to avoid layout jump.
- Replace the logo: draw an inline-SVG monogram (e.g. forest rounded square with a serif "C"
  and a notch/underline for "workbench" — your call, keep it simple and ownable) + wordmark in
  Newsreader. Update `AppBrandLockup`, favicon (`public/favicon.*`, `logo192/512.png`),
  `manifest.json` theme colour, and check the landing page header still works.
- Sweep for hard-coded colours: `grep -rnE "#[0-9a-fA-F]{3,8}|rgba?\(" src --include=*.css --include=*.tsx`
  outside `landing.css`; replace with tokens. Blue (`#0a66c2`, `#1d6cb5`, `74, 147, 239`, etc.)
  must be gone from the app.
- Visual pass of EVERY page at both viewports after the swap; fix contrast (WCAG AA for text,
  3:1 for UI borders/icons).

### Phase 2 — The kit (single agent; the core of the job)
Build **one** primitive layer and delete the duplicates. Suggested home:
`src/components/kit/*` + `src/styles/kit.css` (BEM-ish, token-only, **zero `!important`**).
Required primitives (props sketched; adapt):
- `PageHeader` (title serif, optional lead, meta line, actions slot), replacing `PageHero`.
- `Section` (heading row: title + optional count + right-aligned actions; hairline; consistent
  spacing) — replaces every `*-section__head/title` and `*-panel__head/title`.
- `Badge` (tones: neutral/accent/success/warning/danger/info; sizes sm/md; optional dot) —
  replaces all five badge systems. `Count`/`Kbd` helpers.
- `Row` / `List` (36/44px rows, hairline separators, hover bg, selected state, leading/trailing
  slots, hover-reveal actions that are always visible on touch and on `:focus-within`).
- `Table` (sticky header optional, right-aligned tabular numbers, sortable header affordance).
- `KeyValue` (label/value list with 32px rows) for details panels.
- `Toolbar` (search + filters + sort + count on one row; collapses to a sheet on mobile).
- `EmptyState` (one serif line + one sentence + one action; no illustration), `ErrorState`,
  `Skeleton` variants that match real row/card geometry (no layout shift).
- `Button` variants audited: primary (forest), secondary (outline), ghost, destructive, link;
  sizes sm 28 / md 32 / lg 36; loading + disabled + focus-visible states. Remove the legacy
  `.button-*` global rules and the gradient/shadow remnants in `base.css`.
- `Field`/`Input`/`Select`/`Textarea`/`Checkbox`/`Switch`/`Segmented` with error + help text.
- `Dialog`, `Drawer`/`Sheet`, `DropdownMenu`, `Popover`, `Tooltip`, `Toast` restyled to the
  system (overlay dim without blur, 12px radius, overlay shadow, 120ms fade).
- `Stat` (serif number + label + optional delta) and `ScoreBar` (thin bar, tonal).
- Add a hidden **`/_kit`** dev route (not linked, excluded from prod nav) showing every
  primitive in every state at both widths. This is your visual regression surface and the
  reference the owner can look at.
- Then **migrate every page** to the kit in the same phase or the next, deleting each page's
  private equivalents as you go. Target: no page-level CSS defines its own badge, section
  heading, row, or button. `workbench.css` must shrink to near zero and be deleted or renamed
  `kit.css`. Dead CSS removed (use coverage or grep for unreferenced selectors).

### Phase 3 — Page-by-page craft (now parallel is OK)
Fan out one subagent per area *only after the kit is merged to the branch*. Each agent:
reads this prompt + `design-brief` rules in section 4, uses kit components only (adding to the kit
requires orchestrator approval via message), screenshots before/after at 1440 and 375, covers all
states for its pages, updates its tests and the e2e selectors it breaks. Areas:
1. Shell + Dashboard + ⌘K palette + onboarding tour.
2. Discover (list, toolbar, drawer, deep-match flow, filters sheet) + Applications (board, list,
   detail, insights, prepare/apply flows).
3. Tool input pages ×6 (incl. loading/cinematic loader, job import, guest/handoff banners) +
   result pages ×6 (all sections, practice mode, export, regenerate flows).
4. CV Studio (all tabs, dialogs, bottom sheet, import/tailor flows; keep the paper preview
   *exactly* print-faithful — the preview itself is not restyled) + Profile.
5. History, Settings, Account, Admin (all sub-pages), auth (login/register/reset), 404/error,
   legal pages, cookie banner.
Give each agent a hard CPU rule (section 6). Cap at 3 agents at once.

### Phase 4 — States, motion, accessibility (single agent)
- Hover/active/focus-visible for every interactive element; keyboard path through each page;
  focus trap/return in dialogs and the palette; `aria-*` correctness; prefers-reduced-motion.
- Empty/loading/error/offline/long-text/RTL-safe truncation for each page. Use the real
  dev tools: throttle, kill the backend, seed empty accounts, seed 200 rows.
- axe-core scan on every route (add `@axe-core/playwright` only if not present; keep it a dev
  dependency) — zero serious/critical.
- Subtle, purposeful motion only: 120–160ms opacity/transform on menus, drawers, toasts,
  row hover. Nothing on page load.

### Phase 5 — Verification and handoff
- Full gate (section 6): typecheck, vitest, build, Playwright 54/54, plus a `pnpm screenshots`
  run (the harness in `frontend/e2e/screenshots.spec.ts`) for the owner.
- Produce a **before/after contact sheet** (HTML artifact or a PDF of side-by-side PNGs) for the
  owner, desktop + mobile, every page.
- Update `CLAUDE.md` conventions (it already has a "Work-tool design" bullet — extend it with the
  kit + identity rules and delete anything stale), write a short `docs/design-system.md` only
  because the owner asked for the overhaul to be documented (check with them if unsure), and
  append to memory (`frontend-overhaul-direction.md`).
- Push to `overhaul/work-tool` and keep PR #427 up to date. **Do not merge it** — the owner merges
  (the auto-mode classifier blocks subagent merges anyway).

## 4. Design rules for every agent (paste into each brief)

- Left-align everything. 4px grid. Row heights 36/44. Section gap 32, heading→content 12.
- Type: serif only for page title, big numbers, lead sentences, empty-state heading. Everything
  else Instrument Sans 13–13.5 body, 12 meta, 14/600 section titles, 11/500 labels. No
  uppercase letter-spaced eyebrows. Numbers tabular.
- Colour: paper surfaces, ink text, forest for the one primary action and selected/active state;
  status colours only when they carry meaning; no decorative colour.
- Surfaces: hairline `--border-soft` + at most one soft shadow on overlays. Cards only for real
  objects (a job, an application); lists/tables otherwise.
- Never repeat information already visible (company in title and subtitle; tools list that the
  sidebar has; "Remote" twice). Drop generic purpose sentences.
- Truncation is a smell: at 1440px the important text must not truncate.
- Hover reveals *secondary* actions only; the primary info/action never depends on hover.
- No `!important`. No inline hex. No new CSS file per page unless the page genuinely needs it
  (and then token-only).
- Don't change routes, API calls or behaviour. Keep accessible names, `data-testid`s and
  Playwright-relied selectors, or update every test/spec that uses them (grep `frontend/e2e`).

## 5. Running the app locally

- Branch: `overhaul/work-tool` (don't work on `main`, `deploy`; `chapter2` is the PR base).
- Node: prefix commands with `PATH=/opt/homebrew/opt/node@22/bin:$PATH`; package manager **pnpm**.
- Postgres 16 is running locally (`/opt/homebrew/opt/postgresql@16/bin` on PATH). `backend/.env`
  points at `cw_local` and has `LLM_PROVIDER=fake` (AI output is placeholder text).
- Use a **separate database** for viewing: `createdb cw_chapter2`, then from `backend/` run
  `DATABASE_URL=<cw_local url with /cw_chapter2> .venv/bin/alembic upgrade head`. (The migrations
  were squashed; an old `cw_local` must be dropped/recreated.) `.claude/launch.json` is
  git-ignored locally and already has `backend-chapter2` (uses that DB) and `frontend`
  configs → `preview_start {name: "backend-chapter2"}` and `{name: "frontend"}` (ports 8000/3000).
- Seed: `node frontend/scripts/seed-demo.mjs demo@example.com '<password you choose>'`, then from
  `backend/` with `DATABASE_URL` set: `python -m tests.seed_discovery_listings <email>`,
  `python -m tests.seed_campaigns <email>`, `python -m tests.promote_admin <email>`. Use
  `@example.com` addresses (`.test` is rejected by the email validator). Sign in through the
  login form in the built-in browser. Never reuse a real password; never print credentials into
  committed files.
- Browser: use the built-in browser tools (`mcp__Claude_Browser__*`). Each subagent must create
  its **own tab** with `tabs_create` and pass its `tabId` everywhere (the pane has a tab cap —
  close tabs when done). `resize_window` for 1440×900 and 375×812; **reset to desktop** after.
- Demo data gotchas: the Discover listings and applications come from the seed scripts; result
  pages need a Resume run + Job Match run (the seed script creates one each — find their ids in
  `/history`).

## 6. Quality gates and the machine's limits (important)

The owner's Mac overheated (load average ~60) when six agents ran the full vitest suite at once.
Hard rules, include them in **every** subagent prompt:
- Never run bare `pnpm test`. Run only your own files:
  `npx vitest run <paths> --maxWorkers=1 --minWorkers=1`.
- `pnpm typecheck` at most once per agent, at the end.
- Orchestrator runs the **full** gate, one command at a time, never concurrently with agents:
  1. `pnpm typecheck`
  2. `npx vitest run --maxWorkers=3 --minWorkers=1`
  3. `pnpm build`
  4. Playwright on separate ports with a throwaway DB:
     `createdb cw_e2e_overhaul`, then with `PATH` including node@22, postgresql@16 and
     `backend/.venv/bin` (alembic must be on PATH or the backend won't start):
     `E2E_DATABASE_URL=postgresql+psycopg2://<user>@127.0.0.1:5432/cw_e2e_overhaul E2E_FRONTEND_PORT=3520 E2E_BACKEND_PORT=8520 pnpm test:e2e`
     (~4 min, must be **54/54**; fix tests/selectors rather than skipping).
  Backend is untouched by this work; run `pytest` only if you touch `backend/`.
- Hosted GitHub Actions are paused by policy (`.github/workflows/ci.yml` stays manual-dispatch).
  Do not add triggers.
- Visual QA is mandatory before any "done": real screenshots at 1440 and 375 reviewed by you for
  *every* page and the states listed in Phase 4. Automated check for horizontal overflow at 375
  on all routes (script in the previous session: iterate routes in iframes, flag elements whose
  right edge > viewport and that aren't inside an overflow container).
- Known gotcha (already fixed, keep fixed): fixed UI (cookie banner) must never cover primary
  actions — the app pads below it. Tour/animations must respect `prefers-reduced-motion`
  (an e2e asserts no long-running animations at /dashboard, /, /resume).

## 7. Git and permissions

- Commit often on `overhaul/work-tool` with Conventional Commit messages ending with the
  attribution line the harness gives you. Push to origin; PR #427 stays **draft**.
- Subagents must not run state-changing git commands (checkout, reset, stash, commit). Only the
  orchestrator commits. Stage by explicit path, not blanket `git add -A` if other work is in
  flight (note `*.env.aside` files are not gitignored).
- Never push to `main` or `deploy`. Never merge PRs (blocked by the auto-mode classifier; the
  owner clicks Merge). Never edit your own permission settings.
- Don't create new docs beyond the ones listed in Phase 5. Don't add i18n, dark mode, a premium
  tier, ads or CAPTCHA (see "What NOT to Do" in CLAUDE.md).

## 8. Definition of done

1. Every in-app route, in every state in Phase 4, is consistent and on-identity at 1440 and 375;
   `/_kit` documents the system; no page defines private badge/section/row/button styles.
2. `workbench.css` gone (or merged into `kit.css`), `!important` count in app CSS ≈ 0, dead CSS
   removed, no blue left, no hard-coded hex outside tokens and `landing.css`.
3. New logo/favicon in place; serif + sans pairing visibly doing work; landing page not broken.
4. Gate green: typecheck, vitest, build, Playwright 54/54, axe zero serious/critical, overflow
   check clean.
5. Before/after contact sheet delivered, PR #427 updated and described honestly (what changed,
   what was verified, what was not), handoff notes added to memory and `CLAUDE.md`.

## 9. How to report to the owner

Short and plain. Lead with what they'll see, then evidence (screenshots, gate numbers), then any
decisions you need from them. If something is not verified, say so — the owner has caught
"done" claims that skipped visual checks before and trusts honesty over polish. Ask them
only for decisions that are genuinely theirs (brand choices, merging, anything touching `main`).
