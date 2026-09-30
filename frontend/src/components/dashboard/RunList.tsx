import type { ComponentType } from 'react'
import { Link } from '@tanstack/react-router'
import { motion, useReducedMotion } from 'framer-motion'
import { useHistory } from '#/hooks/useHistory'
import { useSession } from '#/hooks/useSession'
import type { HistoryQueryParams } from '#/lib/api/client'
import { RunRow, RunRowSkeleton, formatRunDate } from '#/components/dashboard/RunRow'
import { historyRunHref, historyToolDisplay } from '#/lib/tools/historyToolLabel'
import { ScrollFadeUp } from '#/components/ui/motion'

export function RunList({
  eyebrow,
  title,
  emptyIcon: EmptyIcon,
  emptyText,
  unauthText,
  queryParams,
  showFavoriteStar,
  bare,
  viewAllTo,
}: {
  eyebrow: string
  title: string
  emptyIcon: ComponentType<{ size: number; style: React.CSSProperties }>
  emptyText: string
  unauthText: string
  queryParams: HistoryQueryParams
  showFavoriteStar?: boolean
  bare?: boolean
  /** Adds a "View all" link to the card header. */
  viewAllTo?: '/history'
}) {
  const { status } = useSession()
  const query = useHistory(queryParams, status === 'authenticated')
  const isAuthenticated = status === 'authenticated'
  const items = query.data?.items ?? []
  const hasItems = items.length > 0
  const prefersReducedMotion = useReducedMotion() ?? false

  // When not authenticated, show a compact inline message instead of a full card
  if (!isAuthenticated && !bare) {
    return (
      <div className="dash-card-minimal">
        <EmptyIcon size={16} style={{ color: 'var(--text-soft)', opacity: 0.6 }} />
        <p className="small-copy muted-copy">{unauthText}</p>
      </div>
    )
  }

  const content = (
    <div className="run-list">
      {query.isPending ? (
        <div className="run-list run-list--loading" aria-hidden>
          {Array.from({ length: queryParams.page_size ?? 3 }, (_, i) => (
            <RunRowSkeleton key={i} />
          ))}
        </div>
      ) : hasItems ? (
        items.map((item, i) => {
          const tool = historyToolDisplay(item.tool_name)
          const href = historyRunHref(item)

          return (
            <motion.div
              key={item.id}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 80, damping: 18, delay: i * 0.05 }}
            >
              {(() => {
                const rowProps = {
                  tool,
                  label: item.label || (showFavoriteStar ? 'Untitled favorite' : 'Untitled run'),
                  showFavoriteStar,
                  date: showFavoriteStar ? undefined : formatRunDate(item.created_at),
                }
                // Older CV Studio runs have no page to open: show them as a plain row.
                return href ? (
                  <RunRow mode="linked" href={href} {...rowProps} />
                ) : (
                  <RunRow mode="actions" href={null} actions={null} {...rowProps} />
                )
              })()}
            </motion.div>
          )
        })
      ) : (
        <div className="empty-state-mini">
          <span className="empty-state-mini-icon" aria-hidden>
            <EmptyIcon size={18} style={{ color: 'currentColor' }} />
          </span>
          <p className="small-copy empty-state-mini-text">{emptyText}</p>
        </div>
      )}
    </div>
  )

  if (bare) return content

  return (
    <ScrollFadeUp>
      <section className="dash-card dash-card--runs">
        <div className="grid gap-3">
          <div className="dash-card-head">
            <div className="grid gap-0.5">
              <p className="eyebrow">{eyebrow}</p>
              <h2 className="section-title">{title}</h2>
            </div>
            {viewAllTo ? (
              <Link to={viewAllTo} className="dash-card-head-link">
                View all
              </Link>
            ) : null}
          </div>
          {content}
        </div>
      </section>
    </ScrollFadeUp>
  )
}
