import { useEffect, useMemo, useRef } from 'react'
import type { ToolDraftState } from '#/lib/tools/drafts'
import { readWorkflowContext } from '#/lib/tools/drafts'
import type { ToolId } from '#/lib/tools/registry'

export function useWorkflowBridge(
  toolId: ToolId,
  draft: ToolDraftState,
  setDraft: (updater: (current: ToolDraftState) => ToolDraftState) => void,
) {
  const seededRef = useRef(false)

  useEffect(() => {
    if (seededRef.current) return

    const context = readWorkflowContext()
    if (!context) return

    let changed = false

    setDraft((current) => {
      const next = { ...current }

      if (!current.resumeText.trim() && context.resumeText) {
        next.resumeText = context.resumeText
        changed = true
      }

      if (
        toolId !== 'career' &&
        toolId !== 'portfolio' &&
        !current.jobDescription.trim() &&
        context.jobDescription
      ) {
        next.jobDescription = context.jobDescription
        changed = true
      }

      return next
    })

    if (changed) {
      seededRef.current = true
    }
  }, [draft.jobDescription, draft.resumeText, setDraft, toolId])

  const context = useMemo(() => readWorkflowContext(), [])
  const seededResume = Boolean(context?.resumeText)
  const seededJob = Boolean(context?.jobDescription)

  return {
    seededResume,
    seededJob,
    banner:
      seededResume && seededJob
        ? 'Resume and job description carried from your recent workflow.'
        : seededResume
          ? 'Resume text carried from your last Resume run. Edit anytime.'
          : seededJob
            ? 'Job description carried from your last Job Match run. Edit anytime.'
            : '',
  }
}
