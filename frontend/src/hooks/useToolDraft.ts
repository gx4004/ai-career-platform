import { useEffect, useRef, useState } from 'react'
import {
  baseDraftState,
  clearToolDraft,
  readToolDraft,
  type ToolDraftState,
  writeToolDraft,
} from '#/lib/tools/drafts'
import type { ToolId } from '#/lib/tools/registry'

export function useToolDraft(
  toolId: ToolId,
  defaults: Partial<ToolDraftState> = {},
) {
  // The saved draft lives in session storage, which the server render cannot see: start from the defaults on both
  // sides and load it after mount, so the first client render matches the server HTML (no hydration error).
  const [draft, setDraft] = useState<ToolDraftState>(() => ({ ...baseDraftState, ...defaults }))
  const loadedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    loadedRef.current = true
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

  useEffect(() => {
    if (!loadedRef.current) return
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      writeToolDraft(toolId, draft)
    }, 300)
    return () => clearTimeout(timerRef.current)
  }, [draft, toolId])

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
