# Career Workbench — Design System Reference

Use this document as the single source of truth when generating UI designs for this project. Every color, font, spacing value, and component pattern below is what the app actually uses. Do not deviate from these tokens.

---

## Color Palette

### Backgrounds
| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `#edf3fa` | Page background (light blue-gray) |
| `--surface-raised` | `#ffffff` | Cards, panels, content areas |
| `--surface-focus` | `#f3f8fd` | Input backgrounds, hover states |
| `--surface-subtle` | `#f7fbff` | Subtle alternate backgrounds |
| `--surface-tint` | `rgba(29, 108, 181, 0.05)` | Light blue tint overlay |
| `--surface-blue` | `#eef5fc` | Blue-tinted surface |

### Text
| Token | Value | Usage |
|-------|-------|-------|
| `--text-strong` | `#16324b` | Headings, primary text (dark navy) |
| `--text-body` | `#36506b` | Body text (medium navy) |
| `--text-muted` | `#617b95` | Labels, secondary text |
| `--text-soft` | `#8198ad` | Placeholder, disabled text |

### Accent (Primary)
| Token | Value | Usage |
|-------|-------|-------|
| `--accent` | `#0a66c2` | Primary blue (LinkedIn-esque) |
| `--accent-vivid` | `#0a4f98` | Darker blue for emphasis |
| `--accent-soft` | `rgba(10, 102, 194, 0.08)` | Light blue fill |
| `--accent-hover` | `rgba(10, 102, 194, 0.14)` | Hover state fill |

### Semantic Colors
| Token | Value | Usage |
|-------|-------|-------|
| `--success` | `#0a8a50` | Strengths, matched, positive |
| `--success-soft` | `rgba(10, 138, 80, 0.08)` | Success background tint |
| `--warning` | `#d97706` | Warnings, medium severity |
| `--warning-soft` | `rgba(217, 119, 6, 0.08)` | Warning background tint |
| `--destructive` | `#dc2626` | Errors, high severity |
| `--destructive-soft` | `rgba(220, 38, 38, 0.08)` | Error background tint |

### Score Colors (Radial Gauges & Progress Bars)
| Range | Start → End Gradient | Single Color |
|-------|---------------------|-------------|
| 70-100 (Good) | `#16a34a` → `#4ade80` | `#22c55e` |
| 41-69 (Medium) | `#d97706` → `#fbbf24` | `#f59e0b` |
| 0-40 (Low) | `#dc2626` → `#f87171` | `#ef4444` |

### Borders & Dividers
| Token | Value | Usage |
|-------|-------|-------|
| `--border-soft` | `#d7e5f1` | Default card/input borders |
| `--border-strong` | `#bed4e6` | Hover/focus border emphasis |
| `--divider` | `#e8f0f7` | Section divider lines |

### Shadows
| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-soft` | `0 10px 28px rgba(19,44,72,0.05), 0 2px 8px rgba(19,44,72,0.04)` | Default card shadow |
| `--shadow-elevated` | `0 18px 42px rgba(19,44,72,0.08), 0 4px 14px rgba(19,44,72,0.05)` | Hover/lifted cards |
| `--shadow-panel` | `0 24px 60px rgba(15,34,58,0.1), 0 8px 24px rgba(15,34,58,0.06)` | Modal/panel |

**Shadow rule**: All shadows use blue-tinted black `rgba(19, 44, 72, ...)`, NOT pure `rgba(0,0,0,...)`. This matches the cool-blue palette.

### Sidebar (Dark Navigation)
| Token | Value | Usage |
|-------|-------|-------|
| `--sidebar` / `--nav-bg` | `#0f1a2e` | Sidebar background (dark navy) |
| `--sidebar-foreground` / `--nav-text` | `#c7d4e1` | Sidebar text |
| `--nav-text-strong` | `#f0f4f8` | Active/highlighted nav text |
| `--nav-active-bg` | `rgba(74, 158, 237, 0.12)` | Active nav item background |
| `--nav-accent` | `#4a9eed` | Nav accent highlight |
| `--sidebar-accent` | `#1a2742` | Sidebar hover surface |

---

## Typography

### Font
- **Family**: `Geist` (sans-serif)
- **Weights loaded**: 400 (Regular), 500 (Medium), 600 (SemiBold), 700 (Bold), 800 (ExtraBold)
- **Stack**: `'Geist', ui-sans-serif, system-ui, -apple-system, sans-serif`
- **Numbers**: Use `font-variant-numeric: tabular-nums` for all score displays and data

### Type Scale
| Token | Size | Usage |
|-------|------|-------|
| `--type-display-xl` | `clamp(2.6rem, 4vw, 4rem)` | Landing page hero headlines |
| `--type-display-lg` | `clamp(2.15rem, 3vw, 3.15rem)` | Secondary display text |
| `--type-page-title` | `clamp(1.8rem, 1.45rem + 1.15vw, 2.65rem)` | Page titles |
| `--type-tool-title` | `1.5rem` | Tool page headings |
| `--type-section` | `1.16rem` | Section headings |
| `--type-body` | `0.95rem` | Body text |
| `--type-small` | `0.8125rem` | Small labels, meta text |
| `--type-xs` | `0.75rem` | Extra small, tags |

### Letter Spacing
| Token | Value | Usage |
|-------|-------|-------|
| `--tracking-display` | `-0.03em` | Display/hero text |
| `--tracking-title` | `-0.025em` | Titles and headings |
| `--tracking-section` | `-0.025em` | Section headings |
| `--tracking-tight` | `-0.015em` | Tight tracking for numbers |
| `--tracking-caps` | `0.1em` | Uppercase labels |

### Typography Classes
| Class | Style | Usage |
|-------|-------|-------|
| `.display-xl` | 800 weight, 0.96 line-height, -0.035em tracking | Hero headlines |
| `.display-lg` | 800 weight, 0.98 line-height, -0.03em tracking | Secondary heroes |
| `.page-title` | 700 weight, 1.05 line-height, -0.02em tracking | Page headings |
| `.section-title` | 700 weight, 1.2 line-height, -0.03em tracking, 1.2rem | Section headings |
| `.eyebrow` | 700 weight, 0.7rem, uppercase, 0.14em tracking, muted color | Labels above sections |

---

## Spacing & Layout

### Border Radius
| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | `5px` | Small elements, tags |
| `--radius-md` | `8px` | Buttons, inputs |
| `--radius-lg` | `12px` | Cards |
| `--radius-xl` | `16px` | Large cards, panels |
| `--radius-2xl` | `22px` | Hero sections, main content blocks |
| `--radius-pill` | `9999px` | Pills, chips, badges |

### Page Spacing
| Token | Value | Usage |
|-------|-------|-------|
| `--space-page-x` | `clamp(1.25rem, 4vw, 2.5rem)` | Horizontal page padding |
| `--space-page-y` | `2rem` | Vertical page padding |
| `--space-section` | `clamp(3rem, 6vw, 5rem)` | Between major sections |

### Result Page Specific
| Token | Value |
|-------|-------|
| `--shell-max` | `74rem` (max content width) |
| `--zone-gap` | `1.375rem` (gap between hero + content) |
| `--rs-pad-x` | `1.75rem` (section horizontal padding) |
| `--rs-pad-y` | `1.375rem` (section vertical padding) |

### Mobile Tokens
| Token | Value |
|-------|-------|
| `--touch-target` | `44px` |
| `--mobile-section-gap` | `24px` |
| `--mobile-pad` | `16px` |
| `--mobile-tab-height` | `56px` |

---

## Transitions & Animation

| Token | Value | Usage |
|-------|-------|-------|
| `--transition-fast` | `120ms cubic-bezier(0.16, 1, 0.3, 1)` | Micro-interactions (hover, focus) |
| `--transition-smooth` | `220ms cubic-bezier(0.16, 1, 0.3, 1)` | Standard transitions |
| `--transition-slow` | `380ms cubic-bezier(0.16, 1, 0.3, 1)` | Larger animations |
| `--spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Bouncy/spring animations |

### Animation Patterns
- **Fade up**: Elements enter with `translateY(10-16px)` + `opacity: 0` → `translateY(0)` + `opacity: 1`
- **Stagger**: 50ms delay between sibling items (up to 8 items)
- **Score ring**: `stroke-dashoffset` animated over 1.2s
- **Progress bars**: `width` animated over 0.8s with `cubic-bezier(0.16, 1, 0.3, 1)`
- **Hover lift**: `translateY(-1px)` + shadow upgrade
- **Active press**: `scale(0.96-0.98)`
- **Score glow**: `pulse-glow` 3s infinite on score ring

---

## Component Patterns

### Cards
- **Default card**: White background (`--surface-raised`), 1px `--border-soft` border, `--shadow-soft`, `--radius-xl` to `--radius-2xl`
- **Inner highlight**: `0 0 0 1px rgba(255,255,255,0.6) inset, 0 1px 2px rgba(255,255,255,0.3) inset` for glass edge effect
- **Hover**: shadow upgrades to `--shadow-elevated`, border to `--border-strong`
- **Accent-left card**: 3px left border in accent/success/warning color

### Chips/Tags
- **Positive**: `background: var(--success-soft)`, `color: var(--success)`, pill radius
- **Warning**: `border: 1px solid var(--warning)`, transparent background, pill radius
- **Neutral**: `background: var(--surface-focus)`, `color: var(--text-muted)`, pill radius
- **Size**: `0.75rem` font, `0.25rem 0.625rem` padding

### Buttons
- **Primary**: `background: var(--accent)`, white text, `--radius-md`
- **Ghost**: transparent background, `--text-muted` color, border on hover
- **Icon button**: `2rem` square, `--radius-md`, border, hover lift

### Score Gauges
- **SVG radial gauge**: Circle with `stroke-dasharray` animation
- **Gradient stroke**: Uses `linearGradient` with score-based colors (green/amber/red)
- **Glow filter**: Soft glow matching gauge color
- **Sizes**: Hero 88px, Breakdown 104px, Role-fit 64px

### Progress Bars (Insight Strip)
- **Track**: 0.5rem height, subtle gray with inner highlight
- **Fill**: Gradient from score color, with glow shadow and top highlight
- **Label**: Left-aligned, uppercase, 0.78rem, weight 600
- **Value**: Right-aligned, 0.9375rem, weight 700, tabular-nums

---

## Theme Identity

### Overall Aesthetic
- **NOT an AI tool aesthetic** — no purple/blue gradients, no neon, no dark mode
- Think: **Linear meets Notion meets Vercel dashboard**
- Cool-blue tinted light theme with navy accents
- Professional, trustworthy, data-rich but clean
- Generous whitespace, clear hierarchy

### Hybrid Theme
- **Sidebar/navigation**: Dark navy (`#0f1a2e`)
- **Content area**: Light (`#edf3fa` background, white cards)
- **Hero sections**: White card on light background (NOT dark hero)
- **No dark mode toggle** — single theme only

### Design Principles
1. Blue-tinted shadows, never pure black
2. Muted, desaturated colors — calming, not loud
3. One accent color (`#0a66c2`) — no multi-color accents
4. Score colors are the only bright elements (green/amber/red for data)
5. Subtle noise texture overlay (0.025 opacity) on result pages for depth
6. Inner glass highlight on cards for premium feel
7. Typography does the heavy lifting — bold numbers, tight tracking on headlines
8. No emojis anywhere in the UI — geometric icons only (Lucide icon set)
