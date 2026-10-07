import { Children, cloneElement, Fragment, forwardRef, isValidElement, useEffect, useLayoutEffect, useRef, useState, type ComponentPropsWithoutRef, type ReactElement, type ReactNode, type RefObject } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { cn } from '#/lib/utils'
import { Button } from './button'
import { Count } from './badge'
import { Field } from './field'
import { useMergedRef } from './utils'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './sheet'

type LabelledProps = { 'aria-label'?: unknown; label?: unknown; leading?: unknown }

/**
 * Inside the phone sheet the controls stack full width and there is no row context, so a bare
 * select reads as "Northwind Labs" with no hint of what it filters. Controls that are named only
 * by an aria-label (Select, Input) get that name as a visible Field label; controls that carry
 * their own text (Checkbox/Switch `label`, Select `leading`) are left alone.
 */
function withSheetLabels(nodes: ReactNode): ReactNode {
  return Children.map(nodes, (node) => {
    if (!isValidElement(node)) return node
    if (node.type === Fragment) {
      return <Fragment>{withSheetLabels((node.props as { children?: ReactNode }).children)}</Fragment>
    }
    const props = (node as ReactElement<LabelledProps>).props
    const name = props['aria-label']
    if (typeof name !== 'string' || props.label || props.leading) return node
    return <Field label={name}>{cloneElement(node as ReactElement)}</Field>
  })
}

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/**
 * Clear filters sits 4px further from the filters than the toolbar gap, to clear a filter button's hard shadow. When
 * the row wraps it onto a line of its own, that margin would start it 4px right of the search field above, so it is
 * marked data-line-start (CSS moves the margin to its end: same width, so the wrap never flips back and forth).
 */
function markLineStart(link: HTMLElement | null) {
  if (!link) return
  const own = link.getBoundingClientRect()
  if (own.width === 0 && own.height === 0) return // not laid out (hidden on a phone, or jsdom)
  // The nearest laid-out control before it (the phone-only Filters button sits between them, hidden).
  let before: DOMRect | null = null
  for (let node = link.previousElementSibling; node && !before; node = node.previousElementSibling) {
    const rect = node.getBoundingClientRect()
    if (rect.width > 0 || rect.height > 0) before = rect
  }
  link.toggleAttribute('data-line-start', !before || before.bottom <= own.top + 0.5)
}

function useClearLineStart(toolbar: RefObject<HTMLDivElement | null>, clear: RefObject<HTMLButtonElement | null>) {
  // Every render may add or remove filters before it; the toolbar's width changes with the window.
  useIsoLayoutEffect(() => markLineStart(clear.current))
  useEffect(() => {
    const element = toolbar.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => markLineStart(clear.current))
    observer.observe(element)
    return () => observer.disconnect()
  }, [toolbar, clear])
}

export type ToolbarProps = Omit<ComponentPropsWithoutRef<'div'>, 'children'> & {
  /** The search field: a kit Input type="search" with an aria-label. Always stays in the row. */
  search?: ReactNode
  /** Filter controls (Select, Checkbox framed, Segmented). Inline on desktop; inside the Filters sheet on phones. */
  filters?: ReactNode
  /** The sort control (Select leading="Sort"). Placed after the filters, and in the sheet on phones. */
  sort?: ReactNode
  /** Result count ("148 jobs"). End of the row on desktop, under it on phones. Announced politely when it changes. */
  count?: ReactNode
  /**
   * Where the count sits on desktop. "end" (default) closes the row; "below" gives it its own line under the
   * controls, so a count whose wording changes as you type ("148 jobs · newest first", "0 matches") never
   * resizes the search field beside it.
   */
  countPlacement?: 'end' | 'below'
  /** Always-visible trailing controls, such as a view toggle. */
  actions?: ReactNode
  /** How many filters are applied: shown on the phone Filters button and enables "Clear filters". */
  activeFilters?: number
  /** Clears every filter. Shown as a link beside the filters and in the sheet footer while activeFilters > 0. */
  onClearFilters?: () => void
  /** Name of the phone button and the sheet title. Default "Filters". */
  filtersLabel?: string
  /** Sheet description for assistive tech. Default: "Narrow the list.", or "Narrow and sort the list." with a sort. */
  filtersDescription?: string
}

/**
 * Search, filters, sort and the result count on one row. At 767px and below the filters and sort
 * move into a bottom Sheet behind a Filters button that shows how many are active; the same
 * controls are rendered there, so keep them controlled (their state lives in the page, not in
 * the control).
 */
export const Toolbar = forwardRef<HTMLDivElement, ToolbarProps>(function Toolbar(
  {
    search,
    filters,
    sort,
    count,
    countPlacement = 'end',
    actions,
    activeFilters = 0,
    onClearFilters,
    filtersLabel = 'Filters',
    filtersDescription,
    className,
    ...rest
  },
  ref,
) {
  const [open, setOpen] = useState(false)
  const hasFilters = Boolean(filters) || Boolean(sort)
  const canClear = Boolean(onClearFilters) && activeFilters > 0
  const root = useRef<HTMLDivElement | null>(null)
  const merged = useMergedRef(ref, root)
  const clearRef = useRef<HTMLButtonElement | null>(null)
  useClearLineStart(root, clearRef)
  return (
    <div
      ref={merged}
      className={cn('kit-toolbar', className)}
      data-count={countPlacement === 'below' ? 'below' : undefined}
      {...rest}
    >
      {search ? <div className="kit-toolbar__search">{search}</div> : null}
      {hasFilters ? (
        <>
          <div className="kit-toolbar__filters">
            {filters}
            {sort}
          </div>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="secondary"
                className="kit-toolbar__filters-button"
                aria-label={activeFilters > 0 ? `${filtersLabel}, ${activeFilters} active` : filtersLabel}
              >
                <SlidersHorizontal aria-hidden="true" />
                {/* Its own element so a 320px phone can drop the word (the aria-label keeps the name). */}
                <span className="kit-toolbar__filters-word">{filtersLabel}</span>
                {activeFilters > 0 ? <Count value={activeFilters} /> : null}
              </Button>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              // The sheet itself takes focus, not its first field: on a phone a focused field raises the keyboard over
              // half the sheet before anything is chosen. Keyboard users are one Tab from the first filter.
              onOpenAutoFocus={(event) => {
                event.preventDefault()
                if (event.target instanceof HTMLElement) event.target.focus({ preventScroll: true })
              }}
            >
              <SheetHeader>
                <SheetTitle>{filtersLabel}</SheetTitle>
                <SheetDescription visuallyHidden>
                  {filtersDescription ?? (sort ? 'Narrow and sort the list.' : 'Narrow the list.')}
                </SheetDescription>
              </SheetHeader>
              <SheetBody>
                <div className="kit-toolbar__sheet-controls">
                  {withSheetLabels(filters)}
                  {withSheetLabels(sort)}
                </div>
              </SheetBody>
              <SheetFooter>
                {canClear ? (
                  <Button type="button" variant="ghost" onClick={onClearFilters}>
                    Clear filters
                  </Button>
                ) : null}
                <Button type="button" onClick={() => setOpen(false)}>Done</Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </>
      ) : null}
      {canClear ? (
        <Button ref={clearRef} type="button" variant="link" size="sm" className="kit-toolbar__clear" onClick={onClearFilters}>
          Clear filters
        </Button>
      ) : null}
      {actions ? <div className="kit-toolbar__actions">{actions}</div> : null}
      {count !== undefined && count !== null ? (
        <p className="kit-toolbar__count" role="status">
          {count}
        </p>
      ) : null}
    </div>
  )
})
