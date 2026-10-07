import { Fragment, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Clock, Search, Star, TriangleAlert } from 'lucide-react'
import { ConfirmDeleteDialog } from '#/components/app/ConfirmDeleteDialog'
import { HistoryRow, runLabel } from '#/components/history/HistoryRow'
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  List,
  ListHeading,
  Notice,
  Page,
  PageHeader,
  Pagination,
  Segmented,
  Select,
  Skeleton,
  Stack,
  ToneDot,
  Toolbar,
} from '#/components/kit'
import { useFavoriteToggle } from '#/hooks/useFavoriteToggle'
import { HISTORY_PAGE_SIZE as DEFAULT_PAGE_SIZE, useHistory } from '#/hooks/useHistory'
import { useSession } from '#/hooks/useSession'
import { useAccountQueriesEnabled } from '#/hooks/useAccountQueriesEnabled'
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

// Keeps the header's meta line when the toolbar shows but there is no count (the list failed), so the toolbar does not jump.
// A first-run History has no toolbar and no meta line at all.
const META_PLACEHOLDER = <span key="placeholder" aria-hidden>{'\u00a0'}</span>

// Each option carries the tool's colour as a dot, the same colour its tile has in the list below.
const TOOL_OPTIONS = toolList.map((tool) => ({
  value: tool.id as string,
  label: (
    <>
      <ToneDot tone={tool.tone} lead />
      {tool.shortLabel}
    </>
  ),
  'aria-label': tool.label,
}))

/** "Today", "Yesterday", then "Tuesday, Sep 29" (with the year when it is not this one). */
function dayHeading(value: string, now: Date = new Date()) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Earlier'
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOf(now) - startOf(date)) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  })
}

/** Consecutive runs from the same day share one heading; the API already returns them newest first. */
function groupByDay(items: ToolRunSummary[]) {
  const groups: { heading: string; items: ToolRunSummary[] }[] = []
  for (const item of items) {
    const heading = dayHeading(item.created_at)
    const last = groups[groups.length - 1]
    if (last && last.heading === heading) last.items.push(item)
    else groups.push({ heading, items: [item] })
  }
  return groups
}

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

// The six-option segmented control needs about 64rem beside the search and Favorites (66 keeps a margin for a slower
// font swap). A narrower toolbar (a tablet,
// a laptop with the sidebar open) gets the Select instead: the segmented control would stack the filters three rows deep.
const SEGMENTED_MIN_REM = 66
function useToolbarFitsSegmented() {
  const [node, setNode] = useState<HTMLDivElement | null>(null)
  const [fits, setFits] = useState(true)
  useLayoutEffect(() => {
    if (!node) return
    const update = () => {
      // The toolbar stretches to its column, so its width never depends on which control it holds.
      const width = node.getBoundingClientRect().width
      if (!width) return
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      setFits(width >= SEGMENTED_MIN_REM * rem)
    }
    update()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(node)
    return () => observer?.disconnect()
  }, [node])
  return [setNode, fits] as const
}

export function HistoryPage({
  search,
  onSearchChange,
}: {
  search: HistorySearchState
  /** `replace` swaps the current history entry (a correction the user did not ask for, like leaving a page past the end). */
  onSearchChange: (next: Partial<HistorySearchState>, options?: { replace?: boolean }) => void
}) {
  const navigate = useNavigate()
  const [toolbarRef, toolbarFitsSegmented] = useToolbarFitsSegmented()
  const phone = useCompact()
  const compact = phone || !toolbarFitsSegmented
  const { status, openAuthDialog } = useSession()
  const queryClient = useQueryClient()
  // The list loads once signed in, and also while /auth/me is still answering in a browser that was signed
  // in (it then loads alongside it).
  const listEnabled = useAccountQueriesEnabled()
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
    listEnabled,
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
  // The run that takes the deleted one's place (the next one, else the one before): it gets focus (history-profile-F32).
  // Kept by id, not position: the dialog closes before the list refetches, so the deleted row may still be there.
  const deleteNeighbour = useRef<string | null>(null)
  const headerRef = useRef<HTMLElement | null>(null)

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
  // A page past the end (its last runs were deleted, or the URL asks for page 9 of 2) holds nothing while
  // other runs exist: go to the last page that has some instead of showing an empty list.
  const pastTheEnd = Boolean(listQuery.data && listQuery.data.items.length === 0 && listQuery.data.total > 0 && page > 1)
  const searchChange = useRef(onSearchChange)
  searchChange.current = onSearchChange
  useEffect(() => {
    if (pastTheEnd) searchChange.current({ page: totalPages }, { replace: true })
  }, [pastTheEnd, totalPages])

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

  // Only a known guest gets the sign-in prompt. While the session resolves (or a signed-in browser cannot
  // reach the server) the signed-in layout renders with its skeleton rows, so nobody sees a guest flash.
  if (status === 'guest') {
    return (
      <Page>
        <PageHeader title="History" />
        <EmptyState
          icon={<Clock />}
          title="Pick up where you left off"
          description="Your saved runs and starred results live here — sign in to unlock your full history."
          // One action, as every signed-in-only page's guest gate (STICKER 4.O, consistency-F25).
          action={<Button onClick={() => openAuthDialog({ to: '/history', reason: 'history' })}>Sign in</Button>}
        />
      </Page>
    )
  }

  const items = listQuery.data?.items ?? []
  const labelById = new Map(items.map((run) => [run.id, runLabel(run)]))
  const errorMessage = actionError ?? (favoriteToggle.error
    ? favoriteToggle.error instanceof Error
      ? favoriteToggle.error.message
      : "The star couldn't be updated."
    : null)
  // With a search or filter the total counts matches, not the user's history: say so.
  const runCount = !listQuery.data
    ? null
    : hasFilters
      ? `${listQuery.data.total} ${listQuery.data.total === 1 ? 'match' : 'matches'}`
      : listQuery.data.total > 0
        ? `${listQuery.data.total} ${listQuery.data.total === 1 ? 'run' : 'runs'}`
        : null

  // Clear filters lives in the header line beside the match count ("2 matches · Clear filters"): in the toolbar it
  // wrapped onto a line of its own beside the six-option Segmented control and pushed the list down when a filter
  // was chosen. On a phone the Filters sheet carries it too.
  const clearFiltersLink = activeFilters > 0 ? (
    <Button key="clear" type="button" variant="link" size="sm" onClick={clearFilters}>
      Clear filters
    </Button>
  ) : null

  // Nothing to search or filter yet: the first-run empty state stands alone, with no toolbar.
  const firstRun = Boolean(listQuery.data && listQuery.data.total === 0 && !hasFilters)

  return (
    <Page>
      <PageHeader
        ref={headerRef}
        title="History"
        // The placeholder only keeps the toolbar from jumping; with no toolbar there is no header line at all, so the
        // empty state starts where it does on every other empty page (consistency-F19).
        meta={listQuery.isPending
          ? [<Skeleton key="count" size="meta" width="3.5rem" />]
          : firstRun ? undefined : [runCount ?? META_PLACEHOLDER, clearFiltersLink]}
      />

      <Stack gap={3}>
        {firstRun ? null : (
          <Toolbar
            ref={toolbarRef}
            filtersDescription="Show runs from one tool, or only starred ones."
            search={
              <Input
                ref={searchRef}
                type="search"
                aria-label="Search saved runs by label"
                leading={<Search aria-hidden />}
                clearable
                value={searchInput}
                placeholder="Search runs"
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
                  Starred
                </Button>
              </>
            }
            activeFilters={activeFilters}
            onClearFilters={phone ? clearFilters : undefined}
          />
        )}

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

        {listQuery.isPending || pastTheEnd ? (
          <>
            <p className="kit-sr-only" role="status">
              Loading saved runs
            </p>
            <List aria-busy aria-label="Saved runs">
              <Skeleton variant="row" as="li" heading count={6} leading="tile" lines={2} narrowLines={4} />
            </List>
          </>
        ) : listQuery.isError ? (
          <ErrorState
            icon={<TriangleAlert />}
            title="We couldn’t load your history"
            description="Something went wrong on our side. Try again in a moment."
            onRetry={() => void listQuery.refetch()}
            retrying={listQuery.isFetching}
          />
        ) : items.length ? (
          <List aria-label="Saved runs">
            {groupByDay(items).map((group) => (
              <Fragment key={group.heading}>
                <ListHeading>{group.heading}</ListHeading>
                {group.items.map((item) => (
                  <HistoryRow
                    key={item.id}
                    item={item}
                    parentLabel={item.parent_run_id ? (labelById.get(item.parent_run_id) ?? null) : null}
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
                      const at = items.indexOf(item)
                      deleteNeighbour.current = (items[at + 1] ?? items[at - 1])?.id ?? null
                      setDeleteError(null)
                      deleteTrigger.current = trigger
                      setDeleteCandidate({ id: item.id, label: runLabel(item) })
                    }}
                  />
                ))}
              </Fragment>
            ))}
          </List>
        ) : hasFilters ? (
          activeFilters === 0 ? (
            // Only words were typed: talk about the search (no filter is set to clear).
            <EmptyState
              icon={<Search />}
              title={`No runs match “${search.q ?? ''}”`}
              description="Try another word, or clear the search."
              action={
                <Button variant="secondary" onClick={clearFilters}>
                  Clear search
                </Button>
              }
            />
          ) : (
            // The header line beside the count already offers Clear filters; the empty state does not repeat it.
            <EmptyState
              icon={<Search />}
              title="No runs match these filters"
              description="Try a different tool or search, or clear the filters."
            />
          )
        ) : total === 0 ? (
          <EmptyState
            icon={<Clock />}
            title="No runs yet"
            description="Run a tool and your saved results will show up here."
            action={
              <Button asChild>
                <Link to="/resume">Start with Resume</Link>
              </Button>
            }
          />
        ) : null}

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
            ? `“${deleteCandidate.label}” will be permanently removed from your history. This cannot be undone.`
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
          if (!deleted.current && trigger?.isConnected) {
            trigger.focus()
            return
          }
          // Never the search field: on a phone or tablet it raises the keyboard over the list that just changed.
          // The run that took the deleted one's place (its title link), else the page title.
          window.requestAnimationFrame(() => {
            const id = deleteNeighbour.current
            const row = id
              ? Array.from(document.querySelectorAll<HTMLElement>('.history-row')).find((node) => node.dataset.runId === id)
              : null
            // A run with no result page (an older draft) has no title link: its first visible action instead.
            const link =
              row?.querySelector<HTMLElement>('a.kit-row__title') ??
              Array.from(row?.querySelectorAll<HTMLElement>('.kit-row__actions button') ?? []).find((node) => node.offsetParent !== null)
            if (link) {
              link.focus()
              return
            }
            const heading = headerRef.current?.querySelector('h1')
            if (!heading) return
            heading.setAttribute('tabindex', '-1')
            heading.focus({ preventScroll: true })
          })
        }}
      >
        {deleteError ? <Notice tone="danger">{deleteError}</Notice> : null}
      </ConfirmDeleteDialog>
    </Page>
  )
}
