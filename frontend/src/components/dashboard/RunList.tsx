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

  const content = (
    <div className="run-list">
      {status !== 'authenticated' ? (
        <p className="muted-copy">{unauthText}</p>
      ) : query.isPending ? (
        <div className="grid gap-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
      ) : query.data?.items.length ? (
        query.data.items.map((item) => {
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
              <div className="grid gap-1">
                <div className="flex items-center gap-2">
                  {tool && <tool.icon size={14} style={{ color: tool.accent }} />}
                  {showFavoriteStar && (
                    <Star size={14} style={{ color: 'var(--warning)' }} />
                  )}
                  <Badge variant="outline">{tool?.shortLabel || item.tool_name}</Badge>
                  {!showFavoriteStar && (
                    <span className="small-copy muted-copy">
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <span>{item.label || (showFavoriteStar ? 'Untitled favorite' : 'Untitled run')}</span>
              </div>
              <Link
                to={route}
                className="small-copy"
                style={{ color: tool?.accent || 'var(--accent)' }}
              >
                View
              </Link>
            </div>
          )
        })
      ) : (
        <div className="empty-state-mini">
          <EmptyIcon size={24} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
          <p className="muted-copy">{emptyText}</p>
        </div>
      )}
    </div>
  )

  if (bare) return content

  return (
    <section className="dash-card p-6">
      <div className="grid gap-4">
        <div className="grid gap-1">
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="section-title">{title}</h2>
        </div>
        {content}
      </div>
    </section>
  )
}
