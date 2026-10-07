import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, FileText, FileUp, ListChecks, Plus, Trash2, TriangleAlert, X } from 'lucide-react'
import {
  Badge, Button, ConfirmDialog, EmptyState, ErrorState, List, MetaRow, Notice, Page, PageHeader, Panel, PanelBody,
  PanelHeader, ScoreSeal, Section, Skeleton, Stack, Sticker, useToast,
} from '#/components/kit'
import { useSession } from '#/hooks/useSession'
import { useResumeCarry } from '#/hooks/use-resume-carry'
import { useBreakpoint } from '#/hooks/use-breakpoint'
import {
  confirmEvidenceItem,
  confirmEvidenceItems,
  createEvidenceItem,
  deleteEvidenceItem,
  deleteEvidenceProfile,
  importEvidenceFromResume,
  listEvidenceItems,
  updateEvidenceItem,
} from '#/lib/api/client'
import type { EvidenceItem, EvidenceKind } from '#/lib/api/schemas'
import {
  KIND_SINGULAR_LABELS,
  PROFILE_PURGE_CONFIRM,
  PROFILE_PURGE_TITLE,
  PROVENANCE_DESCRIPTIONS,
  PROVENANCE_LABELS,
  contentEntries,
  countByState,
  factDetailLine,
  factDisplay,
  groupItemsByKind,
} from '#/lib/profile/evidence'
import { useSessionHint } from '#/lib/auth/sessionHint'
import { EVIDENCE_QUERY_KEY, invalidateEvidenceCaches } from '#/lib/query/evidenceCaches'
import { AddFactDialog } from '#/components/profile/AddFactDialog'
import { useCareerDataExport } from '#/components/profile/DataControls'
import { EditFactDialog } from '#/components/profile/EditFactDialog'
import { FactRow } from '#/components/profile/FactRow'
import { SkillsToBuildSection } from '#/components/profile/SkillsToBuildSection'

/** How long Save all waits before it writes, so the toast's Undo is a real undo. */
const SAVE_ALL_UNDO_MS = 6000
/** How long a fact that just landed (or was linked to) keeps its quiet highlight. */
const MOMENT_MS = 3200

type ImportOutcome = { found: number; message?: string }

/** The first non-empty value: how a fact is named in buttons and menus. */
function previewText(item: EvidenceItem): string {
  return contentEntries(item.content).find((entry) => entry.value)?.value || 'No details recorded'
}

/**
 * One row template for every kind: the first value leads, the rest follow as plain lines. A saved row under its
 * kind heading only says what is not already obvious (where a fact came from, when it was not typed); a suggestion
 * also names its kind, since it sits in a list of its own.
 */
function evidenceRow(item: EvidenceItem) {
  const { title, fields } = factDisplay(item)
  const filled = fields.filter((field) => field.value && field.value !== '—')
  const lead = title ?? filled[0]?.value ?? 'No details recorded'
  const rest = title ? [] : filled.slice(1)
  const provenance = PROVENANCE_LABELS[item.provenance]
  const meta = [
    item.confirmation_state === 'unconfirmed' ? KIND_SINGULAR_LABELS[item.kind] : null,
    item.provenance !== 'user-entered' ? (
      <span key="source" title={PROVENANCE_DESCRIPTIONS[item.provenance]}>
        <span aria-hidden="true">{provenance}</span>
        <span className="kit-sr-only">Source: {provenance}. {PROVENANCE_DESCRIPTIONS[item.provenance]}</span>
      </span>
    ) : null,
  ]
  // A fact typed by hand with one value has nothing under its title: no empty line to pad the row.
  const details = rest.length > 0 || meta.some(Boolean) ? (
    <>
      {rest.map((field) => <div key={field.key} className="profile-line">{factDetailLine(item, field)}</div>)}
      <MetaRow>{meta}</MetaRow>
    </>
  ) : undefined
  return { lead, details }
}

/**
 * The suggestions scroll inside their sticky panel on a desktop. Mark which ends still have rows out of view
 * (data-overflow="start end") so the CSS fades that edge: a row cut by the frame then reads as "more below".
 * Written to the DOM directly: it changes on every scroll and is presentation only.
 */
function trackScrollEdges(element: HTMLElement | null) {
  if (!element) return
  const update = () => {
    const max = element.scrollHeight - element.clientHeight
    const offset = element.scrollTop
    const edges = [offset > 1 ? 'start' : '', max > 1 && offset < max - 1 ? 'end' : ''].filter(Boolean).join(' ')
    if (edges) element.dataset.overflow = edges
    else delete element.dataset.overflow
  }
  update()
  element.addEventListener('scroll', update, { passive: true })
  // The window's height and rows arriving or leaving both change what fits.
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
  observer?.observe(element)
  const children = typeof MutationObserver === 'undefined' ? null : new MutationObserver(update)
  children?.observe(element, { childList: true })
  return () => {
    element.removeEventListener('scroll', update)
    observer?.disconnect()
    children?.disconnect()
  }
}

/** What Delete profile removes, counted as the header counts it: "your 2 saved facts and 10 suggestions". */
function purgeScope({ confirmed, unconfirmed }: { confirmed: number; unconfirmed: number }): string {
  const saved = confirmed === 1 ? 'one saved fact' : `${confirmed} saved facts`
  const suggested = unconfirmed === 1 ? 'one suggestion' : `${unconfirmed} suggestions`
  if (confirmed > 0 && unconfirmed > 0) return `your ${saved} and ${suggested}`
  return `your ${confirmed > 0 ? saved : suggested}`
}

/** Headings take focus only from script (tabindex -1), so a screen reader lands on them and Tab continues from there. */
function focusHeading(heading: HTMLElement | null) {
  if (!heading) return
  heading.setAttribute('tabindex', '-1')
  heading.focus({ preventScroll: true })
}

function SavedFactsSkeleton() {
  return <List aria-label="Saved facts" aria-busy="true" className="profile-skeleton"><Skeleton variant="row" as="li" count={4} /></List>
}

/**
 * Whether this tab last saw the profile with suggestions, so the loading page keeps the loaded page's columns
 * (consistency-F10: a one-column skeleton turned into two columns when the suggestions arrived). Tab-scoped, like the
 * workflow context; a blocked or empty store just means one column.
 */
const SPLIT_HINT_KEY = 'cw:profile-split'

function readSplitHint() {
  try {
    return window.sessionStorage.getItem(SPLIT_HINT_KEY) === '1'
  } catch {
    return false
  }
}

function writeSplitHint(split: boolean) {
  try {
    if (split) window.sessionStorage.setItem(SPLIT_HINT_KEY, '1')
    else window.sessionStorage.removeItem(SPLIT_HINT_KEY)
  } catch {
    // Storage blocked: the next load starts in one column.
  }
}

/**
 * Whether this tab last saw the profile empty. The header's Add a fact and import action do not depend on the facts,
 * so they show while the facts load (consistency-F27: they appeared only when the data landed, and the page jumped);
 * only a profile this tab last saw empty, which has no header actions, holds them back (history-profile-F37).
 */
const EMPTY_HINT_KEY = 'cw:profile-empty'

function readEmptyHint() {
  try {
    return window.sessionStorage.getItem(EMPTY_HINT_KEY) === '1'
  } catch {
    return false
  }
}

function writeEmptyHint(empty: boolean) {
  try {
    if (empty) window.sessionStorage.setItem(EMPTY_HINT_KEY, '1')
    else window.sessionStorage.removeItem(EMPTY_HINT_KEY)
  } catch {
    // Storage blocked: the next load shows the actions while it loads.
  }
}

/** The suggestions panel while the facts load: its lemon header (the title is known, the count is not) and two row placeholders. */
function SuggestionsSkeleton() {
  return (
    <Panel flush className="profile-suggestions">
      <PanelHeader title="Suggestions to review" tone="lemon" />
      <PanelBody flush>
        <List framed={false} aria-label="Suggestions to review" aria-busy="true">
          <Skeleton variant="row" as="li" count={2} />
        </List>
      </PanelBody>
    </Panel>
  )
}

export function EvidenceProfilePage({
  startAdding = false,
  onStartHandled,
}: {
  /** Open Add a fact once on arrival (the dashboard's "Add skills"). */
  startAdding?: boolean
  onStartHandled?: () => void
} = {}) {
  const { status, openAuthDialog } = useSession()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const exporter = useCareerDataExport()
  const isAuthenticated = status === 'authenticated'
  const { hasResume, resumeText } = useResumeCarry()
  const [importOutcome, setImportOutcome] = useState<ImportOutcome | null>(null)
  const [importedText, setImportedText] = useState<string | null>(null)
  const [pendingItemId, setPendingItemId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<EvidenceItem | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<EvidenceItem | null>(null)
  const [purgeOpen, setPurgeOpen] = useState(false)
  // Where focus goes once a delete has gone through and its trigger is gone: the saved fact that took the deleted
  // one's place (null: the Saved facts heading), or the page title after a purge. Null while nothing was deleted.
  const afterDelete = useRef<{ focusId: string | null } | 'purged' | null>(null)
  const headerRef = useRef<HTMLElement | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  // Add a fact opened by the dashboard's link has no trigger behind it: closing it hands focus to the header's
  // Add a fact button (or the page title), never to the page body (history-profile-F31).
  const addFromLink = useRef(false)
  const addButtonRef = useRef<HTMLButtonElement | null>(null)
  // A phone keeps the import sticker on one row: the seal steps down so the text keeps a readable width (F28).
  const phone = useBreakpoint() === 'mobile'
  // Arrived from "Add skills": open the dialog once, when the session is known (a guest cannot save facts).
  const startHandled = useRef(false)
  useEffect(() => {
    if (!startAdding || startHandled.current || status === 'loading' || status === 'unreachable') return
    startHandled.current = true
    if (status === 'authenticated') {
      setAddError(null)
      addFromLink.current = true
      setAddOpen(true)
    }
    onStartHandled?.()
  }, [startAdding, status, onStartHandled])
  // Save all waits a few seconds so Undo can be honest; the ids wait here, shown as saved, until it writes.
  const [queuedIds, setQueuedIds] = useState<string[]>([])
  const queue = useRef<{ ids: string[]; timer: number } | null>(null)
  const [arrivedIds, setArrivedIds] = useState<ReadonlySet<string>>(new Set())
  const [foundId, setFoundId] = useState<string | null>(null)

  const itemsQuery = useQuery({
    queryKey: EVIDENCE_QUERY_KEY,
    queryFn: async () => (await listEvidenceItems()).items,
    enabled: isAuthenticated,
  })

  function reportError(error: unknown, fallback: string) {
    setActionError(error instanceof Error ? error.message : fallback)
  }

  async function invalidateProfile() {
    await invalidateEvidenceCaches(queryClient, { rankingMayChange: true })
  }

  // Import stores every extracted fact as a suggestion; nothing is trusted until the owner saves it (D-062).
  // The API skips facts the profile already holds, so a repeat import of the same CV adds nothing; the button
  // says so ("Imported") until a different CV is carried in.
  const importMutation = useMutation({
    mutationFn: (text: string) => importEvidenceFromResume(text),
    onSuccess: async ({ items: imported }, text) => {
      setImportedText(text)
      const known = queryClient.getQueryData<EvidenceItem[]>(EVIDENCE_QUERY_KEY) ?? []
      setImportOutcome(
        imported.length > 0
          ? { found: imported.length }
          : {
              found: 0,
              message: known.length > 0
                ? 'Everything in your CV is already on your profile.'
                : 'We could not find any facts in your CV to suggest.',
            },
      )
      await queryClient.invalidateQueries({ queryKey: EVIDENCE_QUERY_KEY })
    },
    onError: (error) => reportError(error, 'Could not import from your CV.'),
  })

  const saveMutation = useMutation({
    mutationFn: (id: string) => confirmEvidenceItem(id),
    onSuccess: invalidateProfile,
    onError: (error) => reportError(error, 'Could not save the suggestion.'),
    onSettled: () => setPendingItemId(null),
  })

  const saveAllMutation = useMutation({
    mutationFn: (ids: string[]) => confirmEvidenceItems(ids),
    onSuccess: invalidateProfile,
    onError: (error) => reportError(error, 'Could not save every suggestion.'),
    onSettled: () => setQueuedIds([]),
  })

  // Dismissing a suggestion deletes it; no trace is kept.
  const dismissMutation = useMutation({
    mutationFn: (id: string) => deleteEvidenceItem(id),
    onSuccess: invalidateProfile,
    onError: (error) => reportError(error, 'Could not dismiss the suggestion.'),
    onSettled: () => setPendingItemId(null),
  })

  // An edit is the owner typing it, so the API saves it directly (#321).
  const editMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: Record<string, unknown> }) =>
      updateEvidenceItem(id, { content }),
    onSuccess: async () => {
      setEditTarget(null)
      await invalidateProfile()
    },
    onError: (error) =>
      setEditError(error instanceof Error ? error.message : 'Could not save your changes.'),
  })

  // A fact typed by hand is `user-entered`, which the API stores as saved.
  const addMutation = useMutation({
    mutationFn: ({ kind, content }: { kind: EvidenceKind; content: Record<string, string> }) =>
      createEvidenceItem({ kind, content, provenance: 'user-entered' }),
    onSuccess: async (created) => {
      setAddOpen(false)
      setAddError(null)
      await invalidateProfile()
      setFoundId(created.id)
      toast({ tone: 'success', title: 'Saved to your profile' })
    },
    onError: (error) => setAddError(error instanceof Error ? error.message : 'Could not save the fact.'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteEvidenceItem(id),
    onSuccess: async (_response, id) => {
      // The next saved fact in the same group takes focus (the previous one for the last row); none left: the heading.
      const siblings = groups.find((group) => group.items.some((item) => item.id === id))?.items ?? []
      const index = siblings.findIndex((item) => item.id === id)
      const neighbour = siblings[index + 1] ?? siblings[index - 1]
      afterDelete.current = { focusId: neighbour ? `fact-${neighbour.id}` : null }
      await invalidateProfile()
    },
    onError: (error) => reportError(error, 'Could not delete the fact.'),
    onSettled: () => setDeleteTarget(null),
  })

  const purgeMutation = useMutation({
    mutationFn: () => deleteEvidenceProfile(),
    onSuccess: async () => {
      afterDelete.current = 'purged'
      await invalidateProfile()
      toast({ tone: 'success', title: 'Your profile was deleted' })
    },
    onError: (error) => reportError(error, 'Could not delete the profile.'),
    onSettled: () => setPurgeOpen(false),
  })

  /** A confirm dialog closed: after a delete its trigger is gone, so focus goes somewhere that still makes sense. */
  function focusAfterAdd(event: Event) {
    if (!addFromLink.current) return // Opened by a button: the kit hands focus back to it.
    addFromLink.current = false
    event.preventDefault()
    window.requestAnimationFrame(() => {
      const button = addButtonRef.current
      if (button?.isConnected) button.focus()
      else focusHeading(headerRef.current?.querySelector('h1') ?? null)
    })
  }

  function focusAfterDelete(event: Event) {
    const target = afterDelete.current
    afterDelete.current = null
    if (!target) return // Cancelled: the kit hands focus back to the button that opened the dialog.
    event.preventDefault()
    // The list re-renders without the deleted row first; focus waits for that frame.
    window.requestAnimationFrame(() => {
      if (target === 'purged') {
        window.scrollTo({ top: 0 })
        focusHeading(headerRef.current?.querySelector('h1') ?? null)
        return
      }
      const row = target.focusId ? document.getElementById(target.focusId) : null
      if (row) row.focus()
      else focusHeading(document.getElementById('saved-facts-heading'))
    })
  }

  // Leaving the page (or closing the tab) with a Save all still waiting writes it now: the owner asked for it.
  const flushQueue = useCallback(() => {
    const waiting = queue.current
    if (!waiting) return
    window.clearTimeout(waiting.timer)
    queue.current = null
    confirmEvidenceItems(waiting.ids)
      .then(() => invalidateEvidenceCaches(queryClient, { rankingMayChange: true }))
      .catch(() => {})
  }, [queryClient])

  useEffect(() => {
    window.addEventListener('pagehide', flushQueue)
    return () => {
      window.removeEventListener('pagehide', flushQueue)
      flushQueue()
    }
  }, [flushQueue])

  function saveAll(newIds: string[]) {
    // A second Save all inside the window joins the first batch instead of replacing it.
    const ids = [...new Set([...(queue.current?.ids ?? []), ...newIds])]
    if (queue.current) window.clearTimeout(queue.current.timer)
    const waiting = { ids, timer: 0 }
    const write = () => {
      queue.current = null
      saveAllMutation.mutate(ids)
    }
    waiting.timer = window.setTimeout(write, SAVE_ALL_UNDO_MS)
    queue.current = waiting
    setQueuedIds(ids)
    toast({
      id: 'profile-save-all',
      tone: 'success',
      title: `Saved ${ids.length} ${ids.length === 1 ? 'fact' : 'facts'}`,
      duration: SAVE_ALL_UNDO_MS,
      action: {
        label: 'Undo',
        onClick: () => {
          if (queue.current) window.clearTimeout(queue.current.timer)
          queue.current = null
          setQueuedIds([])
        },
      },
    })
  }

  // The list as the owner sees it: facts waiting in a Save all already read as saved.
  const items = useMemo(() => {
    const data = itemsQuery.data ?? []
    if (queuedIds.length === 0) return data
    const queued = new Set(queuedIds)
    return data.map((item) => (queued.has(item.id) ? { ...item, confirmation_state: 'confirmed' as const } : item))
  }, [itemsQuery.data, queuedIds])
  const counts = useMemo(() => countByState(items), [items])
  // Suggestions are listed once, here; the kind groups show saved facts only.
  const suggestions = useMemo(
    () => items.filter((item) => item.confirmation_state === 'unconfirmed'),
    [items],
  )
  const groups = useMemo(
    () => groupItemsByKind(items.filter((item) => item.confirmation_state === 'confirmed')),
    [items],
  )
  // The loading page takes the columns the last load had (read after mount, so the server and the first client
  // render agree); every finished load records them for the next one.
  const [splitHint, setSplitHint] = useState(false)
  useEffect(() => setSplitHint(readSplitHint()), [])
  useEffect(() => {
    if (itemsQuery.isSuccess) writeSplitHint(suggestions.length > 0)
  }, [itemsQuery.isSuccess, suggestions.length])
  const skeletonSplit = splitHint && !itemsQuery.isSuccess && !itemsQuery.isError
  const sessionHint = useSessionHint()
  const [emptyHint, setEmptyHint] = useState(false)
  useEffect(() => setEmptyHint(readEmptyHint()), [])
  useEffect(() => {
    if (itemsQuery.isSuccess) writeEmptyHint((itemsQuery.data ?? []).length === 0)
  }, [itemsQuery.isSuccess, itemsQuery.data])
  // "N facts found, added N suggestions to review" stops being true once every one of them is saved or dismissed.
  const nothingToReview = itemsQuery.isSuccess && suggestions.length === 0
  useEffect(() => {
    if (nothingToReview && queuedIds.length === 0) setImportOutcome((outcome) => (outcome?.found ? null : outcome))
  }, [nothingToReview, queuedIds.length])
  const canImport = hasResume && resumeText.length >= 50
  const alreadyImported = importedText !== null && importedText === resumeText

  // A fact that newly appears among the saved ones lands with a short flourish (saved, added, completed).
  const savedIds = useMemo(
    () => new Set(items.filter((item) => item.confirmation_state === 'confirmed').map((item) => item.id)),
    [items],
  )
  const previousSaved = useRef<ReadonlySet<string> | null>(null)
  useEffect(() => {
    if (!itemsQuery.data) return
    const before = previousSaved.current
    previousSaved.current = savedIds
    if (!before) return
    const landed = [...savedIds].filter((id) => !before.has(id))
    if (landed.length === 0) return
    setArrivedIds(new Set(landed))
    const timer = window.setTimeout(() => setArrivedIds(new Set()), MOMENT_MS)
    return () => window.clearTimeout(timer)
  }, [savedIds, itemsQuery.data])

  // "Show me": scroll to the fact a link pointed at, focus it, and let go of the highlight shortly after.
  // The row may not exist until the list refetches, so this waits for it once, then never moves focus again.
  const focusedFoundId = useRef<string | null>(null)
  useEffect(() => {
    if (!foundId) {
      focusedFoundId.current = null
      return
    }
    if (focusedFoundId.current === foundId) return
    const row = document.getElementById(`fact-${foundId}`)
    if (!row) return
    focusedFoundId.current = foundId
    row.scrollIntoView?.({ block: 'center' })
    row.focus({ preventScroll: true })
  }, [foundId, items])
  useEffect(() => {
    if (!foundId) return
    const timer = window.setTimeout(() => setFoundId(null), MOMENT_MS)
    return () => window.clearTimeout(timer)
  }, [foundId])

  function momentOf(item: EvidenceItem) {
    return foundId === item.id ? ('found' as const) : arrivedIds.has(item.id) ? ('arrived' as const) : undefined
  }

  function openEditor(item: EvidenceItem) {
    setEditError(null)
    setEditTarget(item)
  }
  function withPending(item: EvidenceItem, run: (id: string) => void) {
    setPendingItemId(item.id)
    run(item.id)
  }

  const isEmpty = itemsQuery.isSuccess && items.length === 0
  const factsLoading = !itemsQuery.isSuccess && !itemsQuery.isError
  const importAction = canImport ? (
    alreadyImported ? (
      <Button size={isEmpty ? 'md' : 'sm'} variant="secondary" disabled title="This CV is already imported">
        <Check aria-hidden="true" /> Imported
      </Button>
    ) : (
      <Button size={isEmpty ? 'md' : 'sm'} loading={importMutation.isPending} onClick={() => importMutation.mutate(resumeText)}>
        <FileUp aria-hidden="true" /> Import from your CV
      </Button>
    )
  ) : (
    // The empty state says where the upload happens in its description, so its button keeps one line on a 320px phone
    // (consistency-F18); the header action stands alone and names the tool.
    <Button asChild size={isEmpty ? 'md' : 'sm'}>
      <Link to="/resume"><FileUp aria-hidden="true" /> {isEmpty ? 'Upload a CV' : 'Upload a CV in Resume Analyzer'}</Link>
    </Button>
  )

  // The header's actions: shown while the facts load too (neither needs the list: a fact can be added or a CV imported
  // before it lands), unless this tab last saw the profile empty; an empty profile has none (its one next step is the
  // import sticker, and Saved facts' empty state offers Add a fact).
  const showHeaderActions = itemsQuery.isSuccess ? !isEmpty : factsLoading && !emptyHint
  const headerActions = showHeaderActions ? (
    <>
      <Button
        ref={addButtonRef}
        size="sm"
        variant="secondary"
        onClick={() => {
          setAddError(null)
          addFromLink.current = false
          setAddOpen(true)
        }}
      >
        <Plus aria-hidden="true" /> Add a fact
      </Button>
      {importAction}
    </>
  ) : undefined

  // 'unreachable' is a signed-in browser that cannot reach the server, not a guest: it waits like 'loading' (the
  // service banner explains the outage) instead of asking someone who is signed in to sign in.
  if (status === 'loading' || status === 'unreachable') {
    return (
      <Page>
        {/* Only a browser that was signed in holds the actions' place: a guest's page has none. */}
        <PageHeader
          title="Your profile"
          meta={[<Skeleton key="count" size="meta" width="7rem" />]}
          actions={status === 'unreachable' || sessionHint === true ? headerActions : undefined}
        />
        <div className="profile-layout" data-split={skeletonSplit ? 'true' : undefined}>
          {skeletonSplit ? <SuggestionsSkeleton /> : null}
          <Section title="Saved facts">
            <SavedFactsSkeleton />
          </Section>
        </div>
      </Page>
    )
  }

  if (!isAuthenticated) {
    return (
      <Page>
        <PageHeader title="Your profile" />
        <EmptyState
          icon={<ListChecks />}
          title="Your facts, in one place"
          description="Sign in to keep the facts about your experience that CV Studio and the tools reuse. Save what you stand behind, and remove anything you do not."
          // One action, as every signed-in-only page's guest gate (STICKER 4.O, consistency-F25).
          action={<Button type="button" onClick={() => openAuthDialog({ to: '/profile', reason: 'account' })}>Sign in</Button>}
        />
      </Page>
    )
  }

  const meta = itemsQuery.isError
    ? []
    : itemsQuery.data
      ? items.length > 0
        ? [
            `${counts.confirmed} saved ${counts.confirmed === 1 ? 'fact' : 'facts'}`,
            counts.unconfirmed > 0 ? `${counts.unconfirmed} to review` : null,
          ]
        : []
      : [<Skeleton key="count" size="meta" width="7rem" />]

  return (
    <Page>
      <PageHeader
        ref={headerRef}
        title="Your profile"
        meta={meta}
        actions={headerActions}
      />

      {actionError ? (
        <Notice tone="danger" onDismiss={() => setActionError(null)}>{actionError}</Notice>
      ) : null}

      {importOutcome && importOutcome.found > 0 ? (
        <Sticker as="section" size="md" tone="white" className="profile-stamp" role="status" aria-label="Import result">
          <div className="profile-stamp__seal" aria-hidden="true">
            <ScoreSeal value={importOutcome.found} unit="facts" label="Facts found" tone="mint" size={phone ? 96 : 132} reveal="stamp" />
          </div>
          <div className="profile-stamp__text">
            <p className="profile-stamp__title">
              {importOutcome.found} {importOutcome.found === 1 ? 'fact' : 'facts'} found
            </p>
            <p>
              Added {importOutcome.found} {importOutcome.found === 1 ? 'suggestion' : 'suggestions'} to review.
            </p>
          </div>
          <Button iconOnly size="sm" variant="ghost" aria-label="Dismiss" onClick={() => setImportOutcome(null)}>
            <X aria-hidden="true" />
          </Button>
        </Sticker>
      ) : importOutcome ? (
        <Notice onDismiss={() => setImportOutcome(null)}>{importOutcome.message}</Notice>
      ) : null}

      {isEmpty ? (
        // The kit's die-cut first-run state, as on Applications, History and CV Studio (consistency-F01).
        <EmptyState
          icon={<FileText />}
          headingLevel={2}
          title="Import from your CV"
          description={canImport
            ? 'We read your CV and suggest the facts in it. Nothing counts until you save it.'
            : 'Upload it in Resume Analyzer: we read it and suggest the facts in it. Nothing counts until you save it.'}
          action={importAction}
        />
      ) : null}

      <div className="profile-layout" data-split={suggestions.length > 0 || skeletonSplit ? 'true' : undefined}>
        {skeletonSplit ? <SuggestionsSkeleton /> : suggestions.length > 0 ? (
          <Panel as="section" flush className="profile-suggestions" aria-labelledby="profile-suggestions-title">
            <PanelHeader
              title={<span id="profile-suggestions-title">Suggestions to review</span>}
              count={suggestions.length}
              countTone="lemon"
              tone="lemon"
              actions={
                suggestions.length > 1 ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={saveAllMutation.isPending}
                    onClick={() => saveAll(suggestions.map((item) => item.id))}
                  >
                    Save all
                  </Button>
                ) : undefined
              }
            />
            <PanelBody flush>
              <p className="profile-suggestions__note">From your CV or a tool. Nothing counts until you save it.</p>
              <List ref={trackScrollEdges} framed={false} aria-label="Suggestions to review" className="profile-suggestions__list">
                {suggestions.map((item) => {
                  const { lead, details } = evidenceRow(item)
                  const busy = pendingItemId === item.id
                  return (
                    <FactRow
                      key={item.id} id={`fact-${item.id}`} moment={momentOf(item)} title={lead} details={details} busy={busy}
                      editLabel={`Edit ${previewText(item)}`} onEdit={() => openEditor(item)} actionsPlacement="below"
                      primary={(
                        <>
                          <Button size="sm" variant="secondary" disabled={busy} aria-label={`Save ${previewText(item)}`} onClick={() => withPending(item, saveMutation.mutate)}>
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" disabled={busy} aria-label={`Dismiss ${previewText(item)}`} onClick={() => withPending(item, dismissMutation.mutate)}>
                            Dismiss
                          </Button>
                        </>
                      )}
                    />
                  )
                })}
              </List>
            </PanelBody>
          </Panel>
        ) : null}

        {itemsQuery.isError ? (
          <ErrorState
            icon={<TriangleAlert />}
            title="Your profile couldn’t be loaded"
            description="Your facts are safe. Try again in a moment."
            onRetry={() => void itemsQuery.refetch()}
            retrying={itemsQuery.isFetching}
          />
        ) : (
          <Section
            id="saved-facts"
            title="Saved facts"
            description={groups.length > 0 ? 'CV Studio and the tools only use saved facts. Edit one to correct it.' : undefined}
            actions={groups.length > 0 ? (
              <Button asChild size="sm" variant="secondary">
                <Link to="/cv-studio" search={{ start: 'profile' }}>Start a CV from these facts</Link>
              </Button>
            ) : undefined}
          >
            {itemsQuery.isPending ? (
              <SavedFactsSkeleton />
            ) : groups.length === 0 ? (
              <EmptyState
                icon={<ListChecks />}
                title={items.length === 0 ? 'No facts yet' : 'Nothing saved yet'}
                description={
                  items.length === 0
                    ? 'Facts you type in are saved straight away. Anything imported from a CV or a tool arrives as a suggestion until you save it.'
                    : 'Save a suggestion and it shows up here.'
                }
                action={items.length === 0 ? (
                  <Button variant="secondary" onClick={() => { setAddError(null); addFromLink.current = false; setAddOpen(true) }}>
                    <Plus aria-hidden="true" /> Add a fact
                  </Button>
                ) : undefined}
              />
            ) : (
              <Stack gap={6}>
                {groups.map((group) => (
                  <Section key={group.kind} headingLevel={3} size="sm" title={group.label} count={group.items.length}>
                    <List aria-label={group.label}>
                      {group.items.map((item) => {
                        const { lead, details } = evidenceRow(item)
                        const busy = pendingItemId === item.id || deleteTarget?.id === item.id
                        const moment = momentOf(item)
                        return (
                          <FactRow
                            key={item.id} id={`fact-${item.id}`} moment={moment} title={lead} details={details} busy={busy}
                            // Icon actions only: they keep the row's end at every width (consistency-F07); 'below' is for
                            // the suggestions' labelled Save and Dismiss.
                            editLabel={`Edit ${previewText(item)}`} onEdit={() => openEditor(item)} actionsPlacement="inline"
                            reveal={(
                              <Button iconOnly size="sm" variant="ghost" disabled={busy} aria-label={`Delete ${previewText(item)}`} onClick={() => setDeleteTarget(item)}>
                                <Trash2 aria-hidden="true" />
                              </Button>
                            )}
                          >
                            {arrivedIds.has(item.id) ? <Badge tone="mint" size="sm" role="status">Saved</Badge> : null}
                          </FactRow>
                        )
                      })}
                    </List>
                  </Section>
                ))}
              </Stack>
            )}
          </Section>
        )}
      </div>

      <SkillsToBuildSection onShowEvidence={setFoundId} />

      {itemsQuery.isSuccess ? (
        <Panel as="section" className="profile-danger" aria-labelledby="profile-danger-title">
          <PanelBody>
            <div className="profile-danger__body">
              <div>
                <h2 id="profile-danger-title" className="kit-panel-surface__title profile-danger__title">Your data</h2>
                <p>
                  {items.length > 0
                    ? 'Download a copy of everything you saved, or permanently remove every fact above. Deleting takes effect immediately and cannot be undone.'
                    : 'Download a copy of everything you saved on Career Workbench.'}
                </p>
                {exporter.error ? <Notice tone="danger" onDismiss={exporter.clearError}>{exporter.error}</Notice> : null}
              </div>
              <div className="profile-danger__actions">
                <Button variant="secondary" size="sm" loading={exporter.pending} onClick={() => void exporter.run()}>
                  Export data
                </Button>
                {items.length > 0 ? (
                  <Button variant="secondary" size="sm" onClick={() => setPurgeOpen(true)}>
                    Delete profile
                  </Button>
                ) : null}
              </div>
            </div>
          </PanelBody>
        </Panel>
      ) : null}

      <AddFactDialog
        open={addOpen}
        submitting={addMutation.isPending}
        error={addError}
        onOpenChange={setAddOpen}
        onCloseAutoFocus={focusAfterAdd}
        onSubmit={(kind, content) => addMutation.mutate({ kind, content })}
      />

      <EditFactDialog
        item={editTarget}
        submitting={editMutation.isPending}
        error={editError}
        onClose={() => setEditTarget(null)}
        onSubmit={(content) => editTarget && editMutation.mutate({ id: editTarget.id, content })}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this fact?"
        description="This permanently removes it from your profile. It takes effect immediately and cannot be undone."
        confirmLabel="Delete fact"
        icon={<Trash2 />}
        pending={deleteMutation.isPending}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCloseAutoFocus={focusAfterDelete}
      />

      <ConfirmDialog
        open={purgeOpen}
        title={PROFILE_PURGE_TITLE}
        description={`This permanently removes ${purgeScope(counts)}. It happens immediately — we do not keep a backup — and cannot be undone.`}
        confirmLabel={PROFILE_PURGE_CONFIRM}
        icon={<Trash2 />}
        pending={purgeMutation.isPending}
        onOpenChange={(open) => { if (!open) setPurgeOpen(false) }}
        onConfirm={() => purgeMutation.mutate()}
        onCloseAutoFocus={focusAfterDelete}
      />
    </Page>
  )
}
