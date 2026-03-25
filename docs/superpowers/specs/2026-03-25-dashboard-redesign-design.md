# Dashboard Redesign: Dark Hero + Floating Grid

**Date:** 2026-03-25
**Status:** Approved

## Problem

The current dashboard has two issues:
1. **Redundancy** — tools appear twice (ShowcaseGrid + QuickStartGrid timeline), adding visual clutter without proportional value
2. **Dropzone visibility** — the upload area needs to be the most obvious element on the page since it's the entry point for all 6 tools

## Design Direction

**Dark gradient hero** that extends from the nav bar, with a **glowing dashed dropzone** and an aspirational headline. Tool showcase cards **float over the dark-to-light gradient transition**, creating cinematic depth. Tools appear once, not twice.

## Architecture

```
DashboardPage
├── DarkHeroSection (new wrapper)
│   ├── Headline (eyebrow + title + subtitle)
│   ├── DropzoneHero (existing component, re-styled)
│   └── DashboardShowcaseGrid (repositioned into dark section)
│       └── DashboardShowcaseCard (x6, with elevated shadows)
├── ActivitySection (auth-gated)
│   ├── RecentRuns / FavoriteRuns → replaced with StatsCards
│   └── DashboardActivityFooter (unauthenticated fallback)
└── OnboardingTour (unchanged)
```

## Section 1: Dark Hero

### Background
- Gradient: `#0f1a2e` → `#152a47` (40%) → `#1a3356` (70%) → `#edf3fa` (100%)
- Seamless with the dark nav bar (`--nav-bg: #0f1a2e`)
- Ambient radial glows: `rgba(74,147,239,0.1)` at ~20% from left and `rgba(10,102,194,0.06)` at ~15% from right

### Headline
- Eyebrow: "Your workspace" — `9px`, uppercase, `letter-spacing: 0.18em`, `rgba(112,181,249,0.7)`
- Title: "Land your next role" — `clamp(1.8rem, 3vw, 1.6rem)` (scale with current `--type-display-lg`), `700`, white, `letter-spacing: -0.035em`
- Subtitle: "Upload your resume to unlock six AI-powered career tools" — `11px`, `rgba(200,215,230,0.55)`
- All centered

### Dropzone
- Full-width dashed box: `2.5px dashed rgba(112,181,249,0.3)`, `border-radius: 18px`
- Background: `rgba(255,255,255,0.04)` + `backdrop-filter: blur(10px)`
- Glow behind: radial gradient `rgba(74,147,239,0.16)` with `filter: blur(24px)`
- Shadow: `0 8px 32px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.03)`
- Min-height: `160px`, centered content
- Upload icon: `56px` square, gradient background `rgba(74,147,239,0.2)` → `rgba(10,102,194,0.12)`, border `rgba(112,181,249,0.25)`, glow shadow `0 4px 20px rgba(74,147,239,0.12)`
- Text: "Drop your resume here" at `15px 600`, "browse files" link in `#70b5f9`
- File type pills: PDF, DOCX, "up to 5MB" — `9px`, `rgba(200,215,230,0.4)` text, subtle background and border

### Dropzone States
- **Hover:** border brightens to `rgba(112,181,249,0.45)`, glow intensity increases
- **Drag-over:** border `rgba(112,181,249,0.6)`, background `rgba(10,102,194,0.08)`, icon pulses
- **Success:** navigates to `/resume` (existing `DropzoneHero` behavior)

### Implementation
- Reuse existing `DropzoneHero` component for file parsing logic
- Reuse `writeWorkflowContext` for storing parsed resume text
- New CSS classes: `dash-hero-dark`, `dash-hero-dark-glow`, `dash-hero-dark-drop`

## Section 2: Tool Showcase Grid (Floating)

### Layout
- 3×2 grid, `gap: 12px`
- Positioned within the dark hero section so cards overlap the gradient transition
- The gradient fades from dark to `#edf3fa` behind the cards, making them appear to float

### Cards
- Background: `rgba(255,255,255,0.95)` (near-opaque for readability over dark)
- Border: `1px solid rgba(202,223,242,0.6)`
- Shadow: `0 12px 32px rgba(16,42,67,0.08), 0 2px 8px rgba(16,42,67,0.04)` (elevated for floating effect)
- Border-radius: `12px`
- Thumbnail: `16:10` aspect ratio, uses existing carousel images (`thumb-resume.png`, etc.)
- Icon badge: `22px` square with gradient background, 1px border, tool's Lucide icon at 11px
- Tool name: `11px 600` color `#1e293b`
- Description: `8px` color `#94a3b8`
- Links to tool route

### Card Hover
- `translateY(-4px)`, shadow deepens
- Border tints with tool accent color
- Thumbnail image `scale(1.05)` with overflow hidden

### Animations
- Entrance: reuse existing `StaggerChildren` / `StaggerItem` from Framer Motion
- Stagger: `0.06s` delay, `0.04s` initial delay (matches current)

### Tool Order
Resume, Job Match, Career, Cover Letter, Interview, Portfolio (matches current `showcaseTools` array)

## Section 3: Activity Stats

### Layout
- 2-column grid on light background (`#edf3fa`)
- Header: "Recent activity" label + "View all" link to `/history`

### Stats Cards
- Glass card with `padding: 16px`
- Layout: icon (38px gradient square) + number (20px 700 in `#0a66c2`) + label (9px in `#94a3b8`)
- Card 1: Activity icon + "Total Runs" count
- Card 2: Star icon + "Favorites" count
- Data: from existing `useSession` / query hooks

### Auth Gating
- Authenticated: show stats cards with real data
- Unauthenticated: show `DashboardActivityFooter` (existing sign-in prompt component)

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `src/pages/dashboard-page.tsx` | Modify | Remove `QuickStartGrid` import, wrap hero+grid in dark section div |
| `src/components/dashboard/DashboardHero.tsx` | Rewrite | Dark hero with centered headline + glowing dashed dropzone |
| `src/components/dashboard/DashboardShowcaseCard.tsx` | Modify | Add icon badge, adjust shadow for floating effect |
| `src/components/dashboard/DashboardShowcaseGrid.tsx` | Minor | Adjust wrapper class |
| `src/styles/dashboard.css` | Major | Remove ~400 lines (timeline), add ~125 lines (dark hero, glow, floating) |
| `src/components/dashboard/QuickStartGrid.tsx` | Delete | No longer used |
| `src/components/dashboard/RecentRuns.tsx` | Modify | Replace with stats cards (or keep if we want run list later) |
| `src/components/dashboard/FavoriteRuns.tsx` | Modify | Replace with stats cards |

## Files NOT Modified

- `src/styles/theme.css` — design tokens unchanged
- `src/lib/tools/registry.ts` — tool definitions unchanged
- `src/components/tooling/DropzoneHero.tsx` — reused as-is
- `src/components/ui/motion.tsx` — reused as-is
- `src/components/app/PageFrame.tsx` — minimal changes (remove `premium-corner-canvas` class for dashboard)
- All tool pages, backend, routing — untouched

## CSS Budget

| Category | Lines Removed | Lines Added |
|----------|--------------|-------------|
| QuickStart timeline | ~400 | 0 |
| Carousel styles | ~80 | 0 |
| Tool preview styles | ~120 | 0 |
| Dark hero | 0 | ~50 |
| Glowing dropzone | 0 | ~40 |
| Floating cards | 0 | ~20 |
| Gradient transition | 0 | ~15 |
| **Net** | **~600** | **~125** |

Estimated dashboard.css reduction: 1,799 → ~1,324 lines

## Responsive Behavior

- **Desktop (>1024px):** 3-column tool grid, full hero with gradient
- **Tablet (768-1024px):** 2-column tool grid, reduced hero padding
- **Mobile (<768px):** Single-column tool grid, stacked layout, dropzone stays full-width

## Verification

1. Start dev server: `cd frontend && pnpm dev`
2. Navigate to `/dashboard`
3. Verify:
   - Dark hero gradient flows seamlessly from nav bar
   - Dropzone is unmissable with glow effect
   - Tool cards float over the gradient transition with elevated shadows
   - Drag-and-drop works on the dropzone (file parses and navigates to `/resume`)
   - Tool cards link to correct routes
   - Activity stats display correctly for authenticated users
   - Unauthenticated users see sign-in prompt
   - Entrance animations stagger correctly
   - Hover effects work on cards and dropzone
   - Responsive layout works at all breakpoints
   - No visual regression on other pages
