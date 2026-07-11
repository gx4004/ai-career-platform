import type {
  CareerResult,
  JobMatchResult,
  PortfolioResult,
  ResumeResult,
  ToolRunDetail,
} from '#/lib/api/schemas'
import type { WorkflowContextState } from '#/lib/tools/drafts'
import { readWorkflowContext, writeWorkflowContext } from '#/lib/tools/drafts'
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

/**
 * Identifies a field carried across the tab-scoped workflow context (D-011).
 * These are exactly the fields that pre-fill the next tool's input via
 * `useWorkflowBridge`, so the R7 #112 transparency layer can name them and a
 * per-field clear can stop a specific one from carrying forward.
 */
export type CarriedFieldKey = 'resume' | 'jobDescription' | 'targetRole'

export type CarriedField = {
  key: CarriedFieldKey
  label: string
}

const CARRIED_FIELD_LABELS: Record<CarriedFieldKey, string> = {
  resume: 'Resume',
  jobDescription: 'Job description',
  targetRole: 'Target role',
}

/**
 * The specific fields the workflow context would pre-fill into `toolId`'s input,
 * in tool-input order (resume → job description → target role). This mirrors the
 * seeding gates in `useWorkflowBridge` exactly, so the banner names only the
 * fields the target tool actually carries over — not everything present in the
 * context. Resume seeds on every tool; the job description seeds on every tool
 * except the planners (career/portfolio); the target role seeds only on the
 * planners.
 */
export function getCarriedFields(
  context: WorkflowContextState | null,
  toolId: ToolId,
): CarriedField[] {
  if (!context) return []

  const isPlanner = toolId === 'career' || toolId === 'portfolio'
  const fields: CarriedField[] = []

  if (context.resumeText?.trim()) {
    fields.push({ key: 'resume', label: CARRIED_FIELD_LABELS.resume })
  }
  if (!isPlanner && context.jobDescription?.trim()) {
    fields.push({ key: 'jobDescription', label: CARRIED_FIELD_LABELS.jobDescription })
  }
  if (isPlanner && getWorkflowTargetRole(context)) {
    fields.push({ key: 'targetRole', label: CARRIED_FIELD_LABELS.targetRole })
  }
  return fields
}

/**
 * Removes a single carried field from the tab-scoped workflow context so it no
 * longer pre-fills the next tool's input. Stays within the existing
 * `sessionStorage` boundary (D-011): no new persistence, no cross-tab carry, and
 * persisted `ToolRun` history is untouched.
 *
 * Each branch clears exactly the source(s) that feed that field's pre-fill and
 * nothing else: the target role is derived from several keys (see
 * `getWorkflowTargetRole`), so all of them are neutralised — but only the role
 * sub-field of a carried result object, never the whole object, so other
 * carried data (starter project, skill gaps, results) survives.
 */
export function clearCarriedField(key: CarriedFieldKey): void {
  const context = readWorkflowContext()
  if (!context) return

  const next: WorkflowContextState = { ...context }

  if (key === 'resume') {
    next.resumeText = undefined
    next.resumePendingReview = undefined
  } else if (key === 'jobDescription') {
    next.jobDescription = undefined
  } else {
    next.targetRole = undefined
    next.selectedTargetRole = undefined
    next.recommendedDirectionRole = undefined
    if (next.portfolioResult?.target_role) {
      next.portfolioResult = { ...next.portfolioResult, target_role: '' }
    }
    if (next.careerResult?.recommended_direction?.role_title) {
      next.careerResult = {
        ...next.careerResult,
        recommended_direction: {
          ...next.careerResult.recommended_direction,
          role_title: '',
        },
      }
    }
    if (next.resumeAnalysis?.role_fit?.target_role_label) {
      next.resumeAnalysis = {
        ...next.resumeAnalysis,
        role_fit: { ...next.resumeAnalysis.role_fit, target_role_label: '' },
      }
    }
  }

  writeWorkflowContext({ ...next, updatedAt: Date.now() })
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
