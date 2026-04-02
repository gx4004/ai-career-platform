# Visual QA Pass — All 6 Tool Result Pages

## Mission

You are doing a comprehensive visual QA, debugging, and polish pass across all 6 tool result pages in this career platform. These pages were recently redesigned from Stitch mockups. You need to screenshot every page at desktop and mobile widths, identify every visual bug, layout issue, and design flaw, then fix them directly in the code.

**Take your time. This is the most important task. Quality over speed.**

## Context

- **Stack**: React 19 + TanStack Start + Vite 7 + vanilla CSS (BEM-ish) in `frontend/src/styles/results.css`
- **Components**: All 6 result views live in `frontend/src/lib/tools/resultDefinitions.tsx`
- **Result wrapper**: `frontend/src/components/tooling/ToolResultScreen.tsx` — renders hero, heroExtra, midSection, content
- **CSS files**: `frontend/src/styles/results.css` (main), `frontend/src/styles/tooling.css`, `frontend/src/styles/responsive.css`
- **Design system ref**: `design.md` at project root has color tokens, typography, spacing
- **The 6 tools** (in order): Resume Analyzer, Job Match, Cover Letter, Interview Q&A, Career Path, Portfolio Planner
- **Resume + Job Match** use dark hero variant with score ring + fix-first cards
- **Cover Letter + Interview + Career + Portfolio** use light/default hero with heroExtra badges/strips
- **Mobile fix was deferred** — all pages may have mobile overflow/layout issues

## How to Run the App

```bash
cd frontend && pnpm dev
```
App runs on http://localhost:3000. You need to:
1. Log in or use a test account
2. Navigate to each tool's result page (run a tool or find existing results in history)
3. If no results exist, you may need to trigger a tool run first

**Alternative**: If you can't easily get real data, check if there's mock/seed data or use the app normally.

## Process — Follow This Exactly

### Phase 1: Desktop QA (1280px viewport)

For EACH of the 6 tool result pages:

1. **Navigate** to the result page
2. **Screenshot** the full page (scroll down to capture everything)
3. **Audit** against this checklist:

#### Layout Checks
- [ ] Hero section renders correctly (icon/score, title, subtitle, heroExtra badges)
- [ ] 2-column grid doesn't overflow — right column stays within bounds
- [ ] Cards have consistent border-radius, shadows, spacing
- [ ] No horizontal scrollbar appears
- [ ] Content max-width is reasonable (not stretching to edges on wide screens)
- [ ] Sticky sidebars stick properly and don't overlap footer/other elements
- [ ] Grid gaps are consistent between sections

#### Typography Checks
- [ ] Headlines use tight letter-spacing (-0.02em or tighter)
- [ ] Body text has comfortable line-height (1.5-1.75)
- [ ] No text overflow or clipping
- [ ] Font weights create clear hierarchy (not everything bold or everything regular)
- [ ] Uppercase labels have positive letter-spacing (0.05-0.1em)
- [ ] Numbers use tabular figures where appropriate
- [ ] No orphaned single words on lines (use text-wrap: balance on headings)

#### Color & Surface Checks
- [ ] Shadows are tinted (not pure black rgba)
- [ ] Accent color (#0a66c2) used consistently, not mixed with other blues
- [ ] Status colors consistent: green=#0a8a50/#16a34a, amber=#d97706, red=#dc2626
- [ ] Dark cards (action cards, competency maps) use #16324b or #0f1a2e, not random darks
- [ ] Borders use var(--border-soft) consistently
- [ ] No harsh contrast jumps between adjacent sections

#### Interactivity Checks
- [ ] Buttons have hover states (color shift, slight scale, or translate)
- [ ] Cards that should be interactive have hover lift effect
- [ ] Transitions are smooth (200-300ms), no instant snaps
- [ ] Focus rings visible on keyboard navigation
- [ ] Clickable elements have cursor:pointer

#### Component-Specific Checks

**Resume Analyzer**: Dark hero with 192px score ring, breakdown bars, 3 fix-first cards overlapping hero, feedback card with strengths+issues, keyword card with matched/missing chips

**Job Match**: Dark hero with score ring, stat strip, 3 fix-first cards, requirements table with status dots, tailoring actions, keywords, recruiter summary sidebar

**Cover Letter**: Light hero with tone+word count badges, document card with serif font and editable textareas, side annotations on hover, customization notes sidebar, dark action card with copy/download

**Interview Q&A**: Light hero with stat strip badges, question cards with category labels and quoted answers, practice-first cards with amber border, focus areas sidebar with dark card, weak signals, next actions

**Career Path**: Light hero with fit score box, recommended path card with blue left border and numbered roadmap, skill gaps table with urgency dots, alternative path cards in sidebar

**Portfolio Planner**: Light hero with readiness progress bar, numbered build sequence with project cards, "Start Here" badge on first project, presentation tips dark card in sidebar, deliverables checklist

4. **Document** every issue found with:
   - Which page
   - What's wrong (screenshot reference)
   - Severity: CRITICAL (broken layout), HIGH (ugly but functional), MEDIUM (polish), LOW (nitpick)

5. **Fix** each issue directly in CSS/TSX. After fixing, re-screenshot to verify.

### Phase 2: Mobile QA (375px viewport)

Repeat the entire process at 375px width. Additional mobile-specific checks:

- [ ] All grids collapse to single column
- [ ] No horizontal overflow (the #1 mobile bug)
- [ ] Text doesn't get clipped or shrunk too small
- [ ] Sidebars stack below main content
- [ ] Touch targets are at least 44px
- [ ] Dark hero score ring fits within viewport
- [ ] Fix-first cards stack vertically
- [ ] Document card (cover letter) is readable
- [ ] Question cards (interview) don't overflow
- [ ] Roadmap steps (career/portfolio) are readable
- [ ] Bottom padding accounts for mobile nav bar (72px)

### Phase 3: Cross-Page Consistency

After fixing individual pages, do a rapid scroll-through of all 6 to check:

- [ ] Hero sections have consistent padding/spacing across all tools
- [ ] Card shadows and border-radius are uniform
- [ ] Typography scale is consistent (same heading sizes, label sizes)
- [ ] Color usage is consistent (same greens, ambers, blues everywhere)
- [ ] Spacing rhythm is consistent (same gaps between sections)

## Design Skill Audit (Apply to Every Page)

Use the redesign skill checklist. Key items to enforce:

1. **Typography**: Geist font, negative tracking on headlines, tabular-nums on data, text-wrap:balance on headings
2. **Shadows**: Tinted with `rgba(19,44,72,...)`, not pure black. Soft: `0 10px 28px rgba(19,44,72,0.05)`, Elevated: `0 18px 42px rgba(19,44,72,0.08)`
3. **Transitions**: All interactive elements need `transition: all 0.2s ease` minimum
4. **Hover states**: Cards lift (`translateY(-2px)` + elevated shadow), buttons darken/scale
5. **Border radius**: Outer containers 1rem+, inner elements 0.5rem, pills use full
6. **Noise texture**: Result shell already has `::before` noise overlay — verify it's visible
7. **No inline styles**: Move repeated inline styles to CSS classes

## Files You'll Modify

Primary:
- `frontend/src/styles/results.css` — most fixes go here
- `frontend/src/lib/tools/resultDefinitions.tsx` — component structure fixes
- `frontend/src/components/tooling/ToolResultScreen.tsx` — hero/wrapper fixes

Secondary (if needed):
- `frontend/src/styles/responsive.css` — mobile breakpoints
- `frontend/src/styles/tooling.css` — general tooling styles

## Commands

```bash
cd frontend && pnpm dev          # Start dev server
cd frontend && pnpm typecheck    # Check for TS errors after changes
cd frontend && pnpm build        # Verify production build
```

## Rules

- Fix issues in CSS first. Only touch TSX if the DOM structure is wrong.
- Use `minmax(0, Xfr)` in all CSS Grid columns to prevent overflow.
- Never use `width: 100vw` — it causes horizontal scrollbar.
- Test after every batch of fixes. Don't accumulate 20 changes before checking.
- Don't add new npm dependencies.
- Don't restructure things that work. Polish, don't rewrite.
- Keep changes minimal and targeted — this is QA, not redesign.
- After all fixes, run `pnpm typecheck && pnpm build` to verify nothing broke.
- Do NOT commit. Leave changes uncommitted for review.

## Output

When done, write a summary of:
1. Total issues found per page (desktop + mobile)
2. Issues fixed vs deferred
3. Any structural problems that need deeper refactoring
