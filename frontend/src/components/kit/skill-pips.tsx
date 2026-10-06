import { forwardRef, type ComponentPropsWithoutRef } from 'react'
import { cn } from '#/lib/utils'
import { ScoreBar } from './score-bar'

export type SkillPipsProps = Omit<ComponentPropsWithoutRef<'span'>, 'children'> & {
  /** Skills of the job that the resume covers. */
  matched: number
  /** Skills the job asks for. */
  total: number
  /** More skills than this fall back to a small bar. Default 10. */
  max?: number
}

/** One pip per skill, mint when the resume has it: "8 of 8 skills" at a glance. */
export const SkillPips = forwardRef<HTMLSpanElement, SkillPipsProps>(function SkillPips(
  { matched, total, max = 10, className, ...rest },
  ref,
) {
  const safeTotal = Math.max(0, Math.floor(total))
  const safeMatched = Math.min(safeTotal, Math.max(0, Math.floor(matched)))
  if (safeTotal === 0) return null
  const name = `${safeMatched} of ${safeTotal} skills`
  if (safeTotal > max) {
    return (
      <span ref={ref} className={cn('kit-skill-pips', className)} data-mode="bar" {...rest}>
        {/* No number at the end: the row already says "6 of 11 skills"; the bar only replaces the pips. */}
        <ScoreBar aria-label={name} value={safeMatched} max={safeTotal} valueLabel={name} size="sm" />
      </span>
    )
  }
  return (
    <span ref={ref} role="img" aria-label={name} className={cn('kit-skill-pips', className)} data-mode="pips" {...rest}>
      {Array.from({ length: safeTotal }, (_, index) => (
        <span key={index} className="kit-skill-pips__pip" data-on={index < safeMatched ? 'true' : undefined} />
      ))}
    </span>
  )
})
