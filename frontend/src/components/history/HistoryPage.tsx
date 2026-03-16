import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Pin, Search, Star, Trash2 } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Skeleton } from '#/components/ui/skeleton'
import { PageFrame } from '#/components/app/PageFrame'
import { AppStatePanel } from '#/components/app/AppStatePanel'
import { SceneVisual } from '#/components/illustrations/SceneVisual'
import { useCountUp } from '#/hooks/useCountUp'
import { useFavoriteToggle } from '#/hooks/useFavoriteToggle'
import { useHistory } from '#/hooks/useHistory'
import { useSession } from '#/hooks/useSession'
import {
  deleteHistoryItem,
  getHistoryItem,
  getHistoryWorkspaces,
  updateHistoryWorkspace,
} from '#/lib/api/client'
import { writeWorkflowContext } from '#/lib/tools/drafts'
import { getNextStepToolId } from '#/lib/tools/runMetadata'
import { deriveWorkflowUpdateFromHistoryItem } from '#/lib/tools/workflowContext'
import { getToolByHistoryName, toolList } from '#/lib/tools/registry'
import { toolAccentStyle } from '#/lib/tools/styleUtils'
import { trackTelemetry } from '#/lib/telemetry/client'

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
  const navigate = useNavigate()
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
  const workspaceQuery = useQuery({
    queryKey: ['history-workspaces'],
    queryFn: getHistoryWorkspaces,
    enabled: status === 'authenticated',
  })
  const favoriteToggle = useFavoriteToggle()
  const [actionError, setActionError] = useState<string | null>(null)
  const [continuingId, setContinuingId] = useState<string | null>(null)
  const [workspaceDrafts, setWorkspaceDrafts] = useState<Record<string, string>>({})
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
  const workspaceMutation = useMutation({
    mutationFn: ({
      workspaceId,
      label,
      isPinned,
    }: {
      workspaceId: string
      label?: string | null
      isPinned?: boolean
    }) =>
      updateHistoryWorkspace(workspaceId, {
        label,
        is_pinned: isPinned,
      }),
    onSuccess: async (workspace) => {
      setWorkspaceDrafts((current) => ({
        ...current,
        [workspace.id]: workspace.label || '',
      }))
      await queryClient.invalidateQueries({ queryKey: ['history-workspaces'] })
      await queryClient.invalidateQueries({ queryKey: ['history-page'] })
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : 'Failed to update workspace.')
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
  const workspaces = workspaceQuery.data?.items || []
  const featuredWorkspace = workspaces[0] || null
  const pinnedWorkspaces = workspaces.filter((item) => item.is_pinned).slice(0, 3)
  const recentChain = (listQuery.data?.items || []).slice(0, 3)
  const favoriteRuns = (listQuery.data?.items || []).filter((item) => item.is_favorite).slice(0, 3)

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
          <p className="eyebrow">Workspace timeline</p>
          <h1 className="page-title">Workspace Timeline</h1>
          <p className="muted-copy">
            Follow recent workflow chains, reopen strong runs, and jump back into the next best step.
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
        <div className="history-grid">
          <div className="section-card grid gap-3 p-5">
            <p className="eyebrow">Resume latest workspace</p>
            {featuredWorkspace ? (
              <>
                <p className="section-title">
                  {featuredWorkspace.label || 'Untitled workspace'}
                </p>
                <p className="small-copy muted-copy">
                  {featuredWorkspace.last_active_tool
                    ? `Latest artifact: ${featuredWorkspace.last_active_tool}`
                    : 'Resume the next actionable step in this workspace.'}
                </p>
                <Button
                  className="button-hero-primary"
                  disabled={
                    !featuredWorkspace.last_active_result_id ||
                    continuingId === featuredWorkspace.last_active_result_id
                  }
                  onClick={async () => {
                    if (!featuredWorkspace.last_active_result_id) return
                    try {
                      setContinuingId(featuredWorkspace.last_active_result_id)
                      const detail = await getHistoryItem(featuredWorkspace.last_active_result_id)
                      const currentTool = getToolByHistoryName(detail.tool_name)
                      if (!currentTool) return
                      const nextToolId = getNextStepToolId(currentTool.id, detail.metadata)
                      writeWorkflowContext({
                        ...deriveWorkflowUpdateFromHistoryItem(detail),
                        updatedAt: Date.now(),
                      })
                      trackTelemetry({
                        event_name: 'workspace_resumed',
                        tool_id: currentTool.id,
                        history_id: detail.id,
                        access_mode: 'authenticated',
                        workspace_id: featuredWorkspace.id,
                        saved: true,
                      })
                      await navigate({ to: toolList.find((tool) => tool.id === nextToolId)?.route || '/resume' })
                    } catch (error) {
                      setActionError(error instanceof Error ? error.message : 'Failed to resume workflow.')
                    } finally {
                      setContinuingId(null)
                    }
                  }}
                >
                  {continuingId === featuredWorkspace.last_active_result_id ? 'Opening…' : 'Resume later'}
                </Button>
              </>
            ) : (
              <p className="small-copy muted-copy">Your first saved workspace will appear here.</p>
            )}
          </div>
          <div className="section-card grid gap-3 p-5">
            <p className="eyebrow">Pinned workspaces</p>
            {pinnedWorkspaces.length ? (
              pinnedWorkspaces.map((workspace) => (
                <div key={workspace.id} className="grid gap-1">
                  <p>{workspace.label || 'Pinned workspace'}</p>
                  <p className="small-copy muted-copy">
                    {workspace.last_active_tool || 'No latest artifact'} • {workspace.linked_run_ids.length} linked runs
                  </p>
                </div>
              ))
            ) : (
              <p className="small-copy muted-copy">Pin a workspace to keep it at the top.</p>
            )}
          </div>
          <div className="section-card grid gap-3 p-5">
            <p className="eyebrow">Recent chain</p>
            {recentChain.length ? (
              recentChain.map((item) => (
                <div key={item.id} className="grid gap-1">
                  <p>{item.label || item.metadata.primary_recommendation_title || 'Saved run'}</p>
                  <p className="small-copy muted-copy">
                    {item.metadata.summary_headline || item.tool_name}
                  </p>
                </div>
              ))
            ) : (
              <p className="small-copy muted-copy">Recent workflow steps will appear here.</p>
            )}
          </div>
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
        <div className="section-card grid gap-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
              <p className="eyebrow">Reusable workspaces</p>
              <h2 className="section-title">Artifact chains you can return to</h2>
              <p className="small-copy muted-copy">
                Group related runs, pin the important ones, and resume from the latest actionable result.
              </p>
            </div>
          </div>
          {workspaceQuery.isPending ? (
            <div className="history-grid">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="history-card">
                  <div className="grid gap-3">
                    <Skeleton className="h-5 w-32 rounded" />
                    <Skeleton className="h-4 w-48 rounded" />
                    <Skeleton className="h-10 w-full rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : workspaces.length ? (
            <div className="history-grid">
              {workspaces.map((workspace) => (
                <div key={workspace.id} className="history-card">
                  <div className="grid gap-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="grid gap-2 flex-1">
                        <Input
                          value={workspaceDrafts[workspace.id] ?? workspace.label ?? ''}
                          onChange={(event) =>
                            setWorkspaceDrafts((current) => ({
                              ...current,
                              [workspace.id]: event.target.value,
                            }))
                          }
                          placeholder="Name this workspace"
                        />
                        <p className="small-copy muted-copy">
                          {workspace.last_active_tool || 'No active tool'} • {workspace.linked_run_ids.length} linked runs
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        className="button-toolbar-utility"
                        disabled={workspaceMutation.isPending}
                        onClick={() =>
                          workspaceMutation.mutate({
                            workspaceId: workspace.id,
                            isPinned: !workspace.is_pinned,
                          })
                        }
                      >
                        <Pin
                          size={16}
                          fill={workspace.is_pinned ? 'currentColor' : 'none'}
                        />
                      </Button>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="chip-grid">
                        {workspace.linked_run_ids.slice(0, 4).map((runId) => (
                          <Badge key={runId} variant="outline">
                            {runId.slice(0, 8)}
                          </Badge>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          disabled={workspaceMutation.isPending}
                          onClick={() =>
                            workspaceMutation.mutate({
                              workspaceId: workspace.id,
                              label: workspaceDrafts[workspace.id] ?? workspace.label ?? '',
                            })
                          }
                        >
                          Save name
                        </Button>
                        <Button
                          className="button-hero-primary"
                          disabled={!workspace.last_active_result_id || continuingId === workspace.last_active_result_id}
                          onClick={async () => {
                            if (!workspace.last_active_result_id) return
                            try {
                              setContinuingId(workspace.last_active_result_id)
                              const detail = await getHistoryItem(workspace.last_active_result_id)
                              const currentTool = getToolByHistoryName(detail.tool_name)
                              if (!currentTool) return
                              const nextToolId = getNextStepToolId(currentTool.id, detail.metadata)
                              writeWorkflowContext({
                                ...deriveWorkflowUpdateFromHistoryItem(detail),
                                updatedAt: Date.now(),
                              })
                              await navigate({ to: toolList.find((tool) => tool.id === nextToolId)?.route || '/resume' })
                            } catch (error) {
                              setActionError(error instanceof Error ? error.message : 'Failed to continue this workspace.')
                            } finally {
                              setContinuingId(null)
                            }
                          }}
                        >
                          {continuingId === workspace.last_active_result_id ? 'Opening…' : 'Resume later'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="small-copy muted-copy">Save related runs to see workspace chains here.</p>
          )}
        </div>
        <div className="section-card grid gap-3 p-5">
          <p className="eyebrow">Saved favorites</p>
          {favoriteRuns.length ? (
            favoriteRuns.map((item) => (
              <div key={item.id} className="grid gap-1">
                <p>{item.label || item.metadata.primary_recommendation_title || 'Favorite run'}</p>
                <p className="small-copy muted-copy">
                  {item.metadata.summary_headline || 'Marked as a favorite for quick return.'}
                </p>
              </div>
            ))
          ) : (
            <p className="small-copy muted-copy">Favorite a run to pin it here for faster return.</p>
          )}
        </div>
        {listQuery.isPending ? (
          <div className="history-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="section-card grid gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="grid gap-2 flex-1">
                    <div className="flex items-center gap-2">
                      <Skeleton className="size-4 rounded-full" />
                      <Skeleton className="h-5 w-20 rounded" />
                      <Skeleton className="h-4 w-16 rounded" />
                    </div>
                    <Skeleton className="h-4 w-3/4 rounded" />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex gap-2">
                    <Skeleton className="size-8 rounded" />
                    <Skeleton className="size-8 rounded" />
                  </div>
                  <Skeleton className="h-9 w-20 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : listQuery.data?.items.length ? (
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
                          {item.metadata.schema_version ? (
                            <Badge variant="outline">{item.metadata.schema_version}</Badge>
                          ) : null}
                          <span className="small-copy muted-copy">
                            {new Date(item.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <p>{item.label || <em>Untitled run</em>}</p>
                        {item.metadata.primary_recommendation_title ? (
                          <p className="small-copy">{item.metadata.primary_recommendation_title}</p>
                        ) : null}
                        {item.workspace?.label ? (
                          <p className="small-copy muted-copy">Workspace: {item.workspace.label}</p>
                        ) : null}
                        {item.metadata.summary_headline ? (
                          <p className="small-copy muted-copy">{item.metadata.summary_headline}</p>
                        ) : null}
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
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="button-toolbar-utility"
                          onClick={async () => {
                            try {
                              setContinuingId(item.id)
                              const detail = await getHistoryItem(item.id)
                              const currentTool = getToolByHistoryName(detail.tool_name)
                              if (!currentTool) return
                              const nextToolId = getNextStepToolId(currentTool.id, detail.metadata)
                              writeWorkflowContext({
                                ...deriveWorkflowUpdateFromHistoryItem(detail),
                                updatedAt: Date.now(),
                              })
                              await navigate({ to: toolList.find((candidate) => candidate.id === nextToolId)?.route || route })
                            } catch (error) {
                              setActionError(error instanceof Error ? error.message : 'Failed to continue this workflow.')
                            } finally {
                              setContinuingId(null)
                            }
                          }}
                          disabled={continuingId === item.id}
                        >
                          {continuingId === item.id ? 'Opening…' : 'Continue'}
                        </Button>
                        <Button asChild>
                          <Link to={route}>View →</Link>
                        </Button>
                      </div>
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
