import type { ToolId } from '#/lib/tools/registry'
import type {
  CareerResult,
  JobMatchResult,
  PortfolioResult,
  ResumeResult,
} from '#/lib/api/schemas'
import {
  readSessionJson,
  removeSessionValue,
  removeSessionValuesByPrefix,
  writeSessionJson,
} from '#/lib/auth/storage'

const DRAFT_PREFIX = 'career-workbench:draft:'
const WORKFLOW_CONTEXT_KEY = 'career-workbench:workflow-context'

export type ToolDraftState = {
  resumeText: string
  jobDescription: string
  tone: string
  numQuestions: number
  targetRole: string
}

/**
 * Where a carried value was supplied: the tool whose form the user typed, pasted or uploaded it on, or the place outside
 * the tools that filled it in. The hand-off banner and the resume row name it ("Resume from Resume Analyzer").
 */
export type CarryOrigin = ToolId | 'cv-studio' | 'application' | 'discover' | 'dashboard'

export type WorkflowContextState = {
  resumeText?: string
  resumePendingReview?: boolean
  jobDescription?: string
  targetRole?: string
  selectedTargetRole?: string
  recommendedDirectionRole?: string
  strongestMissingSkills?: string[]
  topActionTitles?: string[]
  recommendedProjectTitle?: string
  linkedContextIds?: string[]
  workspaceId?: string
  workspaceLabel?: string
  lastToolId?: ToolId
  historyId?: string
  /**
   * Set by Discovery's "Tailor my CV" alongside `targetRole` + `jobDescription`
   * (career-workbench#324). CV Studio reads this once on mount to open the
   * tailor dialog prefilled, then clears it — so a stale `jobDescription` left
   * over from an unrelated tool run never reopens the dialog on its own.
   */
  tailorPending?: boolean
  /** Where a Re-generate found the resume / job text when the tab carried none ("your CV Studio CV “…”"). */
  resumeSource?: string
  jobSource?: string
  /** Where `resumeText`, `jobDescription` and the target role were first supplied (not merely where they were last run). */
  resumeOrigin?: CarryOrigin
  jobOrigin?: CarryOrigin
  roleOrigin?: CarryOrigin
  /** "Staff Engineer at Northwind", from the re-generated run's application, for the "still needed" line. */
  jobLabel?: string
  /**
   * What a Re-generate asked to change, for the run it re-generates (`?parent_run_id=`). Free text that can
   * hold personal details, so it stays in this tab instead of the URL (history, shared links, request logs).
   * Cleared when the new run completes.
   */
  regenFeedback?: { parentRunId: string; text: string }
  resumeAnalysis?: ResumeResult
  jobMatch?: JobMatchResult
  careerResult?: CareerResult
  portfolioResult?: PortfolioResult
  updatedAt: number
}

export const baseDraftState: ToolDraftState = {
  resumeText: '',
  jobDescription: '',
  tone: 'Professional',
  numQuestions: 6,
  targetRole: '',
}

export function getDraftKey(toolId: ToolId): string {
  return `${DRAFT_PREFIX}${toolId}`
}

export function readToolDraft(
  toolId: ToolId,
  defaults: Partial<ToolDraftState> = {},
): ToolDraftState {
  return {
    ...baseDraftState,
    ...defaults,
    ...(readSessionJson<ToolDraftState>(getDraftKey(toolId)) || {}),
  }
}

export function writeToolDraft(toolId: ToolId, draft: ToolDraftState): void {
  writeSessionJson(getDraftKey(toolId), draft)
}

export function clearToolDraft(toolId: ToolId): void {
  removeSessionValue(getDraftKey(toolId))
}

/**
 * Clears every draft by key prefix rather than by a list of tool ids.
 *
 * Drafts hold full resume and job-description text, so the clearing path
 * (logout, account deletion, manual reset) must not be able to drift from the
 * writing path: a seventh tool or a renamed id would otherwise keep its draft
 * forever. `getDraftKey` is the only writer of this prefix, so clearing the
 * prefix clears exactly what the app wrote — no more, no less.
 */
export function clearAllToolDrafts(): void {
  draftsCleared += 1
  removeSessionValuesByPrefix(DRAFT_PREFIX)
}

let draftsCleared = 0

/**
 * Counts `clearAllToolDrafts` calls. A tool page that still holds an unsaved edit compares it before writing, so a
 * write that was waiting when the user logged out never brings a cleared draft back.
 */
export function draftClearCount(): number {
  return draftsCleared
}

const WORKFLOW_CONTEXT_TTL_MS = 4 * 60 * 60 * 1000 // 4 hours

export function readWorkflowContext(): WorkflowContextState | null {
  const ctx = readSessionJson<WorkflowContextState>(WORKFLOW_CONTEXT_KEY)
  if (!ctx) return null
  if (Date.now() - (ctx.updatedAt ?? 0) > WORKFLOW_CONTEXT_TTL_MS) {
    removeSessionValue(WORKFLOW_CONTEXT_KEY)
    return null
  }
  return ctx
}

export function writeWorkflowContext(
  update: Partial<WorkflowContextState> & Pick<WorkflowContextState, 'updatedAt'>,
): void {
  const current = readWorkflowContext()
  writeSessionJson(WORKFLOW_CONTEXT_KEY, {
    ...current,
    ...update,
  })
}

/** The feedback a Re-generate of `parentRunId` carries in this tab, if any. Never throws. */
export function readRegenFeedback(parentRunId: string | null | undefined): string | undefined {
  if (!parentRunId) return undefined
  try {
    const stored = readWorkflowContext()?.regenFeedback
    return stored?.parentRunId === parentRunId && stored.text.trim() ? stored.text.trim() : undefined
  } catch {
    return undefined
  }
}

export function clearWorkflowContext(): void {
  removeSessionValue(WORKFLOW_CONTEXT_KEY)
}
