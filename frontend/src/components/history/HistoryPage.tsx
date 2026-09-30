import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowRight, Pencil, Search, Star, Trash2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { PageHero } from '#/components/app/PageHero'
import { PageFrame } from '#/components/app/PageFrame'
import { Skeleton } from '#/components/ui/skeleton'
import { AppStatePanel } from '#/components/app/AppStatePanel'
import { ConfirmDeleteDialog } from '#/components/app/ConfirmDeleteDialog'
import { formatRunDate } from '#/components/dashboard/RunRow'
import { useFavoriteToggle } from '#/hooks/useFavoriteToggle'
import { useHistory } from '#/hooks/useHistory'
import { useSession } from '#/hooks/useSession'
import { deleteHistoryItem, getHistoryItem, updateHistoryItem } from '#/lib/api/client'
import type { ToolRunSummary } from '#/lib/api/schemas'
import { writeWorkflowContext } from '#/lib/tools/drafts'
import { historyRunHref, historyToolDisplay } from '#/lib/tools/historyToolLabel'
import { getNextStepToolId } from '#/lib/tools/runMetadata'
import { deriveWorkflowUpdateFromHistoryItem } from '#/lib/tools/workflowContext'
import { getToolByHistoryName, toolList } from '#/lib/tools/registry'
import { trackTelemetry } from '#/lib/telemetry/client'

export type HistorySearchState = {
  tool?: string
  favorite?: boolean
  q?: string
  page?: number
  page_size?: number
}

const DEFAULT_PAGE_SIZE = 10

function runLabel(item: ToolRunSummary) {
  return item.label || item.metadata.primary_recommendation_title || 'Untitled run'
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
  const authenticated = status === 'authenticated'
  const page = search.page ?? 1
  const pageSize = search.page_size ?? DEFAULT_PAGE_SIZE
  const hasFilters = Boolean(search.tool || search.favorite || search.q)

  const [searchInput, setSearchInput] = useState(search.q ?? '')
  useEffect(() => {
    setSearchInput(search.q ?? '')
  }, [search.q])
  const searchDebounceRef = useRef<number | null>(null)
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current !== null) {
        window.clearTimeout(searchDebounceRef.current)
      }
    }
  }, [])

  const listQuery = useHistory(
    {
      tool: search.tool,
      q: search.q,
      // An absent filter must stay absent: `favorite=false` means "not starred".
      favorite: search.favorite ? true : undefined,
      page,
      page_size: pageSize,
    },
    authenticated,
  )
  const favoritesQuery = useHistory({ page: 1, page_size: 1, favorite: true }, authenticated)
  const favoriteToggle = useFavoriteToggle()
  const [actionError, setActionError] = useState<string | null>(null)
  const [continuingId, setContinuingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [deleteCandidate, setDeleteCandidate] = useState<{ id: string; label: string } | null>(null)

  const deleteMutation = useMutation({
    mutationFn: deleteHistoryItem,
    onSuccess: async (_response, historyId) => {
      setDeleteCandidate(null)
      queryClient.removeQueries({ queryKey: ['tool-run', historyId], exact: true })
      await queryClient.invalidateQueries({ queryKey: ['history-page'] })
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : 'Failed to delete run.')
    },
  })
  const renameMutation = useMutation({
    mutationFn: ({ historyId, label }: { historyId: string; label: string }) =>
      updateHistoryItem(historyId, label),
    onSuccess: async () => {
      setEditingId(null)
      setActionError(null)
      await queryClient.invalidateQueries({ queryKey: ['history-page'] })
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : 'Failed to update saved run.')
    },
  })

  const total = listQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  function clearFilters() {
    if (searchDebounceRef.current !== null) {
      window.clearTimeout(searchDebounceRef.current)
      searchDebounceRef.current = null
    }
    setSearchInput('')
    onSearchChange({ tool: undefined, favorite: undefined, q: undefined, page: 1 })
  }

  async function continueRun(item: ToolRunSummary) {
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
      // Funnel: user moved from a completed run to its connected next-best
      // tool (D-040). tool_id is the tool being continued from.
      trackTelemetry({
        event_name: 'workflow_continued',
        tool_id: currentTool.id,
        access_mode: 'authenticated',
      })
      await navigate({
        to: toolList.find((candidate) => candidate.id === nextToolId)?.route || currentTool.route,
      })
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to continue this workflow.')
    } finally {
      setContinuingId(null)
    }
  }

  if (!authenticated) {
    return (
      <AppStatePanel
        title="Pick up where you left off"
        description="Your saved runs and favorites live here — sign in to unlock your full history."
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

  const chips =
    listQuery.data && favoritesQuery.data
      ? [
          `${listQuery.data.total} ${listQuery.data.total === 1 ? 'run' : 'runs'}`,
          `${favoritesQuery.data.total} starred`,
        ]
      : undefined
  const items = listQuery.data?.items ?? []
  const errorMessage = actionError ?? (favoriteToggle.error
    ? favoriteToggle.error instanceof Error
      ? favoriteToggle.error.message
      : 'Failed to update favorite.'
    : null)

  return (
    <PageFrame className="history-page">
      <section className="history-layout">
        <PageHero
          title="History"
          purpose="Every analysis you have saved, newest first. Reopen a result or continue to the next tool."
          chips={chips}
        />

        <div className="history-toolbar">
          <div className="history-toolbar__search">
            <Search className="history-toolbar__search-icon" size={14} aria-hidden />
            <Input
              type="search"
              aria-label="Search saved runs by label"
              value={searchInput}
              onChange={(event) => {
                const next = event.target.value
                setSearchInput(next)
                if (searchDebounceRef.current !== null) {
                  window.clearTimeout(searchDebounceRef.current)
                }
                searchDebounceRef.current = window.setTimeout(() => {
                  onSearchChange({ q: next || undefined, page: 1 })
                }, 200)
              }}
              placeholder="Search by saved label"
              className="history-toolbar__input"
            />
          </div>
          <div className="history-pill-row" role="group" aria-label="Filter by tool">
            {toolList.map((tool) => (
              <button
                key={tool.id}
                type="button"
                aria-pressed={search.tool === tool.id}
                className={`history-pill${search.tool === tool.id ? ' is-active' : ''}`}
                onClick={() =>
                  onSearchChange({
                    tool: search.tool === tool.id ? undefined : tool.id,
                    page: 1,
                  })
                }
              >
                <span>{tool.shortLabel}</span>
              </button>
            ))}
            <button
              type="button"
              aria-pressed={Boolean(search.favorite)}
              className={`history-pill${search.favorite ? ' is-active' : ''}`}
              onClick={() => onSearchChange({ favorite: search.favorite ? undefined : true, page: 1 })}
            >
              <Star size={12} fill={search.favorite ? 'currentColor' : 'none'} aria-hidden />
              <span>Favorites</span>
            </button>
          </div>
          {hasFilters ? (
            <button type="button" className="history-toolbar__clear" onClick={clearFilters}>
              Clear filters
            </button>
          ) : null}
        </div>
        <p className="history-applications-link small-copy muted-copy">
          Looking for your applications? <Link to="/campaigns">Open Applications</Link>
        </p>

        {errorMessage ? (
          <div className="history-alert small-copy" role="alert">
            {errorMessage}
          </div>
        ) : null}

        {listQuery.isPending ? (
          <div className="history-table-wrap" aria-hidden>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="history-skeleton-row">
                <Skeleton className="history-skeleton-row__bar" />
              </div>
            ))}
          </div>
        ) : listQuery.isError ? (
          <div className="history-empty" role="alert">
            <p className="history-empty__title">We couldn&apos;t load your history</p>
            <p className="history-empty__text">Check your connection and try again.</p>
            <div>
              <Button variant="outline" size="sm" onClick={() => void listQuery.refetch()}>
                Retry
              </Button>
            </div>
          </div>
        ) : items.length ? (
          <div className="history-table-wrap">
            <table className="history-table">
              <thead>
                <tr>
                  <th scope="col" className="history-table__tool">Tool</th>
                  <th scope="col">Run</th>
                  <th scope="col" className="history-table__date">Date</th>
                  <th scope="col" className="history-table__actions-head"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const display = historyToolDisplay(item.tool_name)
                  const href = historyRunHref(item)
                  const label = runLabel(item)
                  const registryTool = display.kind === 'tool' ? getToolByHistoryName(item.tool_name) : null
                  const nextTool = registryTool
                    ? toolList.find(
                        (candidate) =>
                          candidate.id === getNextStepToolId(registryTool.id, item.metadata),
                      )
                    : null
                  const workspaceLabel = item.workspace?.label
                  const editing = editingId === item.id
                  const summary = item.metadata.summary_headline

                  const note =
                    display.kind === 'cv-studio'
                      ? 'Older CV Studio run'
                      : display.kind === 'application-drafts'
                        ? 'Application draft'
                        : null

                  return (
                    <tr key={item.id} className="history-row">
                      <td className="history-table__tool">
                        <span className="history-tool">{display.label}</span>
                      </td>
                      <td className="history-table__run">
                        {editing ? (
                          <form
                            className="history-rename"
                            onSubmit={(event) => {
                              event.preventDefault()
                              // A run can be renamed but never left without a name.
                              if (!editDraft.trim()) return
                              renameMutation.mutate({ historyId: item.id, label: editDraft.trim() })
                            }}
                          >
                            <Input
                              autoFocus
                              aria-label={`Rename ${label}`}
                              value={editDraft}
                              maxLength={200}
                              onChange={(event) => setEditDraft(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Escape') {
                                  event.preventDefault()
                                  setEditingId(null)
                                }
                              }}
                            />
                            <Button
                              type="submit"
                              size="sm"
                              disabled={renameMutation.isPending || !editDraft.trim()}
                            >
                              Save
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingId(null)}
                            >
                              Cancel
                            </Button>
                          </form>
                        ) : (
                          <>
                            <span className="history-run__label">
                              {item.is_favorite ? (
                                <Star size={12} className="history-run__star" fill="currentColor" aria-hidden />
                              ) : null}
                              {label}
                            </span>
                            {summary ? <span className="history-run__note">{summary}</span> : null}
                          </>
                        )}
                        {note ? <span className="history-run__note">{note}</span> : null}
                        {workspaceLabel && workspaceLabel !== label ? (
                          <span className="history-run__note">Workspace: {workspaceLabel}</span>
                        ) : null}
                      </td>
                      <td className="history-table__date">{formatRunDate(item.created_at)}</td>
                      <td className="history-table__actions">
                        <div className="history-actions">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="history-icon-button"
                            aria-label={item.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                            aria-pressed={item.is_favorite}
                            onClick={() =>
                              favoriteToggle.mutate({
                                historyId: item.id,
                                isFavorite: !item.is_favorite,
                              })
                            }
                          >
                            <Star size={14} fill={item.is_favorite ? 'currentColor' : 'none'} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="history-icon-button"
                            aria-label={`Rename ${label}`}
                            onClick={() => {
                              setActionError(null)
                              setEditingId(item.id)
                              setEditDraft(item.label ?? '')
                            }}
                          >
                            <Pencil size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="history-icon-button history-icon-button--danger"
                            aria-label={`Delete ${label}`}
                            disabled={deleteMutation.isPending && deleteMutation.variables === item.id}
                            onClick={() => setDeleteCandidate({ id: item.id, label })}
                          >
                            <Trash2 size={14} />
                          </Button>
                          {nextTool ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="history-continue"
                              disabled={continuingId === item.id}
                              onClick={() => void continueRun(item)}
                            >
                              {continuingId === item.id ? 'Opening…' : `Continue: ${nextTool.shortLabel}`}
                            </Button>
                          ) : null}
                          {href ? (
                            <Link to={href} className="history-open" aria-label={`Open ${label}`}>
                              <span>Open</span>
                              <ArrowRight size={13} aria-hidden />
                            </Link>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : hasFilters ? (
          <div className="history-empty">
            <p className="history-empty__title">No runs match these filters</p>
            <p className="history-empty__text">Try a different tool or search, or clear the filters.</p>
            <div>
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          </div>
        ) : (
          <div className="history-empty">
            <p className="history-empty__title">No runs yet</p>
            <p className="history-empty__text">Run a tool and your saved results will show up here.</p>
            <div>
              <Button asChild size="sm">
                <Link to="/resume">Start with Resume</Link>
              </Button>
            </div>
          </div>
        )}

        {totalPages > 1 ? (
          <nav className="history-pagination" aria-label="History pages">
            <Button
              variant="outline"
              size="sm"
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
              size="sm"
              disabled={page >= totalPages}
              onClick={() => onSearchChange({ page: page + 1 })}
            >
              Next
            </Button>
          </nav>
        ) : null}
      </section>
      <ConfirmDeleteDialog
        open={deleteCandidate !== null}
        title="Delete this saved run?"
        description={
          deleteCandidate
            ? `"${deleteCandidate.label}" will be permanently removed from your history. This cannot be undone.`
            : 'This run will be permanently removed.'
        }
        confirmLabel={deleteMutation.isPending ? 'Deleting…' : 'Delete run'}
        pending={deleteMutation.isPending}
        onCancel={() => setDeleteCandidate(null)}
        onConfirm={() => {
          if (deleteCandidate) deleteMutation.mutate(deleteCandidate.id)
        }}
      />
    </PageFrame>
  )
}
