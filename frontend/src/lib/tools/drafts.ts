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
  removeSessionValuesByPrefix(DRAFT_PREFIX)
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

export function clearWorkflowContext(): void {
  removeSessionValue(WORKFLOW_CONTEXT_KEY)
}
