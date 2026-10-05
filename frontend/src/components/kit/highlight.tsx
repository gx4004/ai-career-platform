import { forwardRef, type ComponentPropsWithoutRef } from 'react'
import { cn } from '#/lib/utils'

/** A lemon marker stroke under inline text: two terms in a sentence, never more. */
export const Highlight = forwardRef<HTMLElement, ComponentPropsWithoutRef<'mark'>>(function Highlight(
  { className, ...rest },
  ref,
) {
  return <mark ref={ref} className={cn('kit-highlight', className)} {...rest} />
})
