import { createElement, forwardRef, type ComponentPropsWithoutRef, type ReactNode, type Ref } from 'react'
import { Slot } from 'radix-ui'
import { cn } from '#/lib/utils'

export type StretchedLinkProps = ComponentPropsWithoutRef<'a'> & {
  /** Render the single child (a router Link, a button) instead of an <a>. */
  asChild?: boolean
}

/**
 * A link whose hit area is the nearest positioned ancestor (a Row, a Card, a table row), drawn
 * with a pseudo-element. The surface becomes clickable without nesting other controls inside an
 * anchor: buttons and menus beside it sit above the overlay (RowActions, CardActions do that).
 * Its focus ring is drawn around the whole surface.
 */
export const StretchedLink = forwardRef<HTMLAnchorElement, StretchedLinkProps>(function StretchedLink(
  { asChild = false, className, ...rest },
  ref,
) {
  const Comp = asChild ? Slot.Root : 'a'
  return <Comp ref={ref} className={cn('kit-stretched', className)} {...rest} />
})

type HeadingLevel = 2 | 3 | 4 | 5 | 6

/**
 * Shared by RowTitle and CardTitle: an optional heading element around either plain text or a
 * stretched link/button (asChild). The heading carries no styling of its own. The ref points at the
 * title element itself (the link or button with asChild, otherwise the text element), not the heading wrapper.
 */
export const TitleSlot = forwardRef<
  HTMLElement,
  ComponentPropsWithoutRef<'div'> & {
    baseClass: string
    /** Class for the heading element when `headingLevel` wraps a link. */
    headingClass: string
    headingLevel?: HeadingLevel
    asChild?: boolean
    children?: ReactNode
  }
>(function TitleSlot({ baseClass, headingClass, headingLevel, asChild, className, children, ...rest }, ref) {
  const heading = headingLevel ? (`h${headingLevel}` as const) : null
  if (asChild) {
    const link = (
      <Slot.Root ref={ref as Ref<HTMLElement>} dir="auto" className={cn(baseClass, 'kit-stretched', className)} {...rest}>
        {children}
      </Slot.Root>
    )
    return heading ? createElement(heading, { className: headingClass }, link) : link
  }
  return createElement(
    heading ?? 'div',
    { ref, dir: 'auto', className: cn(baseClass, heading && headingClass, className), ...rest },
    children,
  )
})
