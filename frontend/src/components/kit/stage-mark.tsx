import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { cn } from '#/lib/utils'
import { STAGE_TONE, STAGES, type Stage } from '#/components/applications/stages'
import { Badge } from './badge'

export type StageMarkVariant = 'count' | 'dot' | 'badge'

export type StageMarkProps = Omit<ComponentPropsWithoutRef<'span'>, 'children'> & {
  stage: Stage
  /** count: the 40px block of the pipeline | dot: a 12px disc | badge: a Badge in the stage colour. Default badge. */
  variant?: StageMarkVariant
  /** The number in the count variant. */
  count?: number
  /** badge: the text (default: the stage name). count and dot: visually hidden text for assistive tech. */
  label?: ReactNode
}

/**
 * A stage, in its colour: Saved lemon, Applied lilac, Interviewing tangerine, Offer mint, Closed stone.
 * The colour is never the only signal: the badge says the stage, and the count and dot sit next to its name.
 */
export const StageMark = forwardRef<HTMLSpanElement, StageMarkProps>(function StageMark(
  { stage, variant = 'badge', count, label, className, ...rest },
  ref,
) {
  const tone = STAGE_TONE[stage]
  if (variant === 'badge') {
    const text = label ?? STAGES.find((entry) => entry.id === stage)?.label ?? stage
    return (
      <Badge ref={ref} tone={tone} className={cn('kit-stage-mark', className)} data-stage={stage} data-variant="badge" {...rest}>
        {text}
      </Badge>
    )
  }
  const digits = Math.min(String(count ?? '').length, 4)
  return (
    <span
      ref={ref}
      className={cn('kit-stage-mark', className)}
      data-tone={tone}
      data-stage={stage}
      data-variant={variant}
      data-digits={variant === 'count' ? digits : undefined}
      {...rest}
    >
      {variant === 'count' ? <span className="kit-stage-mark__count">{count ?? 0}</span> : null}
      {label ? <span className="kit-sr-only">{label}</span> : null}
    </span>
  )
})
