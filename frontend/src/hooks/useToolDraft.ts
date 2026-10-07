import { useEffect, useRef, useState } from 'react'
import {
  baseDraftState,
  clearToolDraft,
  draftClearCount,
  readToolDraft,
  type ToolDraftState,
  writeToolDraft,
} from '#/lib/tools/drafts'
import type { ToolId } from '#/lib/tools/registry'

/** Writes the edit still waiting, unless every draft was cleared since it was made (a logout: it must stay gone). */
function flush(toolId: ToolId, unsavedRef: { current: { draft: ToolDraftState; clears: number } | null }) {
  const unsaved = unsavedRef.current
  unsavedRef.current = null
  if (!unsaved || unsaved.clears !== draftClearCount()) return
  writeToolDraft(toolId, unsaved.draft)
}

export function useToolDraft(
  toolId: ToolId,
  defaults: Partial<ToolDraftState> = {},
) {
  // The saved draft lives in session storage, which the server render cannot see: start from the defaults on both
  // sides and load it after mount, so the first client render matches the server HTML (no hydration error).
  const [draft, setDraft] = useState<ToolDraftState>(() => ({ ...baseDraftState, ...defaults }))
  const loadedRef = useRef(false)
  const loadingRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    loadedRef.current = true
    // The draft effect of this same commit still sees the defaults: that is not an edit (written on unmount it would
    // replace the saved draft before the merge below lands).
    loadingRef.current = true
    const saved = readToolDraft(toolId, defaults)
    // Merge, not replace: a child may already have filled an empty field on mount (the tab's carried resume),
    // and a saved empty string must not wipe that.
    setDraft((current) => {
      const next = { ...current }
      for (const key of Object.keys(saved) as (keyof ToolDraftState)[]) {
        const value = saved[key]
        if (typeof value === 'string' && !value.trim() && String(current[key] ?? '').trim()) continue
        Object.assign(next, { [key]: value })
      }
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per tool; defaults are a static config object
  }, [toolId])

  // The edit not written yet, if any, and the clear count it was made under (see flush).
  const unsavedRef = useRef<{ draft: ToolDraftState; clears: number } | null>(null)

  useEffect(() => {
    if (!loadedRef.current) return
    if (loadingRef.current) {
      loadingRef.current = false
      return
    }
    unsavedRef.current = { draft, clears: draftClearCount() }
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => flush(toolId, unsavedRef), 300)
    return () => clearTimeout(timerRef.current)
  }, [draft, toolId])

  // Leaving the page within the 300ms (typing, then a sidebar link or "Sign in to keep your results") must not drop the
  // last edit: it is written on unmount, and on pagehide for a full navigation or a closed tab.
  useEffect(() => {
    const onPageHide = () => flush(toolId, unsavedRef)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      flush(toolId, unsavedRef)
    }
  }, [toolId])

  // Input quality soft validation warnings
  const warnings: string[] = []
  if (draft.resumeText) {
    const wordCount = draft.resumeText.trim().split(/\s+/).filter(Boolean).length
    if (wordCount > 0 && wordCount < 50) {
      warnings.push('This resume looks very short — results may be limited.')
    }
  }

  return {
    draft,
    setDraft,
    warnings,
    setField: <K extends keyof ToolDraftState>(field: K, value: ToolDraftState[K]) =>
      setDraft((current) => ({ ...current, [field]: value })),
    resetDraft: () => {
      clearToolDraft(toolId)
      setDraft(readToolDraft(toolId, defaults))
    },
  }
}
