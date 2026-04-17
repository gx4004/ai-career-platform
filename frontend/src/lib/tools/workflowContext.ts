import type {
  CareerResult,
  JobMatchResult,
  PortfolioResult,
  ResumeResult,
  ToolRunDetail,
} from '#/lib/api/schemas'
import type { WorkflowContextState } from '#/lib/tools/drafts'
import { getToolByHistoryName, type ToolId } from '#/lib/tools/registry'

type AnyObject = Record<string, unknown>

export function deriveWorkflowUpdateFromResult(
  toolId: ToolId,
  result: Record<string, unknown>,
): Partial<WorkflowContextState> {
  const topActionTitles = readTopActionTitles(result)

  if (toolId === 'resume') {
    return {
      resumePendingReview: false,
      resumeAnalysis: result as ResumeResult,
      topActionTitles,
      strongestMissingSkills: readStringArray(asObject(result.evidence).missing_keywords),
      targetRole: toString(asObject(result.role_fit).target_role_label) || undefined,
    }
  }

  if (toolId === 'job-match') {
    return {
      resumePendingReview: false,
      jobMatch: result as JobMatchResult,
      topActionTitles,
      strongestMissingSkills: readObjectArray(result.missing_keywords)
        .map((item) => toString(item.keyword))
        .filter(Boolean) as string[],
    }
  }

  if (toolId === 'career') {
    const direction = asObject(result.recommended_direction)
    return {
      resumePendingReview: false,
      careerResult: result as CareerResult,
      targetRole: toString(direction.role_title) || undefined,
      selectedTargetRole: toString(direction.role_title) || undefined,
      recommendedDirectionRole: toString(direction.role_title) || undefined,
      topActionTitles,
      strongestMissingSkills: readObjectArray(result.skill_gaps)
        .map((item) => toString(item.skill))
        .filter(Boolean) as string[],
    }
  }

  if (toolId === 'portfolio') {
    return {
      resumePendingReview: false,
      portfolioResult: result as PortfolioResult,
      targetRole: toString(result.target_role) || undefined,
      selectedTargetRole: toString(result.target_role) || undefined,
      recommendedProjectTitle: toString(result.recommended_start_project) || undefined,
      topActionTitles,
    }
  }

  return {
    resumePendingReview: false,
    topActionTitles,
  }
}

export function deriveWorkflowUpdateFromHistoryItem(
  item: ToolRunDetail,
): Partial<WorkflowContextState> {
  const tool = getToolByHistoryName(item.tool_name)
  if (!tool) return {}

  return {
    historyId: item.id,
    lastToolId: tool.id,
    linkedContextIds: item.metadata.linked_context_ids,
    workspaceId: item.workspace?.id,
    workspaceLabel: item.workspace?.label || undefined,
    ...deriveWorkflowUpdateFromResult(tool.id, item.result_payload),
  }
}

export function buildWorkspaceRequestContext(
  context: WorkflowContextState | null,
): {
  workspace_context?: {
    workspace_id?: string
    linked_history_ids: string[]
  }
} {
  if (!context) return {}

  const linkedHistoryIds = [
    context.historyId,
    ...(context.linkedContextIds || []),
  ].filter((item, index, items): item is string => Boolean(item) && items.indexOf(item) === index)

  if (!context.workspaceId && linkedHistoryIds.length === 0) {
    return {}
  }

  return {
    workspace_context: {
      workspace_id: context.workspaceId,
      linked_history_ids: linkedHistoryIds,
    },
  }
}

export function getWorkflowTargetRole(
  context: WorkflowContextState | null,
): string | undefined {
  if (!context) return undefined

  const candidates = [
    context.selectedTargetRole,
    context.targetRole,
    context.recommendedDirectionRole,
    context.portfolioResult?.target_role,
    context.careerResult?.recommended_direction?.role_title,
    context.resumeAnalysis?.role_fit?.target_role_label,
  ]

  return candidates.find((value): value is string => Boolean(value?.trim()))
}

function asObject(value: unknown): AnyObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as AnyObject)
    : {}
}

function readObjectArray(value: unknown): AnyObject[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is AnyObject => Boolean(item) && typeof item === 'object' && !Array.isArray(item),
      )
    : []
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    : []
}

function readTopActionTitles(result: Record<string, unknown>): string[] {
  return readObjectArray(result.top_actions)
    .map((item) => toString(item.title))
    .filter(Boolean) as string[]
}

function toString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}
