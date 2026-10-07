import { useEffect, useRef, useState } from 'react'
import type { ToolDraftState, WorkflowContextState } from '#/lib/tools/drafts'
import { readWorkflowContext } from '#/lib/tools/drafts'
import type { ToolId } from '#/lib/tools/registry'
import { getWorkflowTargetRole, roleFromRegeneratedRun } from '#/lib/tools/workflowContext'

export function useWorkflowBridge(
  toolId: ToolId,
  _draft: ToolDraftState,
  setDraft: (updater: (current: ToolDraftState) => ToolDraftState) => void,
) {
  const seededRef = useRef(false)
  // Read after mount: the server render has no session storage, so the first client render must not see it either (hydration).
  const [context, setContext] = useState<WorkflowContextState | null>(null)

  useEffect(() => {
    if (seededRef.current) return

    const context = readWorkflowContext()
    setContext(context)
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
  }, [setDraft, toolId]) // Only run once on mount; seededRef prevents re-seeding

  const seededResume = Boolean(context?.resumeText)
  const resumePendingReview = Boolean(context?.resumePendingReview && context?.resumeText)
  const seededJob = Boolean(context?.jobDescription)
  const seededTargetRole = Boolean(getWorkflowTargetRole(context))
  const seededProject = Boolean(context?.recommendedProjectTitle)
  const seededDirection = Boolean(context?.recommendedDirectionRole)
  const seededGaps = Boolean(context?.strongestMissingSkills?.length)

  // An application handed its job here ("Prep for the round"): the run is filed under it, so the note names it.
  const application = context?.workspaceId ? context.workspaceLabel?.trim() || undefined : undefined
  // Read with the context (after mount): the server render has no query string.
  const parentRunId = context && typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('parent_run_id') : null

  return {
    /** The values that were carried in, so a "carried in" note can stop once the user replaces them. */
    carriedJobDescription: context?.jobDescription ?? '',
    carriedTargetRole: getWorkflowTargetRole(context) ?? '',
    /** The application the carried job description came from, when it came from one. */
    jobApplicationLabel: context?.jobOrigin === 'application' ? application : undefined,
    /** The application the carried target role came from, when it came from one. */
    roleApplicationLabel: context?.roleOrigin === 'application' ? application : undefined,
    /** On a Re-generate, whether the role is the earlier run's (its input, or what it recommended): the field note says so. */
    roleFromRun: roleFromRegeneratedRun(toolId, context, parentRunId),
    seededResume,
    resumePendingReview,
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
