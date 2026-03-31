import type { ComponentType } from 'react'
import { Link } from '@tanstack/react-router'
import { Star } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { useHistory } from '#/hooks/useHistory'
import { useSession } from '#/hooks/useSession'
import type { HistoryQueryParams } from '#/lib/api/client'
import { Skeleton } from '#/components/ui/skeleton'
import { getToolByHistoryName } from '#/lib/tools/registry'
import { toolAccentStyle } from '#/lib/tools/styleUtils'

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
  const hasItems = query.data?.items.length

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
        <div className="grid gap-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      ) : hasItems ? (
        query.data!.items.map((item) => {
          const tool = getToolByHistoryName(item.tool_name)
          const route = tool
            ? tool.resultRoute.replace('$historyId', item.id)
            : '/history'

          return (
            <div
              key={item.id}
              className="run-row"
              style={toolAccentStyle(tool?.accent)}
            >
              {tool && (
                <div className="run-row-icon-col" aria-hidden>
                  <tool.icon size={16} />
                </div>
              )}
              <div className="grid gap-0.5" style={{ minWidth: 0 }}>
                <div className="flex items-center gap-2">
                  {showFavoriteStar && (
                    <Star size={12} style={{ color: 'var(--warning)' }} />
                  )}
                  <Badge variant="outline">{tool?.shortLabel || item.tool_name}</Badge>
                  {!showFavoriteStar && (
                    <span className="small-copy muted-copy">
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <span className="run-row-label">{item.label || (showFavoriteStar ? 'Untitled favorite' : 'Untitled run')}</span>
              </div>
              <Link
                to={route}
                className="small-copy run-row-view"
                style={{ color: tool?.accent || 'var(--accent)' }}
              >
                View
              </Link>
            </div>
          )
        })
      ) : (
        <div className="empty-state-mini">
          <EmptyIcon size={20} style={{ color: 'var(--text-soft)', opacity: 0.5 }} />
          <p className="small-copy muted-copy">{emptyText}</p>
        </div>
      )}
    </div>
  )

  if (bare) return content

  return (
    <section className="dash-card dash-card--runs">
      <div className="grid gap-3">
        <div className="grid gap-0.5">
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="section-title">{title}</h2>
        </div>
        {content}
      </div>
    </section>
  )
}
