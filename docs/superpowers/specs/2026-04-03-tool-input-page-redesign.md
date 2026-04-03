# Tool Input Page Redesign Spec
**Date:** 2026-04-03  
**Scope:** All 6 tool input pages — desktop + mobile  
**Goal:** Elevate input pages to match the premium feel of result pages. Simple, not dramatic. Linear/Vercel energy.

---

## Problem

Result pages feel premium; input pages feel like a different (older) product. The current input pages have:
- Flat light blue-gray background with no depth
- Generic card styling with no visual hierarchy
- Heavy status indicator bars ("Resume loaded") that look like error states
- Large empty space at the bottom on mobile
- No sense of the dark/rich aesthetic the rest of the app uses

---

## Design Direction: Hero / Form Split

Each tool input page is divided into two distinct visual zones:

### Zone 1 — Dark Hero Panel (top)

A self-contained dark panel at the top of every tool input page.

**Background:**
- Gradient: `#0f172a → #1a2744` (slate-navy), left-to-right or top-to-bottom
- Noise texture overlay: CSS SVG grain at ~3% opacity for tactile depth
- Soft radial glow (`rgba(99,130,255,0.12)`) centered behind the tool illustration

**Content (vertically centered in panel):**
- **Tool icon**: existing icon, no white card box wrapper — sits directly in the dark with a subtle glow ring (`box-shadow: 0 0 40px rgba(99,130,255,0.2)`)
- **Floating chips**: ("Skills", "Score", "Tips" etc.) — refined as small pills with `border: 1px solid rgba(255,255,255,0.15)`, white text at 65% opacity. Metadata feel, not decoration.
- **Tool title**: `font-size: clamp(2rem, 4vw, 2.75rem)`, `font-weight: 800`, `color: #fff`
- **Subtitle**: `font-size: 1rem`, `color: rgba(255,255,255,0.55)`, lighter weight
- **Resume status line**: single inline line below subtitle — `✓ Resume loaded` or `✓ Resume carried from previous tool` in `rgba(255,255,255,0.38)`, `font-size: 0.85rem`. No card, no bar.

**Sizing:**
- Desktop: `min-height: 42vh`, content centered with `padding: 3rem 2rem`
- Mobile: `min-height: 36vh`, same centering

**Transition to Zone 2:**
- Hard edge (no fade) — clean break between dark hero and light form surface. The contrast does the work.

---

### Zone 2 — Form Surface (below hero)

The existing form cards, cleaned up and better organized.

**Background:** `#f8f9fb` (very slightly off-white, not pure white — avoids harshness against the dark hero)

**Status indicators:**
- Removed as standalone cards entirely
- Replaced with a single subtle inline row above the first form field:
  - `✓ Resume loaded · Change` — just text + a link, `font-size: 0.82rem`, `color: var(--muted)`
  - Green dot (`●`) accent before the checkmark text

**Form cards:**
- Existing `.tool-fs-panel` cards kept but refined:
  - Slightly tighter border radius (`12px` instead of current `16px+`)
  - `background: #fff`, `border: 1px solid rgba(0,0,0,0.07)`
  - Section titles: `font-weight: 700`, `font-size: 1rem`, `color: var(--foreground)`
  - Helper text: `font-size: 0.85rem`, `color: var(--muted)`

**Submit button / footer:**
- Existing sticky footer pattern kept
- Button styling unchanged (tool accent color)
- No forced min-height — content ends naturally, no dead space

---

## Mobile Specifics

- Hero panel compresses to `36vh` — still distinct, still dark, never overwhelming
- Form cards stack naturally with `padding: 1.25rem 1rem`
- The "Resume status" inline text remains one line (truncate if needed)
- No empty space hack — content simply ends, bottom tab bar follows
- The `ParsedResumeNotice` card (currently a separate white card) is collapsed into the inline status line above

---

## Component Changes

| Component | Change |
|-----------|--------|
| `ToolFullScreen` / `tool-fullscreen.css` | Add `.tool-hero-panel` dark section at top |
| `ResumeToolPage.tsx` (+ all 5 others) | Move title/illustration into hero panel, move form below |
| `ParsedResumeNotice` | Replace with inline status text above first field |
| `resume-bespoke-header` CSS class | Strip from form zone, apply only within hero panel |
| `tool-fs-body` | Add `background: #f8f9fb` to form zone only |
| `tooling-fullscreen.css` | Add `.tool-hero-panel`, `.tool-status-inline` classes |

---

## What Does NOT Change

- Form field logic, validation, draft management — untouched
- Sticky footer / submit button position — untouched
- Mobile bottom tab bar — untouched
- Two-column layouts (Job Match, Interview) — keep but apply same hero above them
- All 6 tools get the same treatment (same hero structure, tool-specific accent color via `--tool-accent`)
- No animations added (keep it simple)

---

## Verification

1. **Desktop**: Load each of the 6 tool pages. Hero panel is dark, form surface is light, no jarring transition artifacts.
2. **Mobile**: Scroll through Resume Analyzer on mobile — hero at top, form cards below, no empty space at bottom.
3. **Status line**: Upload a resume, carry it to next tool — status shows as inline subtle text, not a card.
4. **Theme consistency**: Tool accent color (`--tool-accent`) still colors the submit button and focus states.
5. **No regressions**: Existing Vitest suite passes. Two-column layouts (Job Match) still work.
