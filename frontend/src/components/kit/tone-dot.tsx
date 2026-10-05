import { forwardRef, type ComponentPropsWithoutRef } from 'react'
import { cn } from '#/lib/utils'
import type { Tone } from './tone'

export type ToneDotProps = Omit<ComponentPropsWithoutRef<'span'>, 'children'> & {
  tone: Tone
  /** sm 10 | md 12. Default sm. */
  size?: 'sm' | 'md'
  /** Sits before a label: adds the gap after the dot. Default false. */
  lead?: boolean
}

/** A small outlined disc in a palette tone: the colour key of a filter option, a legend entry, a list marker. Decorative: the label beside it must still say what it is. */
export const ToneDot = forwardRef<HTMLSpanElement, ToneDotProps>(function ToneDot(
  { tone, size = 'sm', lead = false, className, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn('kit-tone-dot', className)}
      data-tone={tone}
      data-size={size === 'md' ? 'md' : undefined}
      data-lead={lead ? 'true' : undefined}
      aria-hidden="true"
      {...rest}
    />
  )
})
