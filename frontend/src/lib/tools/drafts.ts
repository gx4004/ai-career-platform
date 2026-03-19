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

export function clearAllToolDrafts(): void {
  const draftIds: ToolId[] = [
    'resume',
    'job-match',
    'cover-letter',
    'interview',
    'career',
    'portfolio',
  ]

  for (const toolId of draftIds) {
    clearToolDraft(toolId)
  }
}

export function readWorkflowContext(): WorkflowContextState | null {
  return readSessionJson<WorkflowContextState>(WORKFLOW_CONTEXT_KEY)
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
