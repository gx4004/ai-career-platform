import { forwardRef, type ComponentPropsWithoutRef, type HTMLAttributes, type ReactNode, type Ref } from 'react'
import { cn } from '#/lib/utils'
import { TitleSlot } from './stretched-link'

export type RowDensity = 'compact' | 'comfortable'
export type RowOverflow = 'wrap' | 'truncate'

export type ListProps = ComponentPropsWithoutRef<'ul'> & {
  /** Render an <ol> with a number in front of every row ("Fix first"). */
  numbered?: boolean
  /** Rules above the first row and below the last, for an unframed list that stands alone. A no-op while framed. */
  boxed?: boolean
  /**
   * Draw the list as an object: white, 2px ink outline, 24px radius, rows flush inside. Default true.
   * Pass false inside a Panel, Dialog, Sheet, rail or Table cell, which already provide the frame.
   */
  framed?: boolean
}

/**
 * A vertical list of Rows, framed by default, the rows separated by 2px dividers. Name it with
 * aria-label (or aria-labelledby) unless a Section heading already does.
 */
export const List = forwardRef<HTMLUListElement, ListProps>(function List(
  { numbered = false, boxed = false, framed = true, className, ...rest },
  ref,
) {
  const Tag = (numbered ? 'ol' : 'ul') as 'ul'
  // role="list" keeps the list semantics in Safari, which drops them when list-style is none.
  return (
    <Tag
      ref={ref}
      role="list"
      className={cn('kit-list', className)}
      data-numbered={numbered ? 'true' : undefined}
      data-boxed={boxed ? 'true' : undefined}
      data-framed={framed ? 'true' : undefined}
      {...rest}
    />
  )
})

export type RowProps = HTMLAttributes<HTMLElement> & {
  /** compact 40px, comfortable 44px minimum (16px/20px padding, a title plus a subtitle fits in it). Default comfortable. */
  density?: RowDensity
  /** The row is open, current or chosen: lemon-soft tint, with a 4px ink bar on its start edge. */
  selected?: boolean
  /** Lemon-soft tint on hover. Rows that contain a StretchedLink get this without asking. */
  interactive?: boolean
  /** How long titles and subtitles behave: wrap onto more lines (default) or cut with an ellipsis. */
  overflow?: RowOverflow
  /** li inside a List (default), or div/article when the row stands alone. */
  as?: 'li' | 'div' | 'article'
}

/**
 * One row: RowLeading, RowBody (RowTitle + RowSubtitle), RowMeta, RowActions, in that order.
 * Every slot is optional. In a List narrower than 32rem a row with actions keeps them on its first line and
 * moves its meta under the text; other rows wrap their trailing slots under the text when the text runs out of room.
 */
export const Row = forwardRef<HTMLElement, RowProps>(function Row(
  { density = 'comfortable', selected = false, interactive = false, overflow = 'wrap', as = 'li', className, ...rest },
  ref,
) {
  const Tag = as as 'div'
  return (
    <Tag
      ref={ref as Ref<HTMLDivElement>}
      className={cn('kit-row', className)}
      data-density={density}
      data-overflow={overflow}
      data-selected={selected ? 'true' : undefined}
      data-interactive={interactive ? 'true' : undefined}
      {...rest}
    />
  )
})

/** Icon, avatar, checkbox, FitStamp, ToolTile or StageMark in front of the text. */
export const RowLeading = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(function RowLeading(
  { className, ...rest },
  ref,
) {
  return <div ref={ref} className={cn('kit-row__leading', className)} {...rest} />
})

/** The text column: RowTitle and RowSubtitle. Takes the room the other slots leave. */
export const RowBody = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(function RowBody(
  { className, ...rest },
  ref,
) {
  return <div ref={ref} className={cn('kit-row__body', className)} {...rest} />
})

export type RowTitleProps = ComponentPropsWithoutRef<'div'> & {
  /** Make the title a heading of this level (keeps the page outline right in a list of jobs). */
  headingLevel?: 2 | 3 | 4 | 5 | 6
  /** The child (a router Link, an <a>, a button) is the title AND the link for the whole row. */
  asChild?: boolean
  /** lg: 17px, for a comfortable match row. Default md (15px). */
  size?: 'md' | 'lg'
}

/** Row title. With `asChild` it is also the row's whole-row link. */
export const RowTitle = forwardRef<HTMLElement, RowTitleProps>(function RowTitle({ size = 'md', ...props }, ref) {
  return <TitleSlot ref={ref} baseClass="kit-row__title" headingClass="kit-row__heading" data-size={size === 'lg' ? 'lg' : undefined} {...props} />
})

/** Second line under the title: plain text, or a MetaRow. */
export const RowSubtitle = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(function RowSubtitle(
  { className, ...rest },
  ref,
) {
  return <div ref={ref} dir="auto" className={cn('kit-row__subtitle', className)} {...rest} />
})

/** Trailing facts: a date, a score, a status. Tabular, quiet, right-aligned. */
export const RowMeta = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(function RowMeta(
  { className, ...rest },
  ref,
) {
  return <div ref={ref} className={cn('kit-row__meta', className)} {...rest} />
})

export type RowActionsProps = ComponentPropsWithoutRef<'div'> & {
  /**
   * Secondary actions (rename, favourite, delete, the overflow menu) appear when the pointer is on the
   * row, and are always there on touch devices and while focus is inside the row. Pass reveal={false}
   * for the row's one primary action (Add), which must never depend on hover.
   */
  reveal?: boolean
  /**
   * An overflow menu (a DropdownMenu whose trigger is a ghost icon Button) shown INSTEAD of the children
   * when the List is narrower than 32rem (phones). Use it when a row has three or more secondary actions
   * (History: star, rename, delete): it keeps the row at 44px and the title at full width. Both copies
   * are in the DOM and the unused one is display:none, so do not put ids or test ids on either.
   */
  collapse?: ReactNode
}

/**
 * Action buttons at the end of the row. They sit above the whole-row link. On a narrow List they stay
 * at the end of the row's first line (the row's meta moves under its text), whatever the row holds.
 */
export const RowActions = forwardRef<HTMLDivElement, RowActionsProps>(function RowActions(
  { reveal = true, collapse, className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn('kit-row__actions', className)}
      data-reveal={reveal ? 'true' : undefined}
      data-collapsible={collapse ? 'true' : undefined}
      {...rest}
    >
      {collapse ? <span className="kit-row__actions-inline">{children}</span> : children}
      {collapse ? <span className="kit-row__actions-collapsed">{collapse}</span> : null}
    </div>
  )
})

/**
 * Hides its content until the pointer is on the row (fine pointers only; always visible on touch and
 * while focus is inside the row). Use it inside a RowActions group that also holds a primary action
 * that must stay visible: <RowActions reveal={false}><Button>Add</Button><RowReveal><Menu/></RowReveal></RowActions>.
 */
export const RowReveal = forwardRef<HTMLSpanElement, ComponentPropsWithoutRef<'span'>>(function RowReveal(
  { className, ...rest },
  ref,
) {
  return <span ref={ref} className={cn('kit-row__reveal', className)} {...rest} />
})
