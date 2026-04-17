import { describe, expect, it } from 'vitest'
import {
  deriveRunMetadata,
  getNextStepToolId,
  type RunMetadata,
} from '#/lib/tools/runMetadata'

describe('deriveRunMetadata', () => {
  it('fills the four fields from a resume payload', () => {
    const meta = deriveRunMetadata('resume', {
      schema_version: 'quality_v2',
      summary: { headline: 'Resume ready' },
      role_fit: { target_role_label: 'Backend Engineer' },
      strengths: ['Scope clarity'],
    })
    expect(meta.schema_version).toBe('quality_v2')
    expect(meta.summary_headline).toBe('Resume ready')
    expect(meta.primary_recommendation_title).toBe('Backend Engineer')
    expect(meta.next_step_tool).toBe('job-match')
    expect(meta.linked_context_ids).toEqual([])
  })

  it('falls back to the first non-empty strength on resume payloads without role_fit', () => {
    const meta = deriveRunMetadata('resume', {
      strengths: ['', '   ', 'Measurable impact'],
    })
    expect(meta.primary_recommendation_title).toBe('Measurable impact')
  })

  it('picks recruiter summary then verdict for job-match', () => {
    expect(
      deriveRunMetadata('job-match', { recruiter_summary: 'Strong baseline.' })
        .primary_recommendation_title,
    ).toBe('Strong baseline.')
    expect(
      deriveRunMetadata('job-match', { verdict: 'borderline' })
        .primary_recommendation_title,
    ).toBe('borderline')
  })

  it('returns "Targeted cover letter" fallback when tone_used is missing', () => {
    expect(
      deriveRunMetadata('cover-letter', {}).primary_recommendation_title,
    ).toBe('Targeted cover letter')
  })

  it('reads the first interview focus area as the primary recommendation', () => {
    const meta = deriveRunMetadata('interview', {
      focus_areas: [{ title: 'System design depth' }, { title: 'Leadership' }],
    })
    expect(meta.primary_recommendation_title).toBe('System design depth')
  })

  it('returns "Interview practice deck" when focus areas are empty', () => {
    expect(
      deriveRunMetadata('interview', { focus_areas: [] }).primary_recommendation_title,
    ).toBe('Interview practice deck')
  })

  it('uses recommended direction role title for career', () => {
    const meta = deriveRunMetadata('career', {
      recommended_direction: { role_title: 'Staff Backend Engineer' },
    })
    expect(meta.primary_recommendation_title).toBe('Staff Backend Engineer')
  })

  it('falls back to recommended_start_project or target_role for portfolio', () => {
    expect(
      deriveRunMetadata('portfolio', { recommended_start_project: 'Telemetry sidecar' })
        .primary_recommendation_title,
    ).toBe('Telemetry sidecar')
    expect(
      deriveRunMetadata('portfolio', { target_role: 'ML Platform Lead' })
        .primary_recommendation_title,
    ).toBe('ML Platform Lead')
  })

  it('accepts overrides for linkedContextIds and nextStepTool', () => {
    const meta = deriveRunMetadata('resume', {}, {
      linkedContextIds: ['a', 'b'],
      nextStepTool: 'career',
    })
    expect(meta.linked_context_ids).toEqual(['a', 'b'])
    expect(meta.next_step_tool).toBe('career')
  })
})

describe('getNextStepToolId', () => {
  it('falls back to the default chain when metadata is missing', () => {
    expect(getNextStepToolId('resume')).toBe('job-match')
    expect(getNextStepToolId('portfolio')).toBe('resume')
  })

  it('prefers a valid next_step_tool from metadata', () => {
    const meta = { next_step_tool: 'career' } as RunMetadata
    expect(getNextStepToolId('resume', meta)).toBe('career')
  })

  it('ignores an invalid next_step_tool and falls back', () => {
    const meta = { next_step_tool: 'not-a-tool' } as RunMetadata
    expect(getNextStepToolId('resume', meta)).toBe('job-match')
  })
})
