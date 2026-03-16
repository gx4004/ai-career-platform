import { describe, expect, it } from 'vitest'
import {
  getApplicationHandoffPayload,
  getCoverLetterSeed,
  getInterviewSeed,
} from '#/lib/tools/applicationHandoff'
import type { WorkflowContextState } from '#/lib/tools/drafts'

const workflowContext: WorkflowContextState = {
  resumeText: 'Resume text',
  jobDescription: 'Job description',
  lastToolId: 'job-match',
  historyId: 'j1',
  updatedAt: 1,
  resumeAnalysis: {
    history_id: 'r1',
    schema_version: 'quality_v2',
    summary: {
      headline: 'Resume ready',
      verdict: 'Promising but uneven',
      confidence_note: 'Directional heuristic only.',
    },
    top_actions: [],
    generated_at: '2026-03-13T10:00:00Z',
    download_title: 'Resume revision kit',
    exportable_sections: [],
    editable_blocks: [],
    access_mode: 'authenticated',
    saved: true,
    locked_actions: [],
    overall_score: 78,
    score_breakdown: [],
    strengths: ['Clear backend scope'],
    issues: [],
    evidence: {
      detected_sections: ['Summary'],
      detected_skills: ['Python'],
      matched_keywords: ['Python'],
      missing_keywords: ['Kubernetes'],
      quantified_bullets: 1,
    },
    role_fit: null,
  },
  jobMatch: {
    history_id: 'j1',
    schema_version: 'quality_v2',
    summary: {
      headline: 'Good baseline, but Kubernetes still needs proof.',
      verdict: 'borderline',
      confidence_note: 'Directional heuristic only.',
    },
    top_actions: [],
    generated_at: '2026-03-13T10:00:00Z',
    download_title: 'Job match application brief',
    exportable_sections: [],
    editable_blocks: [],
    access_mode: 'authenticated',
    saved: true,
    locked_actions: [],
    match_score: 68,
    verdict: 'borderline',
    requirements: [
      {
        requirement: 'Python',
        importance: 'must',
        status: 'matched',
        resume_evidence: 'Python appears in skills.',
        suggested_fix: 'Keep it visible.',
      },
      {
        requirement: 'Kubernetes',
        importance: 'preferred',
        status: 'missing',
        resume_evidence: 'No orchestration example was found.',
        suggested_fix: 'Add one project example with outcome.',
      },
    ],
    matched_keywords: ['Python'],
    missing_keywords: ['Kubernetes'],
    tailoring_actions: [
      {
        section: 'experience',
        keyword: 'Kubernetes',
        action: 'Add a deployment-focused bullet.',
      },
    ],
    interview_focus: ['Kubernetes', 'Deployment trade-offs'],
    recruiter_summary: 'Strong backend baseline with one infrastructure gap.',
  },
}

describe('applicationHandoff', () => {
  it('builds the payload for downstream application tools', () => {
    const payload = getApplicationHandoffPayload(workflowContext)

    expect(payload.resume_analysis?.history_id).toBe('r1')
    expect(payload.job_match?.history_id).toBe('j1')
  })

  it('extracts cover letter handoff seeds from job match', () => {
    const seed = getCoverLetterSeed(workflowContext)

    expect(seed.missingKeywords).toEqual(['Kubernetes'])
    expect(seed.tailoringActions[0]?.keyword).toBe('Kubernetes')
  })

  it('extracts interview handoff seeds from job match', () => {
    const seed = getInterviewSeed(workflowContext)

    expect(seed.requirementGaps[0]?.requirement).toBe('Kubernetes')
    expect(seed.interviewFocus).toEqual(['Kubernetes', 'Deployment trade-offs'])
  })
})
