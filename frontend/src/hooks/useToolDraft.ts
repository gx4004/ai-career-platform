import { useEffect, useRef, useState } from 'react'
import {
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
  const [draft, setDraft] = useState<ToolDraftState>(() =>
    readToolDraft(toolId, defaults),
  )
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
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
