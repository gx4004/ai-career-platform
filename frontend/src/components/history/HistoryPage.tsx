import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Search, Star } from 'lucide-react'
import { ConfirmDeleteDialog } from '#/components/app/ConfirmDeleteDialog'
import { HistoryRow, runLabel } from '#/components/history/HistoryRow'
import {
  Button,
  Cluster,
  EmptyState,
  ErrorState,
  Input,
  List,
  Notice,
  Page,
  PageHeader,
  Pagination,
  Segmented,
  Select,
  Skeleton,
  Stack,
  Toolbar,
} from '#/components/kit'
import { useFavoriteToggle } from '#/hooks/useFavoriteToggle'
import { useHistory } from '#/hooks/useHistory'
import { useSession } from '#/hooks/useSession'
import { deleteHistoryItem, getHistoryItem, updateHistoryItem } from '#/lib/api/client'
import type { ToolRunSummary } from '#/lib/api/schemas'
import { writeWorkflowContext } from '#/lib/tools/drafts'
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

// Keeps the header's meta line when there is no count to show (nothing saved yet, or the list failed), so the toolbar does not jump.
const META_PLACEHOLDER = <span key="placeholder" aria-hidden>{'\u00a0'}</span>

const TOOL_OPTIONS = toolList.map((tool) => ({
  value: tool.id as string,
  label: tool.shortLabel,
  'aria-label': tool.label,
}))

// The kit's compact width (the Toolbar moves its filters into a sheet): a six-option segmented control would only scroll there.
const COMPACT_QUERY = '(max-width: 767px)'
function useCompact() {
  return useSyncExternalStore(
    (notify) => {
      if (typeof window.matchMedia !== 'function') return () => {}
      const query = window.matchMedia(COMPACT_QUERY)
      query.addEventListener('change', notify)
      return () => query.removeEventListener('change', notify)
    },
    () => typeof window.matchMedia === 'function' && window.matchMedia(COMPACT_QUERY).matches,
    () => false,
  )
}

export function HistoryPage({
  search,
  onSearchChange,
}: {
  search: HistorySearchState
  onSearchChange: (next: Partial<HistorySearchState>) => void
}) {
  const navigate = useNavigate()
  const compact = useCompact()
  const { status, openAuthDialog } = useSession()
  const queryClient = useQueryClient()
  const authenticated = status === 'authenticated'
  const page = search.page ?? 1
  const pageSize = search.page_size ?? DEFAULT_PAGE_SIZE
  // The search box sits outside the Filters sheet, so it is not counted there; it still makes an empty list "no match".
  const activeFilters = [search.tool, search.favorite].filter(Boolean).length
  const hasFilters = activeFilters > 0 || Boolean(search.q)

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
  const searchRef = useRef<HTMLInputElement | null>(null)

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
  const favoriteToggle = useFavoriteToggle()
  const [actionError, setActionError] = useState<string | null>(null)
  const [continuingId, setContinuingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const [deleteCandidate, setDeleteCandidate] = useState<{ id: string; label: string } | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const deleteTrigger = useRef<HTMLElement | null>(null)
  const deleted = useRef(false)

  const deleteMutation = useMutation({
    mutationFn: deleteHistoryItem,
    onSuccess: async (_response, historyId) => {
      deleted.current = true
      setDeleteCandidate(null)
      queryClient.removeQueries({ queryKey: ['tool-run', historyId], exact: true })
      await queryClient.invalidateQueries({ queryKey: ['history-page'] })
    },
    onError: (error) => {
      setDeleteError(error instanceof Error ? error.message : 'Failed to delete run.')
    },
  })
  const renameMutation = useMutation({
    mutationFn: ({ historyId, label }: { historyId: string; label: string }) =>
      updateHistoryItem(historyId, label),
    onSuccess: async () => {
      setEditingId(null)
      setRenameError(null)
      await queryClient.invalidateQueries({ queryKey: ['history-page'] })
    },
    onError: (error) => {
      setRenameError(error instanceof Error ? error.message : 'Failed to update saved run.')
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

  function startRename(item: ToolRunSummary) {
    setActionError(null)
    setRenameError(null)
    setEditingId(item.id)
    setEditDraft(item.label ?? '')
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
      <Page>
        <PageHeader title="History" />
        <EmptyState
          title="Pick up where you left off"
          description="Your saved runs and favorites live here — sign in to unlock your full history."
          action={
            <Cluster gap={2}>
              <Button onClick={() => openAuthDialog({ to: '/history', reason: 'history' })}>Sign in</Button>
              <Button asChild variant="secondary">
                <Link to="/resume">Start with Resume</Link>
              </Button>
            </Cluster>
          }
        />
      </Page>
    )
  }

  const items = listQuery.data?.items ?? []
  const errorMessage = actionError ?? (favoriteToggle.error
    ? favoriteToggle.error instanceof Error
      ? favoriteToggle.error.message
      : 'Failed to update favorite.'
    : null)
  const runCount =
    listQuery.data && (listQuery.data.total > 0 || hasFilters)
      ? `${listQuery.data.total} ${listQuery.data.total === 1 ? 'run' : 'runs'}`
      : null

  return (
    <Page>
      <PageHeader
        title="History"
        meta={listQuery.isPending ? [<Skeleton key="count" size="meta" width="3.5rem" />] : [runCount ?? META_PLACEHOLDER]}
      />

      <Stack gap={3}>
        <Toolbar
          search={
            <Input
              ref={searchRef}
              type="search"
              aria-label="Search saved runs by label"
              leading={<Search aria-hidden />}
              clearable
              value={searchInput}
              placeholder="Search by saved label"
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
              onClear={() => {
                if (searchDebounceRef.current !== null) window.clearTimeout(searchDebounceRef.current)
                onSearchChange({ q: undefined, page: 1 })
              }}
            />
          }
          filters={
            <>
              {compact ? (
                <Select
                  aria-label="Filter by tool"
                  value={search.tool ?? ''}
                  onChange={(event) => onSearchChange({ tool: event.target.value || undefined, page: 1 })}
                >
                  <option value="">All tools</option>
                  {toolList.map((tool) => (
                    <option key={tool.id} value={tool.id}>
                      {tool.label}
                    </option>
                  ))}
                </Select>
              ) : (
                <Segmented
                  aria-label="Filter by tool"
                  deselectable
                  options={TOOL_OPTIONS}
                  value={search.tool ?? null}
                  onValueChange={(tool) => onSearchChange({ tool: tool ?? undefined, page: 1 })}
                />
              )}
              <Button
                variant="secondary"
                aria-pressed={Boolean(search.favorite)}
                onClick={() => onSearchChange({ favorite: search.favorite ? undefined : true, page: 1 })}
              >
                <Star fill={search.favorite ? 'currentColor' : 'none'} aria-hidden />
                Favorites
              </Button>
            </>
          }
          activeFilters={activeFilters}
          onClearFilters={clearFilters}
        />

        {errorMessage ? (
          <Notice
            tone="danger"
            onDismiss={() => {
              setActionError(null)
              favoriteToggle.reset?.()
            }}
          >
            {errorMessage}
          </Notice>
        ) : null}

        {listQuery.isPending ? (
          <>
            <p className="kit-sr-only" role="status">
              Loading saved runs
            </p>
            <List aria-busy aria-label="Saved runs">
              <Skeleton variant="row" as="li" count={6} />
            </List>
          </>
        ) : listQuery.isError ? (
          <ErrorState
            title="We couldn't load your history"
            description="Check your connection and try again."
            retryLabel="Retry"
            onRetry={() => void listQuery.refetch()}
            retrying={listQuery.isFetching}
          />
        ) : items.length ? (
          <List aria-label="Saved runs">
            {items.map((item) => (
              <HistoryRow
                key={item.id}
                item={item}
                rename={
                  editingId === item.id
                    ? {
                        draft: editDraft,
                        error: renameError,
                        pending: renameMutation.isPending,
                        onDraftChange: setEditDraft,
                        onSubmit: () => renameMutation.mutate({ historyId: item.id, label: editDraft.trim() }),
                        onCancel: () => {
                          setEditingId(null)
                          setRenameError(null)
                        },
                      }
                    : null
                }
                continuing={continuingId === item.id}
                deleting={deleteMutation.isPending && deleteMutation.variables === item.id}
                onStartRename={() => startRename(item)}
                onToggleFavorite={() =>
                  favoriteToggle.mutate({ historyId: item.id, isFavorite: !item.is_favorite })
                }
                onContinue={() => void continueRun(item)}
                onDelete={(trigger) => {
                  deleted.current = false
                  setDeleteError(null)
                  deleteTrigger.current = trigger
                  setDeleteCandidate({ id: item.id, label: runLabel(item) })
                }}
              />
            ))}
          </List>
        ) : hasFilters ? (
          <EmptyState
            title="No runs match these filters"
            description="Try a different tool or search, or clear the filters."
            action={
              // Where the toolbar shows its own "Clear filters" link the empty state does not repeat it.
              compact || activeFilters === 0 ? (
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <EmptyState
            title="No runs yet"
            description="Run a tool and your saved results will show up here."
            action={
              <Button asChild size="sm">
                <Link to="/resume">Start with Resume</Link>
              </Button>
            }
          />
        )}

        <Pagination
          variant="simple"
          aria-label="History pages"
          page={page}
          pageCount={totalPages}
          onPageChange={(next) => onSearchChange({ page: next })}
        />
      </Stack>

      <ConfirmDeleteDialog
        open={deleteCandidate !== null}
        title="Delete this saved run?"
        description={
          deleteCandidate
            ? `"${deleteCandidate.label}" will be permanently removed from your history. This cannot be undone.`
            : 'This run will be permanently removed.'
        }
        confirmLabel="Delete run"
        pending={deleteMutation.isPending}
        onCancel={() => {
          setDeleteCandidate(null)
          setDeleteError(null)
        }}
        onConfirm={() => {
          setDeleteError(null)
          if (deleteCandidate) deleteMutation.mutate(deleteCandidate.id)
        }}
        onCloseAutoFocus={(event) => {
          // The row that opened the dialog is gone once it was deleted; otherwise focus goes back to its button.
          event.preventDefault()
          const trigger = deleteTrigger.current
          if (!deleted.current && trigger?.isConnected) trigger.focus()
          else searchRef.current?.focus()
        }}
      >
        {deleteError ? <Notice tone="danger">{deleteError}</Notice> : null}
      </ConfirmDeleteDialog>
    </Page>
  )
}
