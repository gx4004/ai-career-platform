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
            submission_governance: {
              id: 'submission-source-1',
              legal_terms_status: 'accepted',
              legal_terms_reviewed_at: '2026-07-13T00:00:00Z',
              legal_terms_reviewed_by: 'Legal Reviewer',
              contract_status: 'verified',
              contract_version: 'synthetic-ats/v1',
              contract_fields: [
                {
                  source_field: 'candidate_email',
                  packet_field: 'candidate.email',
                  required: true,
                },
              ],
              contract_formats: [
                { source_field: 'candidate_email', kind: 'email' },
              ],
              contract_error_semantics: [
                {
                  source_code: 'accepted',
                  meaning: 'accepted',
                  handling: 'confirm_success',
                },
              ],
              contract_reviewed_at: '2026-07-13T00:00:00Z',
              contract_reviewed_by: 'Integration Reviewer',
              promoted: true,
              promoted_at: '2026-07-13T00:00:00Z',
              promoted_by: 'Submission Operator',
              kill_switch: false,
              submission_allowed: true,
              created_at: '2026-07-13T00:00:00Z',
              updated_at: '2026-07-13T00:00:00Z',
            },
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
          submission_governance: null,
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
          submission_governance: null,
          created_at: 'not-a-date',
          updated_at: '2026-07-13',
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('rejects unsafe endpoints and duplicate query declarations', () => {
    const result = discoverySourceListSchema.safeParse({
      items: [
        {
          id: 'source-1',
          source_key: 'licensed-example',
          display_name: 'Licensed Example Feed',
          source_family: 'licensed',
          owner: 'Discovery Operations',
          terms_status: 'pending',
          terms_reviewed_at: null,
          terms_reviewed_by: null,
          allowed_behavior: 'feed',
          endpoint_url: 'https://user:password@fixture.example/jobs?profile=secret',
          allowed_query_parameters: ['role', 'role'],
          robots_policy: 'required',
          rate_limit_per_minute: 12,
          attribution_rule: 'Show source name and original link',
          retention_days: 30,
          kill_switch: true,
          ingestion_allowed: false,
          submission_governance: null,
          created_at: '2026-07-13T00:00:00Z',
          updated_at: '2026-07-13T00:00:00Z',
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('rejects challenge semantics that the backend would not accept', () => {
    const valid = discoverySourceListSchema.parse({
      items: [
        {
          id: 'source-1',
          source_key: 'licensed-example',
          display_name: 'Licensed Example Feed',
          source_family: 'licensed',
          owner: 'Discovery Operations',
          terms_status: 'accepted',
          terms_reviewed_at: '2026-07-13T00:00:00Z',
          terms_reviewed_by: 'Reviewer',
          allowed_behavior: 'feed',
          endpoint_url: 'https://fixture.example/jobs',
          allowed_query_parameters: [],
          robots_policy: 'required',
          rate_limit_per_minute: 12,
          attribution_rule: 'Show source',
          retention_days: 30,
          kill_switch: false,
          ingestion_allowed: true,
          submission_governance: {
            id: 'submission-1',
            legal_terms_status: 'accepted',
            legal_terms_reviewed_at: '2026-07-13T00:00:00Z',
            legal_terms_reviewed_by: 'Reviewer',
            contract_status: 'verified',
            contract_version: 'fixture/v1',
            contract_fields: [
              {
                source_field: 'candidate_email',
                packet_field: 'candidate.email',
                required: true,
              },
            ],
            contract_formats: [
              { source_field: 'candidate_email', kind: 'email' },
            ],
            contract_error_semantics: [
              {
                source_code: 'challenge',
                meaning: 'challenge',
                handling: 'stop_and_return',
              },
              {
                source_code: 'accepted',
                meaning: 'accepted',
                handling: 'confirm_success',
              },
            ],
            contract_reviewed_at: '2026-07-13T00:00:00Z',
            contract_reviewed_by: 'Reviewer',
            promoted: false,
            promoted_at: null,
            promoted_by: null,
            kill_switch: true,
            submission_allowed: false,
            created_at: '2026-07-13T00:00:00Z',
            updated_at: '2026-07-13T00:00:00Z',
          },
          created_at: '2026-07-13T00:00:00Z',
          updated_at: '2026-07-13T00:00:00Z',
        },
      ],
    })
    valid.items[0].submission_governance!.contract_error_semantics![0].handling =
      'retry_with_source_idempotency'

    expect(discoverySourceListSchema.safeParse(valid).success).toBe(false)

    valid.items[0].submission_governance!.contract_error_semantics![0].handling =
      'stop_and_return'
    valid.items[0].submission_governance!.contract_fields = []
    valid.items[0].submission_governance!.contract_formats = []
    expect(discoverySourceListSchema.safeParse(valid).success).toBe(false)
  })
})
