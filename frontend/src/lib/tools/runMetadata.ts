import type { ToolRunSummary } from '#/lib/api/schemas'
import type { ToolId } from '#/lib/tools/registry'

type AnyObject = Record<string, unknown>

const DEFAULT_NEXT_STEP_TOOL: Record<ToolId, ToolId> = {
  resume: 'job-match',
  'job-match': 'cover-letter',
  'cover-letter': 'interview',
  interview: 'career',
  career: 'portfolio',
  portfolio: 'resume',
}

export type RunMetadata = ToolRunSummary['metadata']

export function deriveRunMetadata(
  toolId: ToolId,
  payload: Record<string, unknown>,
  options: {
    linkedContextIds?: string[]
    nextStepTool?: ToolId | null
  } = {},
): RunMetadata {
  const summary = asObject(payload.summary)

  return {
    summary_headline: toString(summary.headline) || null,
    primary_recommendation_title: getPrimaryRecommendationTitle(toolId, payload),
    schema_version: toString(payload.schema_version) || null,
    linked_context_ids: options.linkedContextIds || [],
    next_step_tool: options.nextStepTool || DEFAULT_NEXT_STEP_TOOL[toolId],
  }
}

export function getNextStepToolId(
  toolId: ToolId,
  metadata?: RunMetadata | null,
): ToolId {
  const next = metadata?.next_step_tool
  if (next && next in DEFAULT_NEXT_STEP_TOOL) {
    return next as ToolId
  }
  return DEFAULT_NEXT_STEP_TOOL[toolId]
}

function getPrimaryRecommendationTitle(
  toolId: ToolId,
  payload: Record<string, unknown>,
): string | null {
  if (toolId === 'resume') {
    const roleFit = asObject(payload.role_fit)
    return toString(roleFit.target_role_label) || firstString(payload.strengths)
  }

  if (toolId === 'job-match') {
    return toString(payload.recruiter_summary) || toString(payload.verdict)
  }

  if (toolId === 'cover-letter') {
    return toString(payload.tone_used) || 'Targeted cover letter'
  }

  if (toolId === 'interview') {
    const firstFocus = firstObject(payload.focus_areas)
    return toString(firstFocus?.title) || 'Interview practice deck'
  }

  if (toolId === 'career') {
    return toString(asObject(payload.recommended_direction).role_title)
  }

  return toString(payload.recommended_start_project) || toString(payload.target_role)
}

function asObject(value: unknown): AnyObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as AnyObject)
    : {}
}

function firstObject(value: unknown): AnyObject | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const first = value[0]
  return first && typeof first === 'object' && !Array.isArray(first)
    ? (first as AnyObject)
    : null
}

function firstString(value: unknown): string | null {
  if (!Array.isArray(value)) return null
  const first = value.find((item) => typeof item === 'string' && item.trim())
  return typeof first === 'string' ? first.trim() : null
}

function toString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}
