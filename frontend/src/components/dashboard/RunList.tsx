import { Link } from '@tanstack/react-router'
import { Button, EmptyState, ErrorState, List, Section, Skeleton } from '#/components/kit'
import { useHistory } from '#/hooks/useHistory'
import type { HistoryQueryParams } from '#/lib/api/client'
import { RunRow, formatRunDate } from '#/components/dashboard/RunRow'
import { historyRunHref, historyToolDisplay } from '#/lib/tools/historyToolLabel'

/** A short list of saved runs under a section heading: recent activity, starred results. */
export function RunList({
  title,
  emptyTitle,
  emptyText,
  queryParams,
  showDate = true,
  untitled = 'Untitled run',
  viewAllTo,
}: {
  title: string
  emptyTitle: string
  emptyText: string
  queryParams: HistoryQueryParams
  /** Starred results are not dated: they are kept, not logged. */
  showDate?: boolean
  untitled?: string
  /** Adds a "View all" link to the section heading. */
  viewAllTo?: '/history'
}) {
  const query = useHistory(queryParams, true)
  const items = query.data?.items ?? []

  return (
    <Section
      title={title}
      actions={
        viewAllTo && !query.isPending ? (
          <Button asChild variant="ghost" size="sm">
            <Link to={viewAllTo}>View all</Link>
          </Button>
        ) : null
      }
    >
      {query.isPending ? (
        <List aria-busy aria-label={title}>
          <Skeleton variant="row" as="li" count={queryParams.page_size ?? 3} />
        </List>
      ) : query.isError ? (
        <ErrorState
          title={`${title} couldn't be loaded`}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : items.length > 0 ? (
        <List aria-label={title}>
          {items.map((item) => (
            <RunRow
              key={item.id}
              tool={historyToolDisplay(item.tool_name)}
              label={item.label || untitled}
              date={showDate ? formatRunDate(item.created_at) : undefined}
              href={historyRunHref(item)}
            />
          ))}
        </List>
      ) : (
        <EmptyState title={emptyTitle} description={emptyText} />
      )}
    </Section>
  )
}
