import { describe, expect, it } from 'vitest'
import {
  adminActivationQuerySchema,
  adminActivationSchema,
} from '#/lib/api/admin'

const response = {
  window_start: '2026-08-01T00:00:00+00:00',
  window_end: '2026-08-12T00:00:00+00:00',
  access_mode: 'authenticated',
  tool_id: 'resume',
  funnel: [{ step: 'run', label: 'Run', count: 2 }],
  failures: [{ failure_category: 'provider', count: 1 }],
  tools: [{
    tool_id: 'resume',
    runs: 2,
    avg_duration_ms: 120,
    total_cost_estimate: '0.001000',
    avg_cost_estimate: '0.000500',
  }],
}

describe('admin activation contracts', () => {
  it('accepts the complete operational tool domain in query input', () => {
    expect(adminActivationQuerySchema.safeParse({ tool_id: 'resume' }).success).toBe(true)
    expect(adminActivationQuerySchema.safeParse({ tool_id: 'application-reviewer' }).success).toBe(true)
    expect(adminActivationQuerySchema.safeParse({ tool_id: 'cv-quality' }).success).toBe(true)
    expect(adminActivationQuerySchema.safeParse({ tool_id: 'cv-tailoring' }).success).toBe(true)
    expect(adminActivationQuerySchema.safeParse({ tool_id: 'arbitrary-tool' }).success).toBe(false)
  })

  it('rejects drifted activation response identifiers and counts', () => {
    expect(adminActivationSchema.safeParse(response).success).toBe(true)
    expect(adminActivationSchema.safeParse({ ...response, tool_id: 'arbitrary-tool' }).success).toBe(false)
    expect(adminActivationSchema.safeParse({
      ...response,
      funnel: [{ step: 'run', label: 'Run', count: -1 }],
    }).success).toBe(false)
  })
})
