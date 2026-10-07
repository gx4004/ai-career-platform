import { forwardRef, type ComponentPropsWithoutRef, type HTMLAttributes, type ReactNode, type Ref } from 'react'
import { cn } from '#/lib/utils'
import { TitleSlot } from './stretched-link'

export type RowDensity = 'compact' | 'comfortable'
export type RowOverflow = 'wrap' | 'truncate' | 'clamp'

export type ListProps = ComponentPropsWithoutRef<'ul'> & {
  /** Render an <ol> with a number in front of every row ("Fix first"). */
  numbered?: boolean
  /**
   * Rules above the first row and below the last, for an unframed list that stands alone. "end": the rule below the
   * last row only, for a list right under its own heading: the first row starts at the list's top and a Section
   * heading sits on it with a field label's gap, the way a label sits on its control. A no-op while framed.
   */
  boxed?: boolean | 'end'
  /**
   * Rows start at the container's content edge (no inline padding), in line with the heading, field or sheet title
   * above them. For an unframed list in a Panel, Sheet, Dialog or rail. A no-op while framed.
   */
  flush?: boolean
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
  { numbered = false, boxed = false, flush = false, framed = true, className, ...rest },
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
      data-boxed={boxed === 'end' ? 'end' : boxed ? 'true' : undefined}
      data-flush={flush ? 'true' : undefined}
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
  /**
   * How long titles and subtitles behave: wrap onto more lines (default), cut to one line with an ellipsis (truncate), or
   * clamp: the title wraps to two lines at most and the subtitle keeps one line, for a narrow rail where the subject matters.
   */
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

export type ListHeadingProps = ComponentPropsWithoutRef<'li'> & {
  /** The heading level of the group title. Default 3 (a List under a page or Section h2). */
  headingLevel?: 2 | 3 | 4 | 5 | 6
}

/**
 * A group heading inside a List ("Today", "Yesterday"): a stone-soft strip with the display title (20/800) and a
 * 2px --line rule under it, so the group reads as a divider, not as a row. Not a Row: it has no hover, no selection
 * and no number in a numbered List.
 */
export const ListHeading = forwardRef<HTMLLIElement, ListHeadingProps>(function ListHeading(
  { headingLevel = 3, className, children, ...rest },
  ref,
) {
  const Heading = `h${headingLevel}` as 'h3'
  return (
    <li ref={ref} className={cn('kit-list-heading', className)} {...rest}>
      <Heading className="kit-list-heading__title" dir="auto">
        {children}
      </Heading>
    </li>
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
  /**
   * bold (default, 700): a name (a job, a run, a fix). semibold (600): a statement that is the row's whole
   * point (a strength). regular (400): a full sentence or a quote (a note, a tip), which set bold reads heavy
   * and flattens the hierarchy against the real titles.
   */
  weight?: 'bold' | 'semibold' | 'regular'
  /**
   * A short fact kept on the title's own line, at its end (a score pill in a narrow rail). As RowMeta it took a side
   * column the height of the whole row, so every line under the title (a two-line headline) lost its width too; here
   * only the title shares its line. Hide it from assistive tech when the link's description already says it.
   */
  aside?: ReactNode
}

/** Row title. With `asChild` it is also the row's whole-row link. */
export const RowTitle = forwardRef<HTMLElement, RowTitleProps>(function RowTitle({ size = 'md', weight = 'bold', aside, ...props }, ref) {
  const title = (
    <TitleSlot
      ref={ref}
      baseClass="kit-row__title"
      headingClass="kit-row__heading"
      data-size={size === 'lg' ? 'lg' : undefined}
      data-weight={weight === 'bold' ? undefined : weight}
      {...props}
    />
  )
  if (aside == null) return title
  return (
    <div className="kit-row__title-line">
      {title}
      <span className="kit-row__title-aside">{aside}</span>
    </div>
  )
})

export type RowSubtitleProps = ComponentPropsWithoutRef<'div'> & {
  /** md (default): the 13px meta line. lg: 15px body text, the sentence under a display title (What next). */
  size?: 'md' | 'lg'
  /**
   * 2: at most two lines, then an ellipsis, whatever the row's overflow. A clamped or truncated row keeps its
   * subtitles to one line; a sentence beside a meta pill in a narrow rail (a run's headline) needs two to say anything.
   */
  lines?: 2
}

/** Second line under the title: plain text, or a MetaRow. */
export const RowSubtitle = forwardRef<HTMLDivElement, RowSubtitleProps>(function RowSubtitle(
  { size = 'md', lines, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      dir="auto"
      className={cn('kit-row__subtitle', className)}
      data-size={size === 'lg' ? 'lg' : undefined}
      data-lines={lines === 2 ? '2' : undefined}
      {...rest}
    />
  )
})

export type RowMetaProps = ComponentPropsWithoutRef<'div'> & {
  /**
   * end (default): the meta keeps its slot at the end of the row (a lone Badge or Count stays beside the text at
   * every width). below: on a narrow List (a phone) it drops under the row's text instead of keeping a side column,
   * so a long title gets the full width (a status Badge after a question). Wide lists keep it at the end.
   */
  placement?: 'end' | 'below'
}

/** Trailing facts: a date, a score, a status. Tabular, quiet, right-aligned. */
export const RowMeta = forwardRef<HTMLDivElement, RowMetaProps>(function RowMeta(
  { placement = 'end', className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn('kit-row__meta', className)}
      data-placement={placement === 'below' ? 'below' : undefined}
      {...rest}
    />
  )
})

export type RowActionsProps = ComponentPropsWithoutRef<'div'> & {
  /**
   * Secondary actions (rename, favourite, delete, the overflow menu) appear when the pointer is on the
   * row, and are always there on touch devices and while focus is inside the row. Pass reveal={false}
   * for the row's one primary action (Add), which must never depend on hover.
   */
  reveal?: boolean
  /**
   * inline (default): the actions keep their slot at the end of the row. overlay: on a fine pointer the
   * revealed actions float over the row's end edge instead, so a narrow list (a 280px rail) gives the
   * title the full width at rest. Touch devices keep them inline and visible. Only with reveal.
   * below: on a narrow List (a phone) the actions drop under the row's text instead of keeping a side
   * column, so a long title gets the full width (a labelled button such as "Add to profile"). Wide
   * lists keep them inline.
   */
  placement?: 'inline' | 'overlay' | 'below'
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
  { reveal = true, placement = 'inline', collapse, className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn('kit-row__actions', className)}
      data-reveal={reveal ? 'true' : undefined}
      data-placement={placement === 'overlay' && reveal ? 'overlay' : placement === 'below' ? 'below' : undefined}
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
