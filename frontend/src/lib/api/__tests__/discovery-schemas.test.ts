import { describe, expect, it } from 'vitest'
import { discoverySourceListSchema } from '#/lib/api/discoverySchemas'

describe('discovery source contracts', () => {
  it('accepts the complete governance response shape', () => {
    expect(
      discoverySourceListSchema.parse({
        items: [
          {
            id: 'source-1',
            source_key: 'licensed-example',
            display_name: 'Licensed Example Feed',
            source_family: 'licensed',
            owner: 'Discovery Operations',
            terms_status: 'accepted',
            terms_reviewed_at: '2026-07-13T00:00:00Z',
            terms_reviewed_by: 'Legal Reviewer',
            allowed_behavior: 'feed',
            rate_limit_per_minute: 12,
            attribution_rule: 'Show source name and original link',
            retention_days: 30,
            kill_switch: false,
            ingestion_allowed: true,
            created_at: '2026-07-13T00:00:00Z',
            updated_at: '2026-07-13T00:00:00Z',
          },
        ],
      }).items[0].source_family,
    ).toBe('licensed')
  })

  it('rejects registry values outside the backend closed sets', () => {
    const result = discoverySourceListSchema.safeParse({
      items: [
        {
          id: 'source-1',
          source_key: 'bad-source',
          display_name: 'Bad source',
          source_family: 'scraped_board',
          owner: 'Nobody',
          terms_status: 'accepted',
          terms_reviewed_at: '2026-07-13T00:00:00Z',
          terms_reviewed_by: 'Reviewer',
          allowed_behavior: 'crawler',
          rate_limit_per_minute: 10,
          attribution_rule: 'None',
          retention_days: 30,
          kill_switch: false,
          ingestion_allowed: true,
          created_at: '2026-07-13T00:00:00Z',
          updated_at: '2026-07-13T00:00:00Z',
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('rejects timestamps that the backend datetime contract cannot parse', () => {
    const result = discoverySourceListSchema.safeParse({
      items: [
        {
          id: 'source-1',
          source_key: 'licensed-example',
          display_name: 'Licensed Example Feed',
          source_family: 'licensed',
          owner: 'Discovery Operations',
          terms_status: 'pending',
          terms_reviewed_at: 'yesterday',
          terms_reviewed_by: null,
          allowed_behavior: 'feed',
          rate_limit_per_minute: 12,
          attribution_rule: 'Show source name and original link',
          retention_days: 30,
          kill_switch: true,
          ingestion_allowed: false,
          created_at: 'not-a-date',
          updated_at: '2026-07-13',
        },
      ],
    })
    expect(result.success).toBe(false)
  })
})
