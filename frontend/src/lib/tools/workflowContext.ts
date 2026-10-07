import type {
  CareerResult,
  JobMatchResult,
  PortfolioResult,
  ResumeResult,
  ToolRunDetail,
} from '#/lib/api/schemas'
import { workspaceContextInputSchema } from '#/lib/api/schemas'
import type { CarryOrigin, WorkflowContextState } from '#/lib/tools/drafts'
import { getToolByHistoryName, tools, type ToolId } from '#/lib/tools/registry'

type AnyObject = Record<string, unknown>

export function deriveWorkflowUpdateFromResult(
  toolId: ToolId,
  result: Record<string, unknown>,
): Partial<WorkflowContextState> {
  const topActionTitles = readTopActionTitles(result)

  if (toolId === 'resume') {
    const roleFitLabel = toString(asObject(result.role_fit).target_role_label)
    return {
      resumePendingReview: false,
      resumeAnalysis: result as ResumeResult,
      topActionTitles,
      strongestMissingSkills: readStringArray(asObject(result.evidence).missing_keywords),
      // No role read from the resume: keep the target role an earlier tool carried.
      ...(roleFitLabel ? { targetRole: roleFitLabel, roleOrigin: 'resume' as const } : {}),
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
      ...(toString(direction.role_title) ? { roleOrigin: 'career' as const } : {}),
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
      ...(toString(result.target_role) ? { roleOrigin: 'portfolio' as const } : {}),
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
    workspace_id?: string | null
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
    workspace_context: workspaceContextInputSchema.parse({
      workspace_id: context.workspaceId,
      linked_history_ids: linkedHistoryIds,
    }),
  }
}

const PLACE_LABEL: Record<Exclude<CarryOrigin, ToolId>, string> = {
  'cv-studio': 'CV Studio',
  application: 'your application',
  discover: 'Discover',
  dashboard: 'Dashboard',
}

/** "Resume Analyzer", "CV Studio", "your application": where a carried value came from, for "Resume from …". */
export function carryOriginLabel(origin: CarryOrigin | string | null | undefined): string {
  if (!origin) return ''
  if (Object.prototype.hasOwnProperty.call(tools, origin)) return tools[origin as ToolId].label
  return PLACE_LABEL[origin as keyof typeof PLACE_LABEL] ?? ''
}

type RunOrigins = Pick<WorkflowContextState, 'resumeOrigin' | 'jobOrigin' | 'roleOrigin' | 'resumeSource' | 'jobSource'>

/**
 * Where each carried value came from after a run of `toolId`. `update` is what the run writes (only the fields this tool
 * has, plus what its result derives). A value the run did not change keeps its origin (and its "found in your account"
 * label): running a carried resume on Job Match does not make Job Match its source. A new value is from this tool, or
 * from wherever the tab's resume carry says the user supplied it (`carried`).
 */
export function originsAfterRun(
  toolId: ToolId,
  previous: WorkflowContextState | null,
  update: Partial<WorkflowContextState>,
  carried: { text: string; origin: string } = { text: '', origin: '' },
): RunOrigins {
  const out: RunOrigins = {}
  if ('resumeText' in update) {
    const text = update.resumeText ?? ''
    const same = Boolean(text) && text === (previous?.resumeText ?? '')
    out.resumeSource = same ? previous?.resumeSource : undefined
    out.resumeOrigin = !text
      ? undefined
      : carried.origin && carried.text === text
        ? (carried.origin as CarryOrigin)
        : same && previous?.resumeOrigin
          ? previous.resumeOrigin
          : toolId
  }
  if ('jobDescription' in update) {
    const text = update.jobDescription ?? ''
    const same = Boolean(text) && text === (previous?.jobDescription ?? '')
    out.jobSource = same ? previous?.jobSource : undefined
    out.jobOrigin = !text ? undefined : same && previous?.jobOrigin ? previous.jobOrigin : toolId
  }
  const before = getWorkflowTargetRole(previous)
  const after = getWorkflowTargetRole({ ...(previous ?? {}), ...update, updatedAt: 0 })
  out.roleOrigin = !after
    ? undefined
    : after === before
      ? (previous?.roleOrigin ?? update.roleOrigin)
      : (update.roleOrigin ?? toolId)
  return out
}

/**
 * Whether the target role in the tab is the one of the run being re-generated: opening a result writes its role into the
 * tab (ToolResultScreen), so after a Re-generate from it the role field holds that run's input role (Portfolio) or the
 * role it recommended (Career Path), not something the user carried in.
 */
export function roleFromRegeneratedRun(
  toolId: ToolId,
  context: Pick<WorkflowContextState, 'historyId' | 'roleOrigin'> | null,
  parentRunId: string | null | undefined,
): 'target' | 'recommended' | undefined {
  if (!parentRunId || !context || context.historyId !== parentRunId || context.roleOrigin !== toolId) return undefined
  if (toolId === 'career') return 'recommended'
  return toolId === 'portfolio' ? 'target' : undefined
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
