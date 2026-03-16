import type { JobMatchResult, ResumeResult } from '#/lib/api/schemas'
import type { WorkflowContextState } from '#/lib/tools/drafts'

export type CoverLetterSeed = {
  missingKeywords: string[]
  tailoringActions: Array<{
    section: 'summary' | 'experience' | 'skills' | 'projects'
    keyword: string
    action: string
  }>
}

export type InterviewSeed = {
  requirementGaps: Array<{
    requirement: string
    status: 'partial' | 'missing'
    suggestedFix: string
  }>
  interviewFocus: string[]
}

type ApplicationHandoffPayload = {
  resume_analysis?: ResumeResult
  job_match?: JobMatchResult
}

export function getApplicationHandoffPayload(
  context: WorkflowContextState | null,
): ApplicationHandoffPayload {
  if (!context) return {}

  return {
    resume_analysis: context.resumeAnalysis,
    job_match: context.jobMatch,
  }
}

export function getCoverLetterSeed(
  context: WorkflowContextState | null,
): CoverLetterSeed {
  const jobMatch = context?.jobMatch

  return {
    missingKeywords: jobMatch?.missing_keywords ?? [],
    tailoringActions: jobMatch?.tailoring_actions ?? [],
  }
}

export function getInterviewSeed(
  context: WorkflowContextState | null,
): InterviewSeed {
  const jobMatch = context?.jobMatch

  return {
    requirementGaps:
      jobMatch?.requirements
        .filter((item) => item.status !== 'matched')
        .map((item) => ({
          requirement: item.requirement,
          status: item.status as 'partial' | 'missing',
          suggestedFix: item.suggested_fix,
        })) ?? [],
    interviewFocus: jobMatch?.interview_focus ?? [],
  }
}
