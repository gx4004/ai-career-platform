import { forwardRef, type ComponentPropsWithoutRef } from 'react'
import { cn } from '#/lib/utils'

export type FitThresholds = { good: number; fair: number }

export type FitStampProps = Omit<ComponentPropsWithoutRef<'span'>, 'children'> & {
  /** Fit as a percentage, or null when there is none. */
  value: number | null
  /** md 60 x 52, sm 52 x 48. */
  size?: 'md' | 'sm'
  /** At or above good: mint. At or above fair: lemon. Below: white. Default 80 / 65. */
  thresholds?: FitThresholds
}

const DEFAULT_THRESHOLDS: FitThresholds = { good: 80, fair: 65 }

/** The tone and level a fit percentage gets. There is no red: a weak fit is a plain white tile. */
export function fitLevel(value: number, thresholds: FitThresholds = DEFAULT_THRESHOLDS) {
  if (value >= thresholds.good) return { tone: 'mint', level: 'good' } as const
  if (value >= thresholds.fair) return { tone: 'lemon', level: 'fair' } as const
  return { tone: 'white', level: 'low' } as const
}

/** A job's fit as a stamped tile: "94%" on mint, lemon or white. */
export const FitStamp = forwardRef<HTMLSpanElement, FitStampProps>(function FitStamp(
  { value, size = 'md', thresholds, className, ...rest },
  ref,
) {
  const known = value !== null && Number.isFinite(value)
  const rounded = known ? Math.round(Math.min(100, Math.max(0, value))) : null
  const { tone, level } = rounded === null ? ({ tone: 'white', level: 'none' } as const) : fitLevel(rounded, thresholds)
  return (
    <span
      ref={ref}
      role="img"
      aria-label={rounded === null ? 'Fit not available' : `${rounded}% fit`}
      className={cn('kit-fit-stamp', className)}
      data-tone={tone}
      data-level={level}
      data-size={size}
      data-digits={rounded === null ? 1 : String(rounded).length}
      {...rest}
    >
      {rounded === null ? (
        <span aria-hidden="true">{'–'}</span>
      ) : (
        <span aria-hidden="true">
          {rounded}
          <small>%</small>
        </span>
      )}
    </span>
  )
})
