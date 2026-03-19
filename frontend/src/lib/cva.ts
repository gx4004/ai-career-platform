import { cn } from '#/lib/utils'

/* ── Layout constants ── */

export const contentMax = 'mx-auto w-full max-w-[84rem] px-[var(--space-page-x)]'
export const contentNarrow = 'mx-auto w-full max-w-[72rem] px-[var(--space-page-x)]'

/* ── Glass card variants ── */

const glassBase = 'border border-[var(--border-soft)]'

const glassElevation = {
  default: `${glassBase} bg-[var(--glass-bg)] shadow-[var(--glass-shadow)]`,
  elevated: `${glassBase} bg-[var(--glass-bg-elevated)] shadow-[var(--glass-shadow)]`,
  subtle: `${glassBase} bg-[var(--glass-bg-subtle)]`,
} as const

export function glassCard(elevation: keyof typeof glassElevation = 'default') {
  return glassElevation[elevation]
}

/* ── Surface card ── */

export const surfaceCard = cn(
  'relative overflow-hidden',
  'border border-[color-mix(in_srgb,var(--border-soft)_86%,white_14%)]',
  'bg-[linear-gradient(180deg,#ffffff_0%,var(--surface-subtle)_100%)]',
  'shadow-[var(--shadow-soft)]',
)

export const surfacePanel = cn(
  'relative overflow-hidden',
  'border border-[color-mix(in_srgb,var(--border-soft)_82%,white_18%)]',
  'bg-[linear-gradient(180deg,rgba(255,255,255,0.98),var(--surface-subtle))]',
  'shadow-[var(--shadow-panel)]',
)

export const sectionCard = cn(
  'relative overflow-hidden rounded-[var(--radius-2xl)]',
  'border border-[color-mix(in_srgb,var(--border-soft)_86%,white_14%)]',
  'bg-[linear-gradient(180deg,#ffffff_0%,var(--surface-subtle)_100%)]',
  'shadow-[var(--shadow-soft)]',
)

/* ── Gradient overlay (replaces ::before on section-card / surface-card / surface-panel) ── */

export const gradientOverlay = cn(
  'absolute inset-0 pointer-events-none',
  'bg-[radial-gradient(circle_at_top_left,rgba(127,177,228,0.14),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.62),transparent_26%)]',
)
