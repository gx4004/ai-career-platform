import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { cn } from '#/lib/utils'

export type StatTone = 'neutral' | 'success' | 'warning' | 'danger'

export type StatProps = Omit<ComponentPropsWithoutRef<'dl'>, 'children'> & {
  label: ReactNode
  /** The number (or short value). Serif, tabular. */
  value: ReactNode
  /** Small suffix after the value: "%", "/100", "days". */
  unit?: ReactNode
  /** A change next to the value ("+4 since last run"). Write the sign yourself: it is the non-colour cue. */
  delta?: ReactNode
  /** Colours the delta only; the number stays ink. */
  tone?: StatTone
  /** lg: display size (32). md: title size (20). Default lg. */
  size?: 'md' | 'lg'
}

/**
 * A number with its label. The label comes first in the DOM (assistive tech reads "Applications, 7")
 * and is shown under the number. Replaces .result-score, .workspace-hero__stat, .admin-stat-card numbers.
 */
export const Stat = forwardRef<HTMLDListElement, StatProps>(function Stat(
  { label, value, unit, delta, tone = 'neutral', size = 'lg', className, ...rest },
  ref,
) {
  return (
    <dl ref={ref} className={cn('kit-stat', className)} data-size={size} {...rest}>
      <dt className="kit-stat__label">{label}</dt>
      <dd className="kit-stat__value">
        <span className="kit-stat__number">{value}</span>
        {unit ? <span className="kit-stat__unit">{unit}</span> : null}
        {delta ? (
          <span className="kit-stat__delta" data-tone={tone}>
            {delta}
          </span>
        ) : null}
      </dd>
    </dl>
  )
})
