import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildWorkspaceRequestContext,
  clearCarriedField,
  deriveWorkflowUpdateFromHistoryItem,
  deriveWorkflowUpdateFromResult,
  getCarriedFields,
  getWorkflowTargetRole,
} from '#/lib/tools/workflowContext'
import type { ToolRunDetail } from '#/lib/api/schemas'
import type { WorkflowContextState } from '#/lib/tools/drafts'
import { readWorkflowContext, writeWorkflowContext } from '#/lib/tools/drafts'

function historyItem(partial: Partial<ToolRunDetail> = {}): ToolRunDetail {
  return {
    id: 'run-1',
    tool_name: 'resume_analyzer',
    prompt_version: 'v1',
    latency_ms: 120,
    created_at: '2026-04-17T12:00:00Z',
    result_payload: {} as Record<string, unknown>,
    user_edits_count: 0,
    parent_run_id: null,
    iteration: 1,
    is_favorite: false,
    regenerated_count: 0,
    is_guest: false,
    workspace: null,
    metadata: { linked_context_ids: [] },
    ...partial,
  } as ToolRunDetail
}

describe('deriveWorkflowUpdateFromResult', () => {
  it('maps resume result into the workflow update', () => {
    const update = deriveWorkflowUpdateFromResult('resume', {
      top_actions: [{ title: 'Tighten metrics' }],
      evidence: { missing_keywords: ['Kubernetes', 'Docker'] },
      role_fit: { target_role_label: 'Platform Engineer' },
    })

    expect(update.resumePendingReview).toBe(false)
    expect(update.topActionTitles).toEqual(['Tighten metrics'])
    expect(update.strongestMissingSkills).toEqual(['Kubernetes', 'Docker'])
    expect(update.targetRole).toBe('Platform Engineer')
  })

  it('maps job-match object-shape missing keywords via .keyword', () => {
    const update = deriveWorkflowUpdateFromResult('job-match', {
      top_actions: [{ title: 'Add orchestration bullet' }],
      missing_keywords: [
        {
          keyword: 'Kubernetes',
          contextual_guidance: 'Bucket A',
          anti_stuffing_note: 'Only if you ran a cluster',
        },
      ],
    })

    expect(update.strongestMissingSkills).toEqual(['Kubernetes'])
    expect(update.topActionTitles).toEqual(['Add orchestration bullet'])
  })

  it('maps career recommendation and skill gaps', () => {
    const update = deriveWorkflowUpdateFromResult('career', {
      top_actions: [],
      recommended_direction: { role_title: 'Staff Backend Engineer' },
      skill_gaps: [{ skill: 'Distributed systems' }, { skill: 'Observability' }],
    })

    expect(update.targetRole).toBe('Staff Backend Engineer')
    expect(update.selectedTargetRole).toBe('Staff Backend Engineer')
    expect(update.recommendedDirectionRole).toBe('Staff Backend Engineer')
    expect(update.strongestMissingSkills).toEqual(['Distributed systems', 'Observability'])
  })

  it('maps portfolio target role and starter project', () => {
    const update = deriveWorkflowUpdateFromResult('portfolio', {
      target_role: 'ML Engineer',
      recommended_start_project: 'Telemetry sidecar',
    })

    expect(update.targetRole).toBe('ML Engineer')
    expect(update.recommendedProjectTitle).toBe('Telemetry sidecar')
  })

  it('returns a minimal update for unmatched tool ids', () => {
    const update = deriveWorkflowUpdateFromResult('cover-letter', { top_actions: [] })
    expect(update.resumePendingReview).toBe(false)
    expect(update.topActionTitles).toEqual([])
  })
})

describe('deriveWorkflowUpdateFromHistoryItem', () => {
  it('links history id + workspace + context ids', () => {
    const update = deriveWorkflowUpdateFromHistoryItem(
      historyItem({
        tool_name: 'Resume Analyzer',
        workspace: {
          id: 'ws-1',
          label: 'Backend roles',
          is_pinned: false,
          company: null,
          role: null,
          status: null,
          deadline: null,
          linked_run_ids: [],
          updated_at: '2026-04-17T12:00:00Z',
        },
        metadata: { linked_context_ids: ['a', 'b'] },
        result_payload: {
          top_actions: [],
          evidence: { missing_keywords: ['Kubernetes'] },
        },
      }),
    )

    expect(update.historyId).toBe('run-1')
    expect(update.lastToolId).toBe('resume')
    expect(update.workspaceId).toBe('ws-1')
    expect(update.workspaceLabel).toBe('Backend roles')
    expect(update.linkedContextIds).toEqual(['a', 'b'])
  })

  it('returns an empty update when the tool name is unknown', () => {
    const update = deriveWorkflowUpdateFromHistoryItem(
      historyItem({ tool_name: 'not-a-tool' }),
    )
    expect(update).toEqual({})
  })
})

describe('buildWorkspaceRequestContext', () => {
  it('returns an empty object when context is missing', () => {
    expect(buildWorkspaceRequestContext(null)).toEqual({})
  })

  it('returns an empty object when there is no workspace and no linked ids', () => {
    const context: WorkflowContextState = {
      lastToolId: 'resume',
      resumePendingReview: false,
      updatedAt: 1,
    } as WorkflowContextState
    expect(buildWorkspaceRequestContext(context)).toEqual({})
  })

  it('deduplicates and orders linked history ids, dropping empties', () => {
    const context: WorkflowContextState = {
      lastToolId: 'resume',
      resumePendingReview: false,
      updatedAt: 1,
      historyId: 'run-1',
      linkedContextIds: ['run-2', 'run-1', '', 'run-3'],
      workspaceId: 'ws-1',
    } as WorkflowContextState

    const out = buildWorkspaceRequestContext(context)
    expect(out.workspace_context?.workspace_id).toBe('ws-1')
    expect(out.workspace_context?.linked_history_ids).toEqual(['run-1', 'run-2', 'run-3'])
  })
})

describe('getWorkflowTargetRole', () => {
  it('returns undefined when no candidate is set', () => {
    expect(getWorkflowTargetRole(null)).toBeUndefined()
    expect(
      getWorkflowTargetRole({
        lastToolId: 'resume',
        resumePendingReview: false,
        updatedAt: 1,
      } as WorkflowContextState),
    ).toBeUndefined()
  })

  it('prefers selectedTargetRole over other candidates', () => {
    const ctx = {
      lastToolId: 'resume',
      resumePendingReview: false,
      updatedAt: 1,
      selectedTargetRole: 'Staff Engineer',
      targetRole: 'Senior Engineer',
      recommendedDirectionRole: 'Lead Engineer',
    } as WorkflowContextState
    expect(getWorkflowTargetRole(ctx)).toBe('Staff Engineer')
  })

  it('falls back through targetRole, recommendedDirection, portfolio, career, resume rolefit', () => {
    const ctx = {
      lastToolId: 'resume',
      resumePendingReview: false,
      updatedAt: 1,
      resumeAnalysis: { role_fit: { target_role_label: 'Backend Engineer' } },
    } as WorkflowContextState
    expect(getWorkflowTargetRole(ctx)).toBe('Backend Engineer')
  })

  it('skips empty-string candidates', () => {
    const ctx = {
      lastToolId: 'resume',
      resumePendingReview: false,
      updatedAt: 1,
      selectedTargetRole: '   ',
      targetRole: 'Real Role',
    } as WorkflowContextState
    expect(getWorkflowTargetRole(ctx)).toBe('Real Role')
  })
})

describe('getCarriedFields', () => {
  const fullContext = {
    lastToolId: 'resume',
    resumePendingReview: false,
    updatedAt: 1,
    resumeText: 'Resume body',
    jobDescription: 'Job posting body',
    targetRole: 'Backend Engineer',
  } as WorkflowContextState

  it('returns no fields for a null or empty context', () => {
    expect(getCarriedFields(null, 'job-match')).toEqual([])
    expect(
      getCarriedFields(
        {
          lastToolId: 'resume',
          resumePendingReview: false,
          updatedAt: 1,
        } as WorkflowContextState,
        'job-match',
      ),
    ).toEqual([])
  })

  it('names resume + job description on a non-planner tool (mirrors useWorkflowBridge)', () => {
    expect(getCarriedFields(fullContext, 'job-match')).toEqual([
      { key: 'resume', label: 'Resume' },
      { key: 'jobDescription', label: 'Job description' },
    ])
    // Same on cover-letter/interview: still no target role there.
    expect(getCarriedFields(fullContext, 'cover-letter')).toEqual([
      { key: 'resume', label: 'Resume' },
      { key: 'jobDescription', label: 'Job description' },
    ])
  })

  it('names resume + target role on a planner tool, not the job description', () => {
    expect(getCarriedFields(fullContext, 'career')).toEqual([
      { key: 'resume', label: 'Resume' },
      { key: 'targetRole', label: 'Target role' },
    ])
    expect(getCarriedFields(fullContext, 'portfolio')).toEqual([
      { key: 'resume', label: 'Resume' },
      { key: 'targetRole', label: 'Target role' },
    ])
  })

  it('reports only the fields that actually carry', () => {
    const ctx = {
      lastToolId: 'resume',
      resumePendingReview: false,
      updatedAt: 1,
      resumeText: 'Resume body',
      jobDescription: '   ',
    } as WorkflowContextState

    expect(getCarriedFields(ctx, 'job-match')).toEqual([{ key: 'resume', label: 'Resume' }])
  })

  it('derives the target-role field from any role source on a planner', () => {
    const ctx = {
      lastToolId: 'career',
      resumePendingReview: false,
      updatedAt: 1,
      recommendedDirectionRole: 'Staff Engineer',
    } as WorkflowContextState

    expect(getCarriedFields(ctx, 'portfolio')).toEqual([
      { key: 'targetRole', label: 'Target role' },
    ])
  })
})

describe('clearCarriedField', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  afterEach(() => {
    window.sessionStorage.clear()
  })

  function seed(partial: Partial<WorkflowContextState>): void {
    writeWorkflowContext({
      lastToolId: 'job-match',
      resumePendingReview: false,
      updatedAt: Date.now(),
      ...partial,
    })
  }

  it('is a no-op when there is no workflow context', () => {
    expect(() => clearCarriedField('resume')).not.toThrow()
    expect(readWorkflowContext()).toBeNull()
  })

  it('stops the resume from carrying while preserving other fields', () => {
    seed({
      resumeText: 'Resume body',
      resumePendingReview: true,
      jobDescription: 'Job posting body',
    })

    clearCarriedField('resume')

    const next = readWorkflowContext()
    expect(next?.resumeText).toBeUndefined()
    expect(next?.jobDescription).toBe('Job posting body')
    expect(getCarriedFields(next, 'job-match')).toEqual([
      { key: 'jobDescription', label: 'Job description' },
    ])
  })

  it('does not cross-clear a target role that only a carried resume analysis derives', () => {
    seed({
      resumeText: 'Resume body',
      resumeAnalysis: {
        role_fit: { target_role_label: 'Backend Engineer' },
      } as WorkflowContextState['resumeAnalysis'],
    })

    clearCarriedField('resume')

    const next = readWorkflowContext()
    expect(next?.resumeText).toBeUndefined()
    // Clearing the resume must not neutralise an independent carried field.
    expect(getWorkflowTargetRole(next)).toBe('Backend Engineer')
  })

  it('stops the job description from carrying', () => {
    seed({ resumeText: 'Resume body', jobDescription: 'Job posting body' })

    clearCarriedField('jobDescription')

    const next = readWorkflowContext()
    expect(next?.jobDescription).toBeUndefined()
    expect(getCarriedFields(next, 'job-match')).toEqual([{ key: 'resume', label: 'Resume' }])
  })

  it('stops the target role from carrying across every role source', () => {
    seed({
      resumeText: 'Resume body',
      selectedTargetRole: 'Staff Engineer',
      targetRole: 'Senior Engineer',
      recommendedDirectionRole: 'Lead Engineer',
      resumeAnalysis: {
        role_fit: { target_role_label: 'Backend Engineer' },
      } as WorkflowContextState['resumeAnalysis'],
    })

    clearCarriedField('targetRole')

    const next = readWorkflowContext()
    expect(getWorkflowTargetRole(next)).toBeUndefined()
    expect(next?.resumeText).toBe('Resume body')
    expect(getCarriedFields(next, 'career')).toEqual([{ key: 'resume', label: 'Resume' }])
  })
})
