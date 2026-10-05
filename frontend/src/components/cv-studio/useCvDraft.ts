import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getCvDocument, getCvStyleCatalog, listCvDocuments, updateCvDocument } from '#/lib/api/client'
import { ApiError } from '#/lib/api/errors'
import type { CvDocument, CvDocumentUpdate } from '#/lib/api/schemas'
import { toSavableSections } from '#/lib/cv-studio/editor'
import { keepalivePatch } from './cvApi'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict'
/** The saved copy on the server moved on while this tab was editing an older one. */
export type CvConflict = { updatedAt: string | null }
export const LIST_KEY = ['cv-studio', 'documents'] as const
const AUTOSAVE_DELAY_MS = 650
/** A keepalive request may carry at most 64 KiB; stay under it. */
const KEEPALIVE_LIMIT = 60_000
/** Do not ask the server again about a newer copy more often than this. */
const CHECK_THROTTLE_MS = 10_000

const documentKey = (id: string) => ['cv-studio', 'document', id] as const

const isNewer = (serverRevision: string, baseRevision: string | null) =>
  baseRevision !== null && Date.parse(serverRevision) > Date.parse(baseRevision)

const toPayload = (draft: CvDocument): CvDocumentUpdate => ({
  ...(draft.name.trim() ? { name: draft.name.trim() } : {}),
  sections: toSavableSections(draft.sections),
  style: draft.style,
})

class RevisionConflict extends Error {
  constructor(readonly updatedAt: string | null) { super('The CV changed somewhere else.') }
}

/**
 * The open CV as an editable draft: loads the list, the chosen document and the
 * style catalog, and autosaves every edit (debounced, and serialized so an older
 * PATCH can never commit after a newer one).
 *
 * Nothing is lost silently:
 * - the pending edit is flushed when the studio unmounts, the tab is hidden or the page is closing;
 * - before every save the server's `updated_at` is compared with the copy this draft was based on, so a
 *   second tab (or device) that saved in the meantime raises a conflict instead of being overwritten.
 */
export function useCvDraft(enabled: boolean) {
  const queryClient = useQueryClient()
  const [documentId, setDocumentId] = useState<string | null>(null)
  const [draft, setDraft] = useState<CvDocument | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [conflict, setConflict] = useState<CvConflict | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null)
  const saveGeneration = useRef(0)
  const saveQueue = useRef<Promise<CvDocument | undefined>>(Promise.resolve(undefined))
  /** `updated_at` of the server copy the draft is built on; every adoption of a server copy moves it. */
  const baseRevision = useRef<string | null>(null)
  const inFlight = useRef(0)
  const lastCheck = useRef(0)
  const latest = useRef({ draft, dirty, conflict })
  latest.current = { draft, dirty, conflict }
  const pending = useRef<{ timer: number; run: (keepalive?: boolean) => Promise<void> } | null>(null)

  const listQuery = useQuery({ queryKey: LIST_KEY, queryFn: listCvDocuments, enabled })
  useEffect(() => {
    if (!documentId && listQuery.data?.items[0]) setDocumentId(listQuery.data.items[0].id)
  }, [documentId, listQuery.data])
  const documentQuery = useQuery({
    queryKey: ['cv-studio', 'document', documentId],
    queryFn: () => getCvDocument(documentId!),
    enabled: enabled && Boolean(documentId),
    refetchOnWindowFocus: false,
  })
  useEffect(() => {
    if (documentQuery.data && !dirty) {
      baseRevision.current = documentQuery.data.updated_at
      setDraft(documentQuery.data)
    }
  }, [documentQuery.data, dirty])
  // Design values come only from the backend catalog; it is static, so it loads once.
  const catalogQuery = useQuery({ queryKey: ['cv-studio', 'style-catalog'], queryFn: getCvStyleCatalog, enabled, staleTime: Infinity })

  const rememberSaved = useCallback((saved: CvDocument, local: CvDocument) => {
    // Keep the local sections: they may hold entries only just started
    // (blank entries are left out of the saved payload).
    const merged = { ...saved, name: local.name, sections: local.sections, style: local.style }
    queryClient.setQueryData(documentKey(local.id), merged)
    // The PATCH response is the saved document: patch the list in place
    // instead of refetching every CV with all of its versions.
    queryClient.setQueryData<{ items: CvDocument[] }>(LIST_KEY, (current) => current && {
      items: current.items.map((item) => item.id === saved.id ? saved : item),
    })
    return merged
  }, [queryClient])

  /** One save, in order after the ones before it. The server copy is checked first unless the page is closing. */
  const persist = useCallback((snapshot: CvDocument, keepalive: boolean) => {
    const step = async () => {
      if (!keepalive) {
        const server = await getCvDocument(snapshot.id).catch(() => null)
        if (server && isNewer(server.updated_at, baseRevision.current)) throw new RevisionConflict(server.updated_at)
      }
      const payload = toPayload(snapshot)
      const tooBig = keepalive && JSON.stringify(payload).length > KEEPALIVE_LIMIT
      const saved = keepalive && !tooBig ? await keepalivePatch(snapshot.id, payload) : await updateCvDocument(snapshot.id, payload)
      if (saved) baseRevision.current = saved.updated_at
      return saved
    }
    inFlight.current += 1
    saveQueue.current = saveQueue.current.catch(() => undefined).then(step).finally(() => { inFlight.current -= 1 })
    return saveQueue.current
  }, [])

  // Declared before the autosave effect on purpose: on unmount React runs cleanups in this order, so the
  // pending edit is still registered here when the studio goes away (a click on another page).
  useEffect(() => () => {
    const current = latest.current
    if (!current.dirty || !current.draft || current.conflict) return
    const snapshot = current.draft
    persist(snapshot, false)
      .then((saved) => { if (saved) rememberSaved(saved, snapshot) })
      .catch(() => undefined)
  }, [persist, rememberSaved])

  useEffect(() => {
    if (!dirty || !draft) return
    if (conflict) {
      setSaveState('conflict')
      return
    }
    const generation = ++saveGeneration.current
    setSaveState('saving')
    const run = async (keepalive = false) => {
      if (pending.current?.run === run) {
        window.clearTimeout(pending.current.timer)
        pending.current = null
      }
      try {
        const saved = await persist(draft, keepalive)
        if (generation !== saveGeneration.current) return
        if (saved) setDraft(rememberSaved(saved, draft))
        setDirty(false)
        setSaveState('saved')
        setLastSavedAt(Date.now())
      } catch (error) {
        if (generation !== saveGeneration.current) return
        if (error instanceof RevisionConflict) {
          setConflict({ updatedAt: error.updatedAt })
          setSaveState('conflict')
        } else if (error instanceof ApiError && (error.status === 409 || error.status === 412)) {
          setConflict({ updatedAt: null })
          setSaveState('conflict')
        } else {
          setSaveState('error')
        }
      }
    }
    const timer = window.setTimeout(() => void run(), AUTOSAVE_DELAY_MS)
    pending.current = { timer, run }
    return () => {
      window.clearTimeout(timer)
      if (pending.current?.timer === timer) pending.current = null
    }
  }, [dirty, draft, conflict, persist, rememberSaved])

  // A pending edit is sent at once when the tab is hidden or the page is closing (keepalive, so the request outlives the page).
  useEffect(() => {
    const flush = () => { void pending.current?.run(true) }
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush() }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const current = latest.current
      if (!current.dirty || !current.draft) return
      flush()
      // A CV too large for a keepalive request cannot be sent on the way out: ask first instead of losing it.
      if (JSON.stringify(toPayload(current.draft)).length > KEEPALIVE_LIMIT) event.preventDefault()
    }
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  /** Ask the server whether another tab or device saved a newer copy; only while nothing here is unsaved. */
  const checkForNewer = useCallback(async () => {
    const current = latest.current
    if (!current.draft || current.conflict || current.dirty || inFlight.current > 0) return
    if (Date.now() - lastCheck.current < CHECK_THROTTLE_MS) return
    lastCheck.current = Date.now()
    const server = await getCvDocument(current.draft.id).catch(() => null)
    if (!server) return
    setLastCheckedAt(Date.now())
    // A save that began while we were asking owns the comparison now.
    if (latest.current.dirty || inFlight.current > 0) return
    if (isNewer(server.updated_at, baseRevision.current)) setConflict({ updatedAt: server.updated_at })
  }, [])

  useEffect(() => {
    const onFocus = () => { void checkForNewer() }
    const onVisible = () => { if (document.visibilityState === 'visible') void checkForNewer() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [checkForNewer])

  function edit(change: (current: CvDocument) => CvDocument) {
    setDraft((current) => current ? change(current) : current)
    setDirty(true)
    setSaveState('saving')
  }

  /** Save again after a failed save: a fresh copy of the draft restarts the autosave. */
  function retrySave() {
    setDraft((current) => current && { ...current })
  }

  /** Open another document (or none): drops the current draft without saving it again. */
  function open(id: string | null) {
    setDraft(null)
    setDirty(false)
    setConflict(null)
    setDocumentId(id)
    setSaveState('idle')
  }

  /** Replace the draft with a server copy (e.g. after a restore). */
  function replace(document: CvDocument) {
    baseRevision.current = document.updated_at
    setDraft(document)
    setSaveState('saved')
    setLastSavedAt(Date.now())
  }

  /** Take the newer server copy; whatever was unsaved in this tab is dropped. */
  async function reloadNewer() {
    const id = latest.current.draft?.id ?? documentId
    if (!id) return false
    try {
      const server = await getCvDocument(id)
      baseRevision.current = server.updated_at
      queryClient.setQueryData(documentKey(id), server)
      queryClient.setQueryData<{ items: CvDocument[] }>(LIST_KEY, (current) => current && {
        items: current.items.map((item) => item.id === server.id ? server : item),
      })
      saveGeneration.current += 1
      setDraft(server)
      setDirty(false)
      setConflict(null)
      setSaveState('idle')
      setLastSavedAt(null)
      return true
    } catch {
      return false
    }
  }

  /** Save this tab's copy over the newer one, on purpose. */
  async function keepMine() {
    const id = latest.current.draft?.id
    if (!id) return
    const server = await getCvDocument(id).catch(() => null)
    if (server) baseRevision.current = server.updated_at
    setConflict(null)
    retrySave()
  }

  return {
    listQuery, documentQuery, catalogQuery, documentId, draft, dirty, saveState, edit, open, replace, retrySave,
    conflict, lastSavedAt, lastCheckedAt, reloadNewer, keepMine,
  }
}
