import { describe, expect, it } from 'vitest'
import { jobMatchResultSchema } from '#/lib/api/schemas'

// Mirrors JobMatchResponse in backend/app/schemas/tools.py (B16: job_title and company).
const result = {
  history_id: 'run-1',
  schema_version: 'quality_v2',
  summary: { headline: 'You match 3 of 6 requirements.', verdict: 'borderline', confidence_note: 'Directional.' },
  top_actions: [],
  generated_at: '2026-10-06T00:00:00Z',
  download_title: 'Job match brief',
  match_score: 74,
  verdict: 'borderline',
  requirements: [],
  matched_keywords: ['Python'],
  missing_keywords: [],
  tailoring_actions: [],
  interview_focus: [],
  recruiter_summary: '',
}

describe('job match result contract', () => {
  it('carries the job the posting names', () => {
    const parsed = jobMatchResultSchema.parse({
      ...result,
      job_title: 'Senior Backend Engineer, Platform',
      company: 'Northwind Labs',
    })
    expect(parsed.job_title).toBe('Senior Backend Engineer, Platform')
    expect(parsed.company).toBe('Northwind Labs')
  })

  it('accepts null when the posting names no company, and a run saved before the fields existed', () => {
    expect(jobMatchResultSchema.parse({ ...result, job_title: 'Backend Engineer', company: null }).company).toBeNull()
    expect(jobMatchResultSchema.parse(result).job_title).toBeUndefined()
  })
})
