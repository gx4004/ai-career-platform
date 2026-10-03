import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Ellipsis } from 'lucide-react'
import { cn } from '#/lib/utils'
import { Button } from './button'

/** First, last and the current page's neighbours; null marks a gap. */
export function pageItems(page: number, pageCount: number): Array<number | null> {
  const shown = [...new Set([1, page - 1, page, page + 1, pageCount])]
    .filter((number) => number >= 1 && number <= pageCount)
    .sort((a, b) => a - b)
  return shown.flatMap((number, index) => (index > 0 && number - shown[index - 1] > 1 ? [null, number] : [number]))
}

export type PaginationProps = Omit<ComponentPropsWithoutRef<'nav'>, 'onChange'> & {
  /** Current page, 1-based. */
  page: number
  pageCount: number
  onPageChange: (page: number) => void
  /**
   * numbered: Previous, page numbers with gaps, Next (Discovery). Phones show "Page 3 of 9" instead of the numbers.
   * simple: Previous, "Page 3 of 9", Next (History, admin).
   */
  variant?: 'numbered' | 'simple'
  /** Text at the start edge: "Showing 21–40 of 134". */
  summary?: ReactNode
}

/**
 * Page navigation. A nav landmark (name it with aria-label, default "Pages"); the current page has
 * aria-current="page". Renders nothing when there is only one page. Replaces .disc-pager,
 * .history-pagination and .admin-pagination.
 */
export const Pagination = forwardRef<HTMLElement, PaginationProps>(function Pagination(
  { page, pageCount, onPageChange, variant = 'numbered', summary, className, 'aria-label': ariaLabel = 'Pages', ...rest },
  ref,
) {
  if (pageCount <= 1) return null
  const current = Math.min(Math.max(page, 1), pageCount)
  return (
    <nav ref={ref} className={cn('kit-pagination', className)} aria-label={ariaLabel} data-variant={variant} {...rest}>
      {summary ? <p className="kit-pagination__summary">{summary}</p> : null}
      <div className="kit-pagination__controls">
        <Button
          type="button"
          variant={variant === 'simple' ? 'secondary' : 'ghost'}
          size="sm"
          disabled={current <= 1}
          onClick={() => onPageChange(current - 1)}
        >
          <ChevronLeft className="kit-pagination__chevron" aria-hidden="true" />
          Previous
        </Button>
        {variant === 'numbered' ? (
          <ol className="kit-pagination__pages" role="list">
            {pageItems(current, pageCount).map((number, index) =>
              number === null ? (
                <li key={`gap-${index}`} className="kit-pagination__gap" aria-hidden="true">
                  <Ellipsis />
                </li>
              ) : (
                <li key={number}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="kit-pagination__page"
                    aria-label={`Page ${number}`}
                    aria-current={number === current ? 'page' : undefined}
                    onClick={() => onPageChange(number)}
                  >
                    {number}
                  </Button>
                </li>
              ),
            )}
          </ol>
        ) : null}
        <p className="kit-pagination__status">
          Page {current} of {pageCount}
        </p>
        <Button
          type="button"
          variant={variant === 'simple' ? 'secondary' : 'ghost'}
          size="sm"
          disabled={current >= pageCount}
          onClick={() => onPageChange(current + 1)}
        >
          Next
          <ChevronRight className="kit-pagination__chevron" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  )
})
