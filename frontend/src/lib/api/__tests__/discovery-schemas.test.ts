import { describe, expect, it } from 'vitest'
import { discoverySourceListSchema } from '#/lib/api/discoverySchemas'

describe('discovery source contracts', () => {
  it('accepts an employer-ATS source as the backend returns it', () => {
    const parsed = discoverySourceListSchema.parse({
      items: [
        {
          id: 'source-1',
          source_key: 'employer-ats-greenhouse-figma',
          display_name: 'Figma',
          source_family: 'employer_ats',
          owner: 'Discovery Operations',
          terms_status: 'accepted',
          terms_reviewed_at: '2026-07-13T00:00:00Z',
          terms_reviewed_by: 'Legal Reviewer',
          allowed_behavior: 'ats_integration',
          endpoint_url: 'https://boards-api.greenhouse.io/v1/boards/figma/jobs',
          rate_limit_per_minute: 20,
          attribution_rule: 'Show company, source name and original link',
          retention_days: 45,
          kill_switch: false,
          ingestion_allowed: true,
          last_fetched_at: '2026-09-28T06:00:00Z',
          last_outcome: 'ok',
          listing_count: 12,
          created_at: '2026-07-13T00:00:00Z',
          updated_at: '2026-07-13T00:00:00Z',
        },
      ],
    })
    expect(parsed.items[0].listing_count).toBe(12)
  })

  it('keeps the readable failure reason the backend computes for a failed fetch (B13)', () => {
    const parsed = discoverySourceListSchema.parse({
      items: [
        {
          id: 'source-2',
          source_key: 'employer-ats-greenhouse-deadboard',
          display_name: 'Deadboard',
          source_family: 'employer_ats',
          owner: 'Discovery Operations',
          terms_status: 'accepted',
          terms_reviewed_at: '2026-07-13T00:00:00Z',
          terms_reviewed_by: 'Legal Reviewer',
          allowed_behavior: 'ats_integration',
          endpoint_url: 'https://boards-api.greenhouse.io/v1/boards/deadboard/jobs',
          rate_limit_per_minute: 20,
          attribution_rule: 'Show company, source name and original link',
          retention_days: 45,
          kill_switch: false,
          ingestion_allowed: true,
          last_fetched_at: '2026-09-28T06:00:00Z',
          last_outcome: 'failed: HTTPStatusError 404',
          failure_reason: 'The board was not found (HTTP 404): check the board name in the endpoint URL.',
          listing_count: null,
          created_at: '2026-07-13T00:00:00Z',
          updated_at: '2026-07-13T00:00:00Z',
        },
      ],
    })
    expect(parsed.items[0].failure_reason).toMatch(/HTTP 404/)
  })
})
