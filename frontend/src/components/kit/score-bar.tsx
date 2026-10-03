import { forwardRef, useId, type ComponentPropsWithoutRef, type CSSProperties, type ReactNode } from 'react'
import { cn } from '#/lib/utils'

export type ScoreTone = 'success' | 'warning' | 'danger' | 'accent' | 'neutral'

export type ScoreThresholds = {
  /** At or above this share of max the bar is success. Default 70. */
  good: number
  /** At or above this share (and below good) it is warning; below it, danger. Default 41. */
  fair: number
}

const DEFAULT_THRESHOLDS: ScoreThresholds = { good: 70, fair: 41 }

/** The tone a score gets from the thresholds; value is a percentage of max. */
export function scoreTone(
  percent: number,
  thresholds: ScoreThresholds = DEFAULT_THRESHOLDS,
  lowTone: 'danger' | 'neutral' = 'danger',
): ScoreTone {
  if (percent >= thresholds.good) return 'success'
  if (percent >= thresholds.fair) return 'warning'
  return lowTone
}

type Named =
  | { label: ReactNode; 'aria-label'?: string; 'aria-labelledby'?: undefined }
  | { label?: undefined; 'aria-label': string; 'aria-labelledby'?: undefined }
  | { label?: undefined; 'aria-label'?: undefined; 'aria-labelledby': string }

export type ScoreBarProps = Omit<ComponentPropsWithoutRef<'div'>, 'children' | 'aria-label' | 'aria-labelledby'> &
  Named & {
    value: number
    /** Default 100. */
    max?: number
    /** The number shown at the end. Default: the rounded value. Pass "72%" or "3 of 4" to say more. */
    valueLabel?: ReactNode
    /** auto (default) picks success / warning / danger from the thresholds; the others force a tone. */
    tone?: ScoreTone | 'auto'
    thresholds?: ScoreThresholds
    /** What a low score looks like under auto: danger (default) or a quiet neutral. */
    lowTone?: 'danger' | 'neutral'
    /** stacked: label and value above the bar. inline: label, bar and value on one row (breakdown tables). */
    layout?: 'stacked' | 'inline'
    size?: 'sm' | 'md'
    /** Inline without a label: a fixed width for the number column (e.g. "3.5rem"), so bars start at one x down a list. */
    valueWidth?: string
  }

/**
 * A thin bar with its label and a right-aligned tabular value. The number is always shown, so the
 * bar and its tone are never the only way to read the score. The track is a `meter`.
 */
export const ScoreBar = forwardRef<HTMLDivElement, ScoreBarProps>(function ScoreBar(
  {
    value,
    max = 100,
    label,
    valueLabel,
    tone = 'auto',
    thresholds,
    lowTone = 'danger',
    layout = 'stacked',
    size = 'md',
    valueWidth,
    className,
    style,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    ...rest
  },
  ref,
) {
  const labelId = useId()
  const safeMax = max > 0 ? max : 100
  const clamped = Math.min(Math.max(value, 0), safeMax)
  const percent = (clamped / safeMax) * 100
  const resolved = tone === 'auto' ? scoreTone(percent, thresholds, lowTone) : tone
  const shown = valueLabel ?? String(Math.round(value))
  return (
    <div
      ref={ref}
      className={cn('kit-score', className)}
      data-layout={layout}
      data-size={size}
      data-labelled={label !== undefined ? 'true' : undefined}
      {...rest}
      style={valueWidth ? ({ ...style, '--kit-score-value-w': valueWidth } as CSSProperties) : style}
    >
      {label !== undefined ? (
        <span id={labelId} className="kit-score__label">
          {label}
        </span>
      ) : null}
      <span
        className="kit-score__track"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={clamped}
        aria-valuetext={typeof shown === 'string' || typeof shown === 'number' ? String(shown) : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy ?? (label !== undefined ? labelId : undefined)}
      >
        <span className="kit-score__fill" data-tone={resolved} style={{ inlineSize: `${percent}%` }} />
      </span>
      <span className="kit-score__value" aria-hidden="true">
        {shown}
      </span>
    </div>
  )
})
