import { Link } from '@tanstack/react-router'
import { useHistory } from '#/hooks/useHistory'
import { useSession } from '#/hooks/useSession'
import type { HistoryQueryParams } from '#/lib/api/client'
import { RunRow, RunRowSkeleton, formatRunDate } from '#/components/dashboard/RunRow'
import { historyRunHref, historyToolDisplay } from '#/lib/tools/historyToolLabel'

export function RunList({
  title,
  emptyText,
  unauthText,
  queryParams,
  showFavoriteStar,
  bare,
  viewAllTo,
}: {
  title: string
  emptyText: string
  unauthText: string
  queryParams: HistoryQueryParams
  showFavoriteStar?: boolean
  bare?: boolean
  /** Adds a "View all" link to the section header. */
  viewAllTo?: '/history'
}) {
  const { status } = useSession()
  const query = useHistory(queryParams, status === 'authenticated')
  const isAuthenticated = status === 'authenticated'
  const items = query.data?.items ?? []

  if (!isAuthenticated && !bare) {
    return <p className="dash-empty">{unauthText}</p>
  }

  const content = (
    <div className="run-list">
      {query.isPending ? (
        <div className="run-list run-list--loading" aria-hidden>
          {Array.from({ length: queryParams.page_size ?? 3 }, (_, i) => (
            <RunRowSkeleton key={i} />
          ))}
        </div>
      ) : items.length > 0 ? (
        items.map((item) => {
          const tool = historyToolDisplay(item.tool_name)
          const href = historyRunHref(item)
          const rowProps = {
            tool,
            label: item.label || (showFavoriteStar ? 'Untitled favorite' : 'Untitled run'),
            showFavoriteStar,
            date: showFavoriteStar ? undefined : formatRunDate(item.created_at),
          }
          // Older CV Studio runs have no page to open: show them as a plain row.
          return href ? (
            <RunRow key={item.id} mode="linked" href={href} {...rowProps} />
          ) : (
            <RunRow key={item.id} mode="actions" href={null} actions={null} {...rowProps} />
          )
        })
      ) : (
        <p className="dash-empty">{emptyText}</p>
      )}
    </div>
  )

  if (bare) return content

  return (
    <section className="dash-section">
      <div className="dash-section__head">
        <h2 className="dash-section__title">{title}</h2>
        {viewAllTo ? (
          <Link to={viewAllTo} className="dash-section__link">
            View all
          </Link>
        ) : null}
      </div>
      {content}
    </section>
  )
}
