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
            endpoint_url: 'https://fixture.example/jobs',
            allowed_query_parameters: ['role', 'location'],
            robots_policy: 'required',
            rate_limit_per_minute: 12,
            attribution_rule: 'Show source name and original link',
            retention_days: 30,
            kill_switch: false,
            ingestion_allowed: true,
            last_fetched_at: null,
            last_outcome: null,
            listing_count: null,
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
          endpoint_url: 'https://fixture.example/jobs',
          allowed_query_parameters: ['role'],
          robots_policy: 'required',
          rate_limit_per_minute: 10,
          attribution_rule: 'None',
          retention_days: 30,
          kill_switch: false,
          ingestion_allowed: true,
          last_fetched_at: null,
          last_outcome: null,
          listing_count: null,
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
          endpoint_url: 'https://fixture.example/jobs',
          allowed_query_parameters: ['role'],
          robots_policy: 'required',
          rate_limit_per_minute: 12,
          attribution_rule: 'Show source name and original link',
          retention_days: 30,
          kill_switch: true,
          ingestion_allowed: false,
          last_fetched_at: null,
          last_outcome: null,
          listing_count: null,
          created_at: 'not-a-date',
          updated_at: '2026-07-13',
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  // Real seeded shape (backend/app/scripts/ats_sources.json +
  // seed_ats_sources.py): employer-ATS sources carry a single
  // provider-specific query switch outside the licensed-source param set
  // (`content`, `mode`, `includeCompensation` per provider), and the schema
  // is a read-only mirror of whatever the backend already validated on
  // write — it must not re-reject that shape.
  it('accepts a real employer-ATS source shape from the seed script', () => {
    const result = discoverySourceListSchema.safeParse({
      items: [
        {
          id: 'source-1',
          source_key: 'employer-ats-greenhouse-figma',
          display_name: 'Figma',
          source_family: 'employer_ats',
          owner: 'Discovery Operations',
          terms_status: 'accepted',
          terms_reviewed_at: '2026-07-13T00:00:00Z',
          terms_reviewed_by: 'ats-seed-reviewer@system.internal',
          allowed_behavior: 'ats_integration',
          endpoint_url: 'https://boards-api.greenhouse.io/v1/boards/figma/jobs',
          allowed_query_parameters: ['content'],
          robots_policy: 'not_applicable',
          rate_limit_per_minute: 20,
          attribution_rule: 'Show the company name, the source name (Greenhouse) and the original listing link',
          retention_days: 45,
          kill_switch: false,
          ingestion_allowed: true,
          last_fetched_at: null,
          last_outcome: null,
          listing_count: null,
          created_at: '2026-07-13T00:00:00Z',
          updated_at: '2026-07-13T00:00:00Z',
        },
      ],
    })
    expect(result.success).toBe(true)
    expect(result.data?.items[0].allowed_query_parameters).toEqual(['content'])
  })

  it('accepts lever and ashby query parameters that fall outside the licensed set', () => {
    const result = discoverySourceListSchema.safeParse({
      items: [
        {
          id: 'source-2',
          source_key: 'employer-ats-lever-example',
          display_name: 'Example Co',
          source_family: 'employer_ats',
          owner: 'Discovery Operations',
          terms_status: 'accepted',
          terms_reviewed_at: '2026-07-13T00:00:00Z',
          terms_reviewed_by: 'ats-seed-reviewer@system.internal',
          allowed_behavior: 'ats_integration',
          endpoint_url: 'https://api.lever.co/v0/postings/example',
          allowed_query_parameters: ['mode'],
          robots_policy: 'not_applicable',
          rate_limit_per_minute: 20,
          attribution_rule: 'Show the company name, the source name (Lever) and the original listing link',
          retention_days: 45,
          kill_switch: false,
          ingestion_allowed: true,
          last_fetched_at: null,
          last_outcome: null,
          listing_count: null,
          created_at: '2026-07-13T00:00:00Z',
          updated_at: '2026-07-13T00:00:00Z',
        },
        {
          id: 'source-3',
          source_key: 'employer-ats-ashby-other',
          display_name: 'Other Co',
          source_family: 'employer_ats',
          owner: 'Discovery Operations',
          terms_status: 'accepted',
          terms_reviewed_at: '2026-07-13T00:00:00Z',
          terms_reviewed_by: 'ats-seed-reviewer@system.internal',
          allowed_behavior: 'ats_integration',
          endpoint_url: 'https://api.ashbyhq.com/posting-api/job-board/other',
          allowed_query_parameters: ['includeCompensation'],
          robots_policy: 'not_applicable',
          rate_limit_per_minute: 20,
          attribution_rule: 'Show the company name, the source name (Ashby) and the original listing link',
          retention_days: 45,
          kill_switch: false,
          ingestion_allowed: true,
          last_fetched_at: null,
          last_outcome: null,
          listing_count: null,
          created_at: '2026-07-13T00:00:00Z',
          updated_at: '2026-07-13T00:00:00Z',
        },
      ],
    })
    expect(result.success).toBe(true)
  })
})
