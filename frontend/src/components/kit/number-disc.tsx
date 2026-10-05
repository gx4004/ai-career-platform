import { forwardRef, type ComponentPropsWithoutRef } from 'react'
import { cn } from '#/lib/utils'
import type { Tone } from './tone'

export type NumberDiscProps = Omit<ComponentPropsWithoutRef<'span'>, 'children'> & {
  n: number | string
  /** sm 28 | md 34 | lg 44 (the steps). Default md. */
  size?: 'sm' | 'md' | 'lg'
  /** Default white. Mint marks a finished step, lemon the current one. */
  tone?: Tone
}

/** A numbered disc: the sequence marker of a Fix-first sticker, a refinement row, a step. Decorative: put it in an <ol>. */
export const NumberDisc = forwardRef<HTMLSpanElement, NumberDiscProps>(function NumberDisc(
  { n, size = 'md', tone = 'white', className, ...rest },
  ref,
) {
  return (
    <span ref={ref} className={cn('kit-number-disc', `kit-number-disc--${size}`, className)} data-tone={tone} aria-hidden="true" {...rest}>
      {n}
    </span>
  )
})
