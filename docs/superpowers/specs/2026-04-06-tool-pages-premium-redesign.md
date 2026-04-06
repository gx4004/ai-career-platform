# Tool Pages Premium Redesign — Design Spec
_2026-04-06_

## Problem
Tool input pages feel visually muddy: dark navy gradient hero clashing with pale white surfaces, weak contrast, no clear hierarchy. The "Your Workspace" dashboard background is also broken — a commit overwrote the dark hero area with a flat `#d0e6f2` light wash.

## Design Decisions (locked via visual brainstorm)

### 1. Visual Direction — Arctic Minimal
- **Background**: Ice-white canvas `#f4f8ff` with a single pale-blue radial glow at the top: `radial-gradient(ellipse 72% 40% at 50% -5%, rgba(186,214,255,0.55) 0%, transparent 70%)`
- **No dark gradient hero** — the existing dark navy-to-white `tool-fullscreen--hero-flow` gradient is removed entirely from tool input pages
- Feels like Notion meets Linear: airy, intentional, premium

### 2. Typography — Outfit
- Replace Inter with **Outfit** (Google Fonts variable, weights 400–800)
- Update `--font-sans` in `theme.css`
- Global change: all labels, headings, buttons, body text

### 3. Form Panels — Elevated Paper
- White cards (`#ffffff`) on ice background
- Shadow: `0 2px 16px rgba(15,44,88,0.07), 0 0 0 1px rgba(186,214,255,0.4)`
- No colored gradients inside cards — pure white surface
- Border radius: 20px (cards), 13–14px (inner elements)

### 4. Upload/Paste — Tab Switcher
- Segmented "Upload file / Paste text" control above the dropzone
- Upload tab active by default
- Dropzone is the dominant element (tall, prominent)
- Paste text input only appears when the Paste tab is clicked — never exposed by default

### 5. Hero — Bigger Animated Illustration
- Icon box size: **88×88px** (up from 52px)
- Border radius: 22px
- Background: `linear-gradient(135deg, #dbeafe, #eff6ff)` — same for all 6 tools
- Animations are unique per tool, color palette is unified blue across all tools:
  - Resume: scanning beam sweeps over doc lines
  - Job Match: venn circles breathe in/out
  - Career Path: bars grow in staggered wave
  - Cover Letter: blinking cursor on last line
  - Interview Q&A: message bubbles bob
  - Portfolio: tiles pulse in staggered sequence

### 6. Chips
- Border radius: pill (99px)
- Background: `rgba(37,99,235,0.07)`, border: `rgba(37,99,235,0.14)`
- Font weight 600, size 11.5px

### 7. Submit Footer
- Frosted glass: `background: rgba(244,248,254,0.92)`, `backdrop-filter: blur(16px)`
- Border-top: `1px solid rgba(186,214,255,0.4)`
- Button: solid `#1d4ed8`, border-radius 11px, `box-shadow: 0 3px 10px rgba(29,78,216,0.28)`

---

## Bug Fix — Workspace Dark Gradient

**Root cause**: `frontend/src/styles/dashboard.css` commit `42760baa` added:
```css
body.page-tone-dashboard [data-slot="sidebar-inset"] {
  background: #d0e6f2; /* ← overwrites dark app-main, kills hero-gradient.svg */
}
.dashboard-page-frame.premium-corner-canvas {
  --premium-canvas-bg: #d0e6f2; /* ← same issue */
}
```

**Fix**: Change both to `transparent` so `body.page-tone-dashboard .app-main { background: #060d1a }` and the dark `hero-gradient.svg` show through correctly.

---

## Files to Modify

| File | Change |
|------|--------|
| `frontend/src/styles/theme.css` | Add Outfit to `--font-sans` |
| `frontend/src/styles/tooling-fullscreen.css` | Replace dark hero gradient with Arctic Minimal bg |
| `frontend/src/styles/tooling.css` | Elevated Paper card style, tab switcher, bigger dropzone |
| `frontend/src/components/tooling/toolPageShared.tsx` | Bigger hero icon, updated chip layout |
| `frontend/src/components/tooling/ToolHeroIllustration.tsx` | 88px size, unified blue, per-tool animations |
| `frontend/src/styles/dashboard.css` | Fix sidebar-inset background (transparent) |

---

## Verification

1. Run `cd frontend && pnpm dev`
2. Visit `/resume`, `/job-match`, `/cover-letter`, `/interview`, `/career`, `/portfolio` — confirm Arctic Minimal background, bigger animated hero icons, tab switcher, Outfit font
3. Visit `/` (dashboard/workspace) — confirm dark gradient hero is restored
4. Check mobile at 375px — confirm layout doesn't break, tab switcher stacks correctly
5. Run `pnpm typecheck` — no TS errors
