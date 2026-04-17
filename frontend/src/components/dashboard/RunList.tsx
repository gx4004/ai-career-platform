import type { ComponentType } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Star } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { Badge } from '#/components/ui/badge'
import { useHistory } from '#/hooks/useHistory'
import { useSession } from '#/hooks/useSession'
import type { HistoryQueryParams } from '#/lib/api/client'
import { Skeleton } from '#/components/ui/skeleton'
import { getToolByHistoryName } from '#/lib/tools/registry'
import { toolAccentStyle } from '#/lib/tools/styleUtils'
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
}: {
  eyebrow: string
  title: string
  emptyIcon: ComponentType<{ size: number; style: React.CSSProperties }>
  emptyText: string
  unauthText: string
  queryParams: HistoryQueryParams
  showFavoriteStar?: boolean
  bare?: boolean
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
          {[1, 2, 3].map((i) => (
            <div key={i} className="run-row run-row--skeleton">
              <Skeleton className="run-row-skeleton-icon" />
              <div className="run-row-skeleton-body">
                <Skeleton className="run-row-skeleton-meta" />
                <Skeleton className="run-row-skeleton-label" />
              </div>
              <Skeleton className="run-row-skeleton-cta" />
            </div>
          ))}
        </div>
      ) : hasItems ? (
        items.map((item, i) => {
          const tool = getToolByHistoryName(item.tool_name)
          const route = tool
            ? tool.resultRoute.replace('$historyId', item.id)
            : '/history'

          return (
            <motion.div
              key={item.id}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 80, damping: 18, delay: i * 0.05 }}
            >
            <Link
              to={route}
              className="run-row run-row--linked"
              style={toolAccentStyle(tool?.accent)}
            >
              {tool && (
                <div className="run-row-icon-col" aria-hidden>
                  <tool.icon size={16} />
                </div>
              )}
              <div className="run-row-body">
                <div className="run-row-meta">
                  {showFavoriteStar && (
                    <Star size={12} className="run-row-favorite" aria-hidden />
                  )}
                  <Badge variant="outline">{tool?.shortLabel || item.tool_name}</Badge>
                  {!showFavoriteStar && (
                    <span className="small-copy muted-copy run-row-date">
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <span className="run-row-label">{item.label || (showFavoriteStar ? 'Untitled favorite' : 'Untitled run')}</span>
              </div>
              <span
                className="run-row-cta"
                aria-hidden
                style={tool?.accent ? { color: tool.accent } : undefined}
              >
                <span>Open</span>
                <ArrowRight size={14} className="run-row-cta-arrow" />
              </span>
            </Link>
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
          <div className="grid gap-0.5">
            <p className="eyebrow">{eyebrow}</p>
            <h2 className="section-title">{title}</h2>
          </div>
          {content}
        </div>
      </section>
    </ScrollFadeUp>
  )
}
