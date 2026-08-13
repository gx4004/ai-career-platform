import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAdminEvalRuns, getAdminScorecard } from '#/lib/api/admin'

const fetchMock = vi.fn()

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

const validEvalItem = {
  tool_id: 'resume',
  has_report: true,
  report_schema_version: 'r8-eval-report-v1',
  prompt_version: 'resume-v3',
  judge_prompt_version: null,
  generated_at: '2026-07-09T12:00:00+00:00',
  mode: 'deterministic',
  fixtures_evaluated: 11,
  calibration_miss_rate: 0.09,
  fabrication_candidate_count: null,
  usefulness_score: null,
}

const validScorecardTrigger = {
  id: 'provider_incidents',
  label: 'Provider incidents',
  threshold: '3 user-visible incidents in 30 days',
  observation_window: '30 days',
  minimum_sample: 'Any grouped incident',
  evidence: 'No incident threshold breach.',
  evidence_detail: { incidents: 0, raw_failures: 0 },
  evidence_fresh: false,
  last_evidence_at: null,
  state: 'insufficient_sample',
  review_required: false,
  response_ticket: 138,
  response_ticket_title: 'Qualify a provider fallback',
  owner: 'Product owner',
  rollback: 'Keep the primary-only path.',
  exit_criteria: 'Incident count remains below threshold.',
}

const validScorecard = {
  generated_at: '2026-07-11T12:00:00+00:00',
  window_start: '2026-06-11T12:00:00+00:00',
  window_end: '2026-07-11T12:00:00+00:00',
  replica_class: 'single',
  triggers: [validScorecardTrigger],
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('admin eval response contract', () => {
  it('accepts a complete valid report fixture through the public client', async () => {
    const payload = { tools: [validEvalItem] }
    fetchMock.mockResolvedValueOnce(jsonResponse(payload))

    await expect(getAdminEvalRuns()).resolves.toEqual(payload)
  })

  it('rejects unknown content fields through the public client', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      tools: [{
        tool_id: 'resume',
        has_report: false,
        report_schema_version: null,
        prompt_version: null,
        judge_prompt_version: null,
        generated_at: null,
        mode: null,
        fixtures_evaluated: null,
        calibration_miss_rate: null,
        fabrication_candidate_count: null,
        usefulness_score: null,
        resume_text: 'must never cross the admin aggregate contract',
      }],
    }))

    await expect(getAdminEvalRuns()).rejects.toMatchObject({ status: 502 })
  })

  it.each([
    { generated_at: 'not-a-date' },
    { mode: 'preview' },
    { fixtures_evaluated: -1 },
    { calibration_miss_rate: 1.1 },
    { fabrication_candidate_count: -1 },
    { usefulness_score: 5.1 },
  ])('rejects malformed bounded report fields through the public client: %o', async invalid => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      tools: [{ ...validEvalItem, ...invalid }],
    }))

    await expect(getAdminEvalRuns()).rejects.toMatchObject({ status: 502 })
  })
})

describe('admin scorecard response contract', () => {
  it('accepts a complete valid scorecard fixture through the public client', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(validScorecard))

    await expect(getAdminScorecard()).resolves.toEqual(validScorecard)
  })

  it('rejects unknown provider details through the public client', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      ...validScorecard,
      triggers: [{
        ...validScorecardTrigger,
        provider_exception: 'raw provider failure',
      }],
    }))

    await expect(getAdminScorecard()).rejects.toMatchObject({ status: 502 })
  })

  it.each([
    { generated_at: 'not-a-date' },
    { replica_class: 'many' },
    { triggers: [{ ...validScorecardTrigger, state: 'unknown' }] },
    { triggers: [{ ...validScorecardTrigger, response_ticket: 0 }] },
    { triggers: [{ ...validScorecardTrigger, last_evidence_at: 'yesterday' }] },
    { triggers: [{ ...validScorecardTrigger, evidence_detail: { incidents: false } }] },
  ])('rejects malformed scorecard fields through the public client: %o', async invalid => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...validScorecard, ...invalid }))

    await expect(getAdminScorecard()).rejects.toMatchObject({ status: 502 })
  })
})
