import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Search, Star, Trash2 } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { PageFrame } from '#/components/app/PageFrame'
import { AppStatePanel } from '#/components/app/AppStatePanel'
import { SceneVisual } from '#/components/illustrations/SceneVisual'
import { useCountUp } from '#/hooks/useCountUp'
import { useFavoriteToggle } from '#/hooks/useFavoriteToggle'
import { useHistory } from '#/hooks/useHistory'
import { useSession } from '#/hooks/useSession'
import { deleteHistoryItem } from '#/lib/api/client'
import { getToolByHistoryName, toolList } from '#/lib/tools/registry'
import { toolAccentStyle } from '#/lib/tools/styleUtils'

export type HistorySearchState = {
  tool?: string
  favorite?: boolean
  q?: string
  page?: number
  page_size?: number
}

export function HistoryPage({
  search,
  onSearchChange,
}: {
  search: HistorySearchState
  onSearchChange: (next: Partial<HistorySearchState>) => void
}) {
  const { status, openAuthDialog } = useSession()
  const queryClient = useQueryClient()
  const page = search.page ?? 1
  const pageSize = search.page_size ?? 12
  const listQuery = useHistory(
    {
      ...search,
      page,
      page_size: pageSize,
    },
    status === 'authenticated',
  )
  const statsQuery = useHistory({ page: 1, page_size: 100 }, status === 'authenticated')
  const favoritesQuery = useHistory(
    { page: 1, page_size: 1, favorite: true },
    status === 'authenticated',
  )
  const favoriteToggle = useFavoriteToggle()
  const [actionError, setActionError] = useState<string | null>(null)
  const deleteMutation = useMutation({
    mutationFn: deleteHistoryItem,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['history-page'] })
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : 'Failed to delete run.'
      setActionError(msg)
      setTimeout(() => setActionError(null), 3000)
    },
  })

  const totalPages = Math.max(
    1,
    Math.ceil((listQuery.data?.total ?? 0) / pageSize),
  )
  const toolCount = useMemo(
    () =>
      new Set(statsQuery.data?.items.map((item) => item.tool_name) || []).size,
    [statsQuery.data?.items],
  )
  const totalRuns = useCountUp(statsQuery.data?.total || 0, status === 'authenticated')
  const totalFavorites = useCountUp(
    favoritesQuery.data?.total || 0,
    status === 'authenticated',
  )
  const totalTools = useCountUp(toolCount, status === 'authenticated')

  if (status !== 'authenticated') {
    return (
      <AppStatePanel
        badge="History"
        title="Sign in to view your history"
        description="Saved runs, favorites, and workspace persistence are tied to your account."
        scene="emptyPlanning"
        actions={[
          {
            label: 'Sign in',
            onClick: () => openAuthDialog({ to: '/history', reason: 'history' }),
          },
          { label: 'Start with Resume', to: '/resume', variant: 'outline' },
        ]}
      />
    )
  }

  return (
    <PageFrame>
      <section className="history-layout content-max">
        <div className="grid gap-2">
          <p className="eyebrow">Run history</p>
          <h1 className="page-title">Run History</h1>
          <p className="muted-copy">
            Browse previous outputs, filter by tool, and keep the strongest runs starred.
          </p>
        </div>
        <div className="history-stats">
          {[
            ['Total Runs', totalRuns],
            ['Favorites', totalFavorites],
            ['Tools Used', totalTools],
          ].map(([label, value]) => (
            <div key={label} className="section-card h-stat-card p-5">
              <p className="eyebrow mb-2">{label}</p>
              <p className="display-lg mono">{value}</p>
            </div>
          ))}
        </div>
        <div className="history-filter-row">
          <div className="relative min-w-[18rem] flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={16} />
            <Input
              value={search.q || ''}
              onChange={(event) => onSearchChange({ q: event.target.value, page: 1 })}
              placeholder="Search by saved label"
              className="pl-10"
            />
          </div>
          <div className="history-pill-row" role="status" aria-label="Active filters">
            {toolList.map((tool) => (
              <button
                key={tool.id}
                type="button"
                className={`history-pill${search.tool === tool.id ? ' is-active' : ''}`}
                onClick={() =>
                  onSearchChange({
                    tool: search.tool === tool.id ? undefined : tool.id,
                    page: 1,
                  })
                }
              >
                <span
                  className="inline-block size-2 rounded-full"
                  style={{ background: tool.accent }}
                />
                <span>{tool.shortLabel}</span>
              </button>
            ))}
            <button
              type="button"
              className={`history-pill${search.favorite ? ' is-active' : ''}`}
              onClick={() => onSearchChange({ favorite: !search.favorite, page: 1 })}
            >
              ⭐ Favorites
            </button>
          </div>
        </div>
        {actionError ? (
          <div className="small-copy section-card p-3" style={{ color: 'var(--destructive)' }}>
            {actionError}
          </div>
        ) : null}
        {favoriteToggle.error ? (
          <div className="small-copy section-card p-3" style={{ color: 'var(--destructive)' }}>
            {favoriteToggle.error instanceof Error ? favoriteToggle.error.message : 'Failed to update favorite.'}
          </div>
        ) : null}
        {listQuery.data?.items.length ? (
          <div className="history-grid">
            {listQuery.data.items.map((item) => {
              const tool = getToolByHistoryName(item.tool_name)
              const route = tool
                ? tool.resultRoute.replace('$historyId', item.id)
                : '/history'

              return (
                <div
                  key={item.id}
                  className="history-card"
                  style={toolAccentStyle(tool?.accent || 'var(--accent)')}
                >
                  <div className="grid gap-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="grid gap-2">
                        <div className="flex items-center gap-2">
                          {tool ? (
                            <tool.icon size={16} style={{ color: tool.accent }} />
                          ) : null}
                          <Badge variant="outline">{tool?.shortLabel || item.tool_name}</Badge>
                          <span className="small-copy muted-copy">
                            {new Date(item.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <p>{item.label || <em>Untitled run</em>}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="icon-sm"
                          className="button-toolbar-utility"
                          onClick={() =>
                            favoriteToggle.mutate({
                              historyId: item.id,
                              isFavorite: !item.is_favorite,
                            })
                          }
                        >
                          <Star
                            size={14}
                            fill={item.is_favorite ? 'currentColor' : 'none'}
                          />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          className="button-destructive-soft"
                          onClick={() => deleteMutation.mutate(item.id)}
                          disabled={deleteMutation.isPending && deleteMutation.variables === item.id}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                      <Button asChild>
                        <Link to={route}>View →</Link>
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="section-card grid gap-4 p-8 text-center">
            <div className="mx-auto w-full max-w-md">
              <SceneVisual scene="emptyPlanning" />
            </div>
            <p className="section-title">No runs found</p>
            <p className="muted-copy">
              Try a broader filter or start a fresh analysis to populate history.
            </p>
            <div>
              <Button asChild className="button-hero-primary" size="lg">
                <Link to="/resume">Start with Resume</Link>
              </Button>
            </div>
          </div>
        )}
        <div className="history-pagination">
          <Button
            variant="outline"
            className="button-toolbar-utility"
            disabled={page <= 1}
            onClick={() => onSearchChange({ page: page - 1 })}
          >
            Previous
          </Button>
          <span className="small-copy muted-copy">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            className="button-toolbar-utility"
            disabled={page >= totalPages}
            onClick={() => onSearchChange({ page: page + 1 })}
          >
            Next
          </Button>
        </div>
      </section>
    </PageFrame>
  )
}
