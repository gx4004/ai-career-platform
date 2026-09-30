import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { History, Pencil, Search, Star, Trash2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { PageHero } from '#/components/app/PageHero'
import { PageFrame } from '#/components/app/PageFrame'
import { AppStatePanel } from '#/components/app/AppStatePanel'
import { ConfirmDeleteDialog } from '#/components/app/ConfirmDeleteDialog'
import { RunRow, RunRowSkeleton, formatRunDate } from '#/components/dashboard/RunRow'
import { SceneVisual } from '#/components/illustrations/SceneVisual'
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
        scene="dashboardHero"
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
      <section className="history-layout content-max">
        <PageHero
          icon={History}
          title="History"
          purpose="Every analysis you have saved, newest first. Reopen a result or continue to the next tool."
          chips={chips}
        />

        <div className="history-toolbar">
          <div className="history-toolbar__search">
            <Search className="history-toolbar__search-icon" size={16} aria-hidden />
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
              className="pl-10"
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
                <span
                  className="history-pill__dot"
                  style={{ background: tool.accent }}
                  aria-hidden
                />
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
          <div className="run-list history-list" aria-hidden>
            {Array.from({ length: 6 }, (_, i) => (
              <RunRowSkeleton key={i} />
            ))}
          </div>
        ) : listQuery.isError ? (
          <div className="section-card history-empty" role="alert">
            <p className="section-title">We couldn&apos;t load your history</p>
            <p className="muted-copy">Check your connection and try again.</p>
            <div>
              <Button variant="outline" onClick={() => void listQuery.refetch()}>
                Retry
              </Button>
            </div>
          </div>
        ) : items.length ? (
          <div className="run-list history-list">
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

              const note =
                display.kind === 'cv-studio'
                  ? 'Older CV Studio run'
                  : display.kind === 'application-drafts'
                    ? 'Application draft'
                    : null
              const notes =
                note || (workspaceLabel && workspaceLabel !== label) ? (
                  <>
                    {note ? <span className="run-row-note">{note}</span> : null}
                    {workspaceLabel && workspaceLabel !== label ? (
                      <span className="run-row-note">Workspace: {workspaceLabel}</span>
                    ) : null}
                  </>
                ) : null

              return (
                <RunRow
                  key={item.id}
                  mode="actions"
                  href={href}
                  tool={display}
                  label={label}
                  date={formatRunDate(item.created_at)}
                  showFavoriteStar={item.is_favorite}
                  summary={item.metadata.summary_headline}
                  notes={notes}
                  editor={
                    editing ? (
                      <form
                        className="history-rename"
                        onSubmit={(event) => {
                          event.preventDefault()
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
                        <Button type="submit" size="sm" disabled={renameMutation.isPending}>
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
                    ) : undefined
                  }
                  actions={
                    <>
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
                        <Star size={15} fill={item.is_favorite ? 'currentColor' : 'none'} />
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
                        <Pencil size={15} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="history-icon-button history-icon-button--danger"
                        aria-label={`Delete ${label}`}
                        disabled={deleteMutation.isPending && deleteMutation.variables === item.id}
                        onClick={() => setDeleteCandidate({ id: item.id, label })}
                      >
                        <Trash2 size={15} />
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
                    </>
                  }
                />
              )
            })}
          </div>
        ) : hasFilters ? (
          <div className="section-card history-empty">
            <p className="section-title">No runs match these filters</p>
            <p className="muted-copy">Try a different tool or search, or clear the filters.</p>
            <div>
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          </div>
        ) : (
          <div className="section-card history-empty">
            <div className="mx-auto w-full max-w-md">
              <SceneVisual scene="emptyPlanning" />
            </div>
            <p className="section-title">No runs yet</p>
            <p className="muted-copy">Run a tool and your saved results will show up here.</p>
            <div>
              <Button asChild className="button-hero-primary" size="lg">
                <Link to="/resume">Start with Resume</Link>
              </Button>
            </div>
          </div>
        )}

        {totalPages > 1 ? (
          <nav className="history-pagination" aria-label="History pages">
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
