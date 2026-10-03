import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getCvDocument, getCvStyleCatalog, listCvDocuments, updateCvDocument } from '#/lib/api/client'
import type { CvDocument } from '#/lib/api/schemas'
import { toSavableSections } from '#/lib/cv-studio/editor'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'
export const LIST_KEY = ['cv-studio', 'documents'] as const
const AUTOSAVE_DELAY_MS = 650

/**
 * The open CV as an editable draft: loads the list, the chosen document and the
 * style catalog, and autosaves every edit (debounced, and serialized so an older
 * PATCH can never commit after a newer one).
 */
export function useCvDraft(enabled: boolean) {
  const queryClient = useQueryClient()
  const [documentId, setDocumentId] = useState<string | null>(null)
  const [draft, setDraft] = useState<CvDocument | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const saveGeneration = useRef(0)
  const saveQueue = useRef<Promise<CvDocument | undefined>>(Promise.resolve(undefined))

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
    if (documentQuery.data && !dirty) setDraft(documentQuery.data)
  }, [documentQuery.data, dirty])
  // Design values come only from the backend catalog; it is static, so it loads once.
  const catalogQuery = useQuery({ queryKey: ['cv-studio', 'style-catalog'], queryFn: getCvStyleCatalog, enabled, staleTime: Infinity })

  useEffect(() => {
    if (!dirty || !draft) return
    const generation = ++saveGeneration.current
    setSaveState('saving')
    const timer = window.setTimeout(async () => {
      try {
        const payload = {
          ...(draft.name.trim() ? { name: draft.name.trim() } : {}),
          sections: toSavableSections(draft.sections),
          style: draft.style,
        }
        saveQueue.current = saveQueue.current.catch(() => undefined).then(() => updateCvDocument(draft.id, payload))
        const saved = await saveQueue.current
        if (generation !== saveGeneration.current) return
        // Keep the local sections: they may hold entries only just started
        // (blank entries are left out of the saved payload).
        if (saved) {
          const merged = { ...saved, name: draft.name, sections: draft.sections, style: draft.style }
          queryClient.setQueryData(['cv-studio', 'document', draft.id], merged)
          setDraft(merged)
          // The PATCH response is the saved document: patch the list in place
          // instead of refetching every CV with all of its versions.
          queryClient.setQueryData<{ items: CvDocument[] }>(LIST_KEY, (current) => current && {
            items: current.items.map((item) => item.id === saved.id ? saved : item),
          })
        }
        setDirty(false)
        setSaveState('saved')
      } catch {
        if (generation !== saveGeneration.current) return
        setSaveState('error')
      }
    }, AUTOSAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [dirty, draft, queryClient])

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
    setDocumentId(id)
    setSaveState('idle')
  }

  /** Replace the draft with a server copy (e.g. after a restore). */
  function replace(document: CvDocument) {
    setDraft(document)
    setSaveState('saved')
  }

  return { listQuery, documentQuery, catalogQuery, documentId, draft, dirty, saveState, edit, open, replace, retrySave }
}
