import { forwardRef, type ComponentPropsWithoutRef, type Ref, type ReactNode } from 'react'
import { cn } from '#/lib/utils'
import { MetaRow } from './meta-row'

export type PageWidth = 'narrow' | 'default' | 'wide' | 'full'

export type PageProps = ComponentPropsWithoutRef<'main'> & {
  /** Maximum content width including gutters: narrow 62rem (settings, forms), default 75rem, wide 90rem (boards), full. */
  width?: PageWidth
  /**
   * main (default) is the page's one landmark and the skip-link target (id="main-content").
   * Use div where an ancestor already renders the main landmark.
   */
  as?: 'main' | 'div'
}

/**
 * The standard page frame: left-aligned, 40px gutters (16px on phones), 40px between its direct
 * children, room under the floating tab tray. Put one PageHeader first, then Sections or any block.
 */
export const Page = forwardRef<HTMLElement, PageProps>(function Page(
  { width = 'default', as = 'main', id, className, ...rest },
  ref,
) {
  const Tag = as as 'div'
  return (
    <Tag
      ref={ref as Ref<HTMLDivElement>}
      id={id ?? (as === 'main' ? 'main-content' : undefined)}
      tabIndex={as === 'main' ? -1 : undefined}
      className={cn('kit-page', className)}
      data-width={width}
      {...rest}
    />
  )
})

export type PageHeaderProps = Omit<ComponentPropsWithoutRef<'header'>, 'title'> & {
  /** The page title: display type. */
  title: ReactNode
  /** One line saying what the page is for, only when that teaches something. */
  lead?: ReactNode
  /** md: the 15px body line (default). lg: the 19px large lead, for a shell-less page whose title is the whole fold (sign in, reset password). */
  leadSize?: 'md' | 'lg'
  /** Quiet facts under the title, separated by dots: an array or several children. Missing items are skipped. */
  meta?: ReactNode
  /** Page actions, right-aligned; they wrap under the title on narrow screens. One primary Button at most. */
  actions?: ReactNode
  /** A back link or breadcrumb above the title. */
  back?: ReactNode
  /** A folder-tab row under the title; it sits on the edge of the panel that follows. */
  tabs?: ReactNode
  /** A tilted tool tile (or any small object) before the title block, vertically centred on it. Decorative: the title names the page. */
  mark?: ReactNode
  /** Level of the title heading. Default 1 (a page has one h1); 2 or 3 where a header sits inside another page, as in the gallery. */
  headingLevel?: 1 | 2 | 3
  /**
   * Edits the title in place (a rename field with its Cancel and Save buttons). When set, it takes the visible title's
   * place beside the heading, never inside it, so its controls take neither the display type nor the heading's
   * semantics; the heading stays, visually hidden, so the page keeps its h1. Leave it empty when not editing.
   */
  titleEditor?: ReactNode
}

/** Title row of a page. Replaces PageHero, PageHeader, .page-header, .admin-page-title, .state-page__title. */
export const PageHeader = forwardRef<HTMLElement, PageHeaderProps>(function PageHeader(
  { title, lead, leadSize = 'md', meta, actions, back, tabs, mark, headingLevel = 1, titleEditor, className, ...rest },
  ref,
) {
  const Heading = `h${headingLevel}` as 'h1'
  const text = (
    <div className="kit-page-header__text">
      <Heading className={titleEditor ? 'kit-sr-only' : 'kit-page-header__title'}>{title}</Heading>
      {titleEditor ? <div className="kit-page-header__title-editor">{titleEditor}</div> : null}
      {lead ? (
        <div className="kit-page-header__lead" data-size={leadSize === 'lg' ? 'lg' : undefined}>
          {lead}
        </div>
      ) : null}
      {meta ? <MetaRow className="kit-page-header__meta">{meta}</MetaRow> : null}
    </div>
  )
  return (
    <header ref={ref} className={cn('kit-page-header', className)} data-tabs={tabs ? 'true' : undefined} {...rest}>
      {back ? <div className="kit-page-header__back">{back}</div> : null}
      <div className="kit-page-header__main">
        {mark ? (
          <div className="kit-page-header__identity">
            <div className="kit-page-header__mark" aria-hidden="true">
              {mark}
            </div>
            {text}
          </div>
        ) : (
          text
        )}
        {actions ? <div className="kit-page-header__actions">{actions}</div> : null}
      </div>
      {tabs ? <div className="kit-page-header__tabs">{tabs}</div> : null}
    </header>
  )
})

export type LeadProps = ComponentPropsWithoutRef<'p'> & {
  /** xl: a report hero's verdict sentence (32px, a narrow measure). Default md (28px). */
  size?: 'md' | 'xl'
}

/** A lead sentence in the display face, semibold. The verdict line of a report, the opening line of a section. */
export const Lead = forwardRef<HTMLParagraphElement, LeadProps>(function Lead({ size = 'md', className, ...rest }, ref) {
  return <p ref={ref} className={cn('kit-lead', className)} data-size={size === 'xl' ? 'xl' : undefined} {...rest} />
})

export type SplitProps = Omit<ComponentPropsWithoutRef<'div'>, 'children'> & {
  /** The side column: summary, facts, actions. */
  rail: ReactNode
  /** Names the rail landmark ("Summary", "Details"). */
  railLabel: string
  /** The rail stays in view while the main column scrolls (side by side only). */
  stickyRail?: boolean
  /** When stacked (narrow), show the rail above the main column instead of below it. */
  railFirst?: boolean
  /**
   * Where the two columns go side by side. default: from 56rem. compact: from 52rem, for a main column that still reads
   * well at about 35rem (a tool form): at 1024 with the sidebar collapsed to its rail the content is 55.4rem wide.
   */
  breakpoint?: 'default' | 'compact'
  children: ReactNode
}

/**
 * Main column plus a ~280px rail. Side by side when the container is at least 56rem wide (52rem with
 * breakpoint="compact"; it asks its own width, not the viewport's, so it behaves with the sidebar open
 * or closed); otherwise the rail stacks under the main column.
 */
export const Split = forwardRef<HTMLDivElement, SplitProps>(function Split(
  { rail, railLabel, stickyRail = false, railFirst = false, breakpoint = 'default', className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn('kit-split', className)}
      data-sticky={stickyRail ? 'true' : undefined}
      data-rail-first={railFirst ? 'true' : undefined}
      data-breakpoint={breakpoint === 'compact' ? 'compact' : undefined}
      {...rest}
    >
      <div className="kit-split__layout">
        <div className="kit-split__main">{children}</div>
        <aside className="kit-split__rail" aria-label={railLabel}>
          {rail}
        </aside>
      </div>
    </div>
  )
})
