import { describe, expect, it } from 'vitest'
import {
  campaignStatusSchema,
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
      campaigns: { campaign_count: 1, campaigns: [{
        id: 'ws-1', label: 'Target', is_pinned: false, company: 'Example Corp',
        role: 'Engineer', status: 'planning', deadline: null,
        created_at: '2026-07-13T10:00:00Z', updated_at: '2026-07-13T10:00:00Z',
        events: [{ id: 'event-1', event_type: 'status_changed', details: { from: null, to: 'planning' }, created_at: '2026-07-13T10:00:00Z' }],
      }] },
    })
    expect(parsed.campaigns.campaign_count).toBe(1)
  })
})
