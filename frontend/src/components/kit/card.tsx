import { forwardRef, type ComponentPropsWithoutRef, type HTMLAttributes, type Ref } from 'react'
import { cn } from '#/lib/utils'
import { TitleSlot } from './stretched-link'
import type { Tone } from './tone'

export type CardProps = HTMLAttributes<HTMLElement> & {
  /** The object is open or chosen: lemon fill and the larger hard shadow. */
  selected?: boolean
  /** Lemon-soft tint on hover (a tint, never a lift). Cards that contain a StretchedLink get this without asking. */
  interactive?: boolean
  /** li inside a list, article for a standalone object (default), div otherwise. */
  as?: 'article' | 'li' | 'div'
  /** Inner padding. Default md. */
  padding?: 'none' | 'sm' | 'md'
  /** Fill with the soft tint of a palette tone. Colour by meaning; most cards stay white. */
  tone?: Tone
}

/**
 * A surface for a real object: a job, an application. White, 2px ink outline, 16px radius, the small
 * hard shadow, no lift. Sections, lists and tables do not go in cards: use Section/List/Table.
 */
export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  { selected = false, interactive = false, as = 'article', padding = 'md', tone, className, ...rest },
  ref,
) {
  const Tag = as as 'div'
  return (
    <Tag
      ref={ref as Ref<HTMLDivElement>}
      className={cn('kit-card', className)}
      data-padding={padding}
      data-tone={tone}
      data-selected={selected ? 'true' : undefined}
      data-interactive={interactive ? 'true' : undefined}
      {...rest}
    />
  )
})

/** Title line of a card: CardTitle first, then optional CardActions, on one row. */
export const CardHeader = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(function CardHeader(
  { className, ...rest },
  ref,
) {
  return <div ref={ref} className={cn('kit-card__header', className)} {...rest} />
})

export type CardTitleProps = ComponentPropsWithoutRef<'div'> & {
  headingLevel?: 2 | 3 | 4 | 5 | 6
  /** The child (router Link, <a>, button) is the title AND the link for the whole card. */
  asChild?: boolean
}

/** Card title. With `asChild` it is also the card's whole-card link. */
export const CardTitle = forwardRef<HTMLElement, CardTitleProps>(function CardTitle(props, ref) {
  return <TitleSlot ref={ref} baseClass="kit-card__title" headingClass="kit-card__heading" {...props} />
})

export type CardActionsProps = ComponentPropsWithoutRef<'div'> & {
  /** Hide until hover/focus on fine pointers (always visible on touch and with focus inside). Default true. */
  reveal?: boolean
  /** inline (default): beside the title, taking its share of the row. overlay: floats over the card's top end corner on a fine
   *  pointer, so a narrow card's title keeps the whole line; on touch it falls back to inline, where it is always visible. */
  placement?: 'inline' | 'overlay'
}

/** Buttons and menus that sit above the card's whole-card link, at the card's end edge. */
export const CardActions = forwardRef<HTMLDivElement, CardActionsProps>(function CardActions(
  { reveal = true, placement = 'inline', className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn('kit-card__actions', className)}
      data-reveal={reveal ? 'true' : undefined}
      data-placement={placement === 'overlay' ? 'overlay' : undefined}
      {...rest}
    />
  )
})
