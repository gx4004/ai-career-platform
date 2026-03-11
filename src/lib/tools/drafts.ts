import type { ToolId } from '#/lib/tools/registry'
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
  jobDescription?: string
  lastToolId?: ToolId
  historyId?: string
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

export function readWorkflowContext(): WorkflowContextState | null {
  return readSessionJson<WorkflowContextState>(WORKFLOW_CONTEXT_KEY)
}

export function writeWorkflowContext(update: WorkflowContextState): void {
  writeSessionJson(WORKFLOW_CONTEXT_KEY, update)
}
