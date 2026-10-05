import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { cn } from '#/lib/utils'
import type { Tone } from './tone'

export type NumberDiscProps = Omit<ComponentPropsWithoutRef<'span'>, 'children'> & {
  /** The number, or any short node (a Check icon for a finished step). */
  n: ReactNode
  /** sm 28 | md 34 | lg 44 (the steps). Default md. */
  size?: 'sm' | 'md' | 'lg'
  /** Default white. Mint marks a finished step, lemon the current one. */
  tone?: Tone
  /** The step in progress: a dotted outer ring (data-current). Pair it with a lemon tone. */
  current?: boolean
}

/** A numbered disc: the sequence marker of a Fix-first sticker, a refinement row, a step. Decorative: put it in an <ol>. */
export const NumberDisc = forwardRef<HTMLSpanElement, NumberDiscProps>(function NumberDisc(
  { n, size = 'md', tone = 'white', current = false, className, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn('kit-number-disc', `kit-number-disc--${size}`, className)}
      data-tone={tone}
      data-current={current ? 'true' : undefined}
      aria-hidden="true"
      {...rest}
    >
      {n}
    </span>
  )
})
