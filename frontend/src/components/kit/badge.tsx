import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { cn } from '#/lib/utils'

/** The palette tones (colour by meaning: stage, severity, tool) join the semantic ones. */
export type PaletteTone = 'tangerine' | 'mint' | 'lilac' | 'lemon' | 'rose' | 'aqua' | 'stone' | 'white'
export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | PaletteTone
export type BadgeSize = 'sm' | 'md'

export type BadgeProps = ComponentPropsWithoutRef<'span'> & {
  tone?: BadgeTone
  size?: BadgeSize
  /** Leading status dot. Decorative: the label must still say what the status is. */
  dot?: boolean
  /** Leading icon (a 14px lucide icon: the Deadline clock). Decorative; replaces the dot when both are given. */
  icon?: ReactNode
  /** A score beside a run ("89/100", "75%"): the number in the display face, black weight, tabular figures. */
  score?: boolean
}

/** The one status chip: replaces every per-page badge, pill and tag. */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { tone = 'neutral', size = 'md', dot = false, icon, score = false, className, children, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn('kit-badge', `kit-badge--${size}`, className)}
      data-tone={tone}
      data-score={score ? 'true' : undefined}
      {...rest}
    >
      {icon ? (
        <span className="kit-badge__icon" aria-hidden="true">
          {icon}
        </span>
      ) : dot ? (
        <span className="kit-badge__dot" aria-hidden="true" />
      ) : null}
      <span className="kit-badge__label">{children}</span>
    </span>
  )
})

export type CountProps = Omit<ComponentPropsWithoutRef<'span'>, 'children'> & {
  value: number | string
  /** Cap numeric values: max={99} renders 100 as "99+". */
  max?: number
  /** muted and accent colour the text; a palette tone fills the pill variant. */
  tone?: 'muted' | 'accent' | PaletteTone
  /** text (default) is a bare tabular number; pill draws the outlined circle beside a heading. */
  variant?: 'text' | 'pill'
}

/** Tabular numeric count: bare beside a tab or button label, `variant="pill"` after a heading. */
export const Count = forwardRef<HTMLSpanElement, CountProps>(function Count(
  { value, max, tone = 'muted', variant = 'text', className, ...rest },
  ref,
) {
  const text = typeof value === 'number' && max !== undefined && value > max ? `${max}+` : String(value)
  return (
    <span ref={ref} className={cn('kit-count', className)} data-tone={tone} data-variant={variant} {...rest}>
      {text}
    </span>
  )
})

export type KbdProps = ComponentPropsWithoutRef<'kbd'>

/** Keyboard shortcut hint, e.g. <Kbd>⌘K</Kbd>. */
export const Kbd = forwardRef<HTMLElement, KbdProps>(function Kbd({ className, ...rest }, ref) {
  return <kbd ref={ref} className={cn('kit-kbd', className)} {...rest} />
})
