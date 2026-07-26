import { describe, expect, it } from 'vitest'
import {
  adminSubmissionSafetySchema,
  submissionSafetyPolicyConfigSchema,
  submissionSafetyStatusSchema,
} from '#/lib/api/submissionSafetySchemas'

describe('submission safety contracts', () => {
  const policy = {
    user_rate_limit_per_minute: 2,
    user_daily_volume_limit: 20,
    source_rate_limit_per_minute: 10,
    source_daily_volume_limit: 100,
    anomaly_user_attempts_per_hour: 8,
  }

  it('mirrors strict bounded policy and operational control shapes', () => {
    expect(submissionSafetyPolicyConfigSchema.parse(policy)).toEqual(policy)
    expect(
      submissionSafetyPolicyConfigSchema.safeParse({
        ...policy,
        anomaly_user_attempts_per_hour: 21,
      }).success,
    ).toBe(false)
    expect(
      adminSubmissionSafetySchema.parse({
        control: {
          global_kill_switch: true,
          incident_playbook_version: null,
          incident_rehearsed_at: null,
          updated_at: '2026-07-26T12:00:00Z',
        },
        policies: [
          {
            ...policy,
            discovery_source_id: 'source-1',
            configured_at: '2026-07-26T12:00:00Z',
            updated_at: '2026-07-26T12:00:00Z',
          },
        ],
      }).policies,
    ).toHaveLength(1)
  })

  it('requires allowed state and a closed blocking reason to agree', () => {
    const status = {
      allowed: false,
      reason: 'user_paused',
      user_rate_used: 1,
      user_rate_limit: 2,
      user_daily_used: 3,
      user_daily_limit: 20,
      source_rate_used: 4,
      source_rate_limit: 10,
      source_daily_used: 5,
      source_daily_limit: 100,
    }
    expect(submissionSafetyStatusSchema.parse(status).reason).toBe('user_paused')
    expect(
      submissionSafetyStatusSchema.safeParse({ ...status, allowed: true }).success,
    ).toBe(false)
    expect(
      submissionSafetyStatusSchema.safeParse({ ...status, reason: 'provider said no' }).success,
    ).toBe(false)
  })
})
