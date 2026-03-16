import { useEffect, useMemo, useRef } from 'react'
import type { ToolDraftState } from '#/lib/tools/drafts'
import { readWorkflowContext } from '#/lib/tools/drafts'
import type { ToolId } from '#/lib/tools/registry'
import { getWorkflowTargetRole } from '#/lib/tools/workflowContext'

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
      const preferredTargetRole = getWorkflowTargetRole(context)

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

      if (
        (toolId === 'career' || toolId === 'portfolio') &&
        !current.targetRole.trim() &&
        preferredTargetRole
      ) {
        next.targetRole = preferredTargetRole
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
  const seededTargetRole = Boolean(getWorkflowTargetRole(context))
  const seededProject = Boolean(context?.recommendedProjectTitle)
  const seededDirection = Boolean(context?.recommendedDirectionRole)
  const seededGaps = Boolean(context?.strongestMissingSkills?.length)

  return {
    seededResume,
    seededJob,
    seededTargetRole,
    seededProject,
    seededDirection,
    seededGaps,
    banner:
      seededResume && seededJob
        ? 'Resume and job description carried from your recent workflow.'
        : seededResume && seededTargetRole && seededDirection
          ? 'Resume and a recent recommended direction were carried into this planner.'
        : seededTargetRole && seededProject
          ? 'Target role and the latest recommended proof project were carried forward.'
          : seededGaps && seededJob
            ? 'Missing skills and role context were carried forward from the previous tool.'
        : seededResume
          ? 'Resume text carried from your last Resume run. Edit anytime.'
          : seededTargetRole
            ? 'A recent recommended direction was carried into this planner.'
          : seededJob
            ? 'Job description carried from your last Job Match run. Edit anytime.'
            : '',
  }
}
