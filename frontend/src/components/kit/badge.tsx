import { forwardRef, type ComponentPropsWithoutRef } from 'react'
import { cn } from '#/lib/utils'

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'
export type BadgeSize = 'sm' | 'md'

export type BadgeProps = ComponentPropsWithoutRef<'span'> & {
  tone?: BadgeTone
  size?: BadgeSize
  /** Leading status dot. Decorative: the label must still say what the status is. */
  dot?: boolean
}

/** The one status chip: replaces every per-page badge, pill and tag. */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { tone = 'neutral', size = 'md', dot = false, className, children, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn('kit-badge', `kit-badge--${size}`, className)}
      data-tone={tone}
      {...rest}
    >
      {dot ? <span className="kit-badge__dot" aria-hidden="true" /> : null}
      <span className="kit-badge__label">{children}</span>
    </span>
  )
})

export type CountProps = Omit<ComponentPropsWithoutRef<'span'>, 'children'> & {
  value: number | string
  /** Cap numeric values: max={99} renders 100 as "99+". */
  max?: number
  tone?: 'muted' | 'accent'
}

/** Tabular numeric count, no pill: sits next to a heading, tab or button label. */
export const Count = forwardRef<HTMLSpanElement, CountProps>(function Count(
  { value, max, tone = 'muted', className, ...rest },
  ref,
) {
  const text = typeof value === 'number' && max !== undefined && value > max ? `${max}+` : String(value)
  return (
    <span ref={ref} className={cn('kit-count', className)} data-tone={tone} {...rest}>
      {text}
    </span>
  )
})

export type KbdProps = ComponentPropsWithoutRef<'kbd'>

/** Keyboard shortcut hint, e.g. <Kbd>⌘K</Kbd>. */
export const Kbd = forwardRef<HTMLElement, KbdProps>(function Kbd({ className, ...rest }, ref) {
  return <kbd ref={ref} className={cn('kit-kbd', className)} {...rest} />
})
