import { describe, expect, it } from 'vitest'
import {
  campaignStatusSchema,
  importJobTextSchema,
  importJobUrlSchema,
  careerDataExportSchema,
  workspaceSummarySchema,
  workspaceUpdateSchema,
} from '#/lib/api/schemas'

describe('campaign contracts', () => {
  it('accepts legacy label-only workspaces and bounded campaign fields', () => {
    expect(workspaceSummarySchema.parse({
      id: 'ws-1', label: 'Existing', is_pinned: true, linked_run_ids: [],
      last_active_tool: null, last_active_result_id: null,
      company: null, role: null, status: null, deadline: null,
      listing: null,
      updated_at: '2026-07-13T10:00:00Z',
    }).status).toBeNull()

    expect(workspaceUpdateSchema.parse({ status: 'planning' })).toEqual({ status: 'planning' })
    expect(workspaceUpdateSchema.parse({ deadline: '2026-08-15T18:00:00+02:00' })).toEqual({
      deadline: '2026-08-15T18:00:00+02:00',
    })
    expect(campaignStatusSchema.safeParse('custom-stage').success).toBe(false)
    expect(workspaceUpdateSchema.safeParse({ deadline: '2026-08-15T16:00:00' }).success).toBe(false)
  })

  it('mirrors campaign data in career-data-export/v1', () => {
    const parsed = careerDataExportSchema.parse({
      schema_version: 'career-data-export/v1', exported_at: '2026-07-13T10:00:00Z',
      item_count: 0, items: [],
      cv_documents: { schema_version: 'cv-documents-export/v1', exported_at: '2026-07-13T10:00:00Z', document_count: 0, documents: [] },
      personalization: { hidden_sources: [], dismissals: [], reports: [] },
      queue_rules: { rules: [], settings: null },
      application_packets: { packets: [] },
      packet_stop_answers: { stop_answers: [] },
      packet_approval_snapshots: { snapshots: [] },
      queue_audit: { events: [] },
      submission_authorizations: {
        schema_version: 'submission-authorizations-export/v1',
        grant_count: 0,
        grants: [],
      },
      submission_records: {
        schema_version: 'submission-records-export/v1', record_count: 0, records: [],
        dispatch_claim_count: 0, dispatch_claims: [],
      },
      development: {
        item_count: 0,
        items: [],
        classification_count: 0,
        classifications: [],
        recommendation_count: 0,
        recommendations: [],
      },
      campaigns: { campaign_count: 1, campaigns: [{
        id: 'ws-1', label: 'Target', is_pinned: false, company: 'Example Corp',
        role: 'Engineer', status: 'planning', deadline: null,
        created_at: '2026-07-13T10:00:00Z', updated_at: '2026-07-13T10:00:00Z',
        events: [
          { id: 'event-1', event_type: 'status_changed', details: { from: null, to: 'planning' }, created_at: '2026-07-13T10:00:00Z' },
          { id: 'event-2', event_type: 'packet_approved', details: { packet_id: 'packet-1', snapshot_id: 'snapshot-1', content_sha256: 'a'.repeat(64) }, created_at: '2026-07-25T10:00:00Z' },
        ],
        listing: { title: 'Engineer', company: 'Example Corp', description: 'Build APIs', source_url: null, retrieved_at: '2026-07-13T10:00:00Z' },
        listing_revisions: [{ title: 'Engineer', company: 'Example Corp', description: 'Build APIs', source_url: null, retrieved_at: '2026-07-13T10:00:00Z' }],
      }] },
    })
    expect(parsed.campaigns.campaign_count).toBe(1)
    expect(parsed.campaigns.campaigns[0].listing?.title).toBe('Engineer')
  })

  it('mirrors bounded strict pasted-listing inputs', () => {
    expect(importJobTextSchema.parse({
      campaign_id: 'ws-1', job_title: 'Engineer', company_name: 'Example Corp',
      job_description: 'A sufficiently detailed pasted role description.',
    }).campaign_id).toBe('ws-1')
    expect(importJobTextSchema.safeParse({
      campaign_id: 'ws-1', job_title: 'Engineer', company_name: 'Example Corp',
      job_description: 'too short', source_url: 'https://example.com',
    }).success).toBe(false)
    expect(importJobUrlSchema.safeParse({ url: 'file:///private/job' }).success).toBe(false)
    expect(importJobUrlSchema.safeParse({ url: `https://example.com/${'x'.repeat(2_100)}` }).success).toBe(false)
  })
})
