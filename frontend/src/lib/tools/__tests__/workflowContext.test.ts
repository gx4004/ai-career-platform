import { describe, expect, it } from 'vitest'
import {
  buildWorkspaceRequestContext,
  deriveWorkflowUpdateFromHistoryItem,
  deriveWorkflowUpdateFromResult,
  getWorkflowTargetRole,
  originsAfterRun,
} from '#/lib/tools/workflowContext'
import type { ToolRunDetail } from '#/lib/api/schemas'
import type { WorkflowContextState } from '#/lib/tools/drafts'

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
          listing: null,
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

  it('rejects context identifiers beyond backend limits', () => {
    const oversizedId = {
      lastToolId: 'resume',
      updatedAt: 1,
      workspaceId: 'x'.repeat(101),
    } as WorkflowContextState
    const excessiveLinks = {
      lastToolId: 'resume',
      updatedAt: 1,
      linkedContextIds: Array.from({ length: 51 }, (_, index) => `run-${index}`),
    } as WorkflowContextState

    expect(() => buildWorkspaceRequestContext(oversizedId)).toThrow()
    expect(() => buildWorkspaceRequestContext(excessiveLinks)).toThrow()
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


// The hand-off banner names where each carried value was supplied. A run records that, and never takes the credit for a
// value it merely used (Resume upload -> Job Match -> Career Path: the resume is still from Resume Analyzer).
describe('originsAfterRun', () => {
  const resume = 'Jordan Rivera. Backend engineer, five years of Python.'
  const job = 'Senior Backend Engineer at Northwind Labs.'

  it('keeps the origin of a value the run did not change, and credits the run for a new one', () => {
    const previous = { resumeText: resume, resumeOrigin: 'resume', jobDescription: job, jobOrigin: 'job-match', updatedAt: 1 } as WorkflowContextState
    expect(originsAfterRun('cover-letter', previous, { resumeText: resume, jobDescription: job })).toMatchObject({
      resumeOrigin: 'resume',
      jobOrigin: 'job-match',
    })
    expect(originsAfterRun('cover-letter', previous, { resumeText: resume, jobDescription: 'A different posting.' }).jobOrigin).toBe('cover-letter')
  })

  it('takes the resume’s origin from the tab carry when the run used that text', () => {
    const origins = originsAfterRun('job-match', null, { resumeText: resume }, { text: resume, origin: 'resume' })
    expect(origins.resumeOrigin).toBe('resume')
    expect(originsAfterRun('job-match', null, { resumeText: resume }, { text: 'other', origin: 'resume' }).resumeOrigin).toBe('job-match')
  })

  it('keeps a Re-generate’s “found in your account” label only while the text is the same', () => {
    const previous = { resumeText: resume, resumeSource: 'your CV Studio CV “Platform CV”', resumeOrigin: 'cv-studio', updatedAt: 1 } as WorkflowContextState
    expect(originsAfterRun('job-match', previous, { resumeText: resume })).toMatchObject({
      resumeSource: 'your CV Studio CV “Platform CV”',
      resumeOrigin: 'cv-studio',
    })
    expect(originsAfterRun('job-match', previous, { resumeText: 'Edited resume text.' }).resumeSource).toBeUndefined()
  })

  it('leaves fields the tool does not have alone, and follows the target role the next tool will see', () => {
    const previous = { jobDescription: job, jobOrigin: 'job-match', selectedTargetRole: 'Staff Engineer', roleOrigin: 'career', updatedAt: 1 } as WorkflowContextState
    const origins = originsAfterRun('resume', previous, { resumeText: resume, targetRole: 'Backend Engineer', roleOrigin: 'resume' })
    expect('jobOrigin' in origins).toBe(false)
    // The Resume run's own role sits behind the role Career Path selected, which is what a form shows: still Career Path's.
    expect(origins.roleOrigin).toBe('career')
    expect(originsAfterRun('career', previous, { selectedTargetRole: 'Platform Engineer', roleOrigin: 'career' }).roleOrigin).toBe('career')
    expect(originsAfterRun('portfolio', null, { selectedTargetRole: 'Data Engineer', targetRole: 'Data Engineer' }).roleOrigin).toBe('portfolio')
  })
})
