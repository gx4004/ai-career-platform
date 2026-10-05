import { forwardRef, type ComponentPropsWithoutRef, type CSSProperties } from 'react'
import { cn } from '#/lib/utils'
import type { Tone } from './tone'

export type RoundStampProps = Omit<ComponentPropsWithoutRef<'span'>, 'children' | 'aria-label'> & {
  value: number | string
  /** Printed after the value, e.g. "%". */
  unit?: string
  /** Default: mint for a value above 0, stone for 0 or text (not enough data). */
  tone?: Tone
  /** Degrees. Default 8. */
  tilt?: number
  /** Diameter in px. Default 84. */
  size?: number
  /** What it says, for assistive tech: "Reply rate 50%". */
  label: string
}

/** A round rubber stamp with a dashed inner ring: the reply rate. */
export const RoundStamp = forwardRef<HTMLSpanElement, RoundStampProps>(function RoundStamp(
  { value, unit, tone, tilt = 8, size = 84, label, className, style, ...rest },
  ref,
) {
  const resolved: Tone = tone ?? (typeof value === 'number' && value > 0 ? 'mint' : 'stone')
  return (
    <span
      ref={ref}
      role="img"
      aria-label={label}
      className={cn('kit-round-stamp', className)}
      data-tone={resolved}
      style={{ ...style, '--kit-stamp-size': `${size}px`, '--kit-tilt': `${tilt}deg` } as CSSProperties}
      {...rest}
    >
      <span className="kit-round-stamp__value" aria-hidden="true">
        {value}
        {unit}
      </span>
    </span>
  )
})
