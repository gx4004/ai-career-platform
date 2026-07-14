import { describe, expect, it } from 'vitest'
import {
  cvDocumentCreateSchema,
  cvDocumentSchema,
  cvDocumentsExportSchema,
  careerDataExportSchema,
  cvQualityResponseSchema,
  cvQualityRequestSchema,
  cvTailoringProposalSchema,
} from '#/lib/api/schemas'

const section = {
  id: 'section-1', kind: 'experience', title: 'Experience', visible: true, position: 0,
  entries: [{
    id: 'entry-1', evidence_item_id: 'evidence-1', body: 'Synthetic reviewed wording.', position: 0,
  }],
}

describe('CV document schema (R12, #153)', () => {
  it('matches the typed backend document and immutable variant contract', () => {
    const parsed = cvDocumentSchema.parse({
      id: 'document-1', name: 'Primary CV', sections: [section],
      created_at: '2026-07-12T10:00:00Z', updated_at: '2026-07-12T10:00:00Z',
      quality_model_runs: 0, tailoring_model_runs: 0, quality_model_run_limit: 10, tailoring_model_run_limit: 10,
      variants: [{
        id: 'variant-1', name: 'Base', target_role: null, sections: [section],
        created_at: '2026-07-12T10:00:00Z',
      }],
    })
    expect(parsed.variants[0].name).toBe('Base')
  })

  it('requires each factual entry to reference an Evidence Profile item', () => {
    expect(() => cvDocumentCreateSchema.parse({
      name: 'Invalid', sections: [{ ...section, entries: [{ id: 'x', body: 'claim', position: 0 }] }],
    })).toThrow()
  })

  it('validates the versioned account export shape', () => {
    expect(cvDocumentsExportSchema.parse({
      schema_version: 'cv-documents-export/v1', exported_at: '2026-07-12T10:00:00Z',
      document_count: 0, documents: [],
    }).document_count).toBe(0)
  })

  it('validates the complete career-data export with immutable CV variants', () => {
    const cv = {
      id: 'document-1', name: 'Portable', sections: [section],
      created_at: '2026-07-12T10:00:00Z', updated_at: '2026-07-12T10:00:00Z',
      quality_model_runs: 2, tailoring_model_runs: 3, quality_model_run_limit: 10, tailoring_model_run_limit: 10,
      variants: [{ id: 'variant-1', name: 'Base', target_role: null, sections: [section], created_at: '2026-07-12T10:00:00Z' }],
    }
    const parsed = careerDataExportSchema.parse({
      schema_version: 'career-data-export/v1', exported_at: '2026-07-12T10:00:00Z',
      item_count: 0, items: [],
      campaigns: { campaign_count: 0, campaigns: [] },
      personalization: { hidden_sources: [], dismissals: [], reports: [] },
      queue_rules: { rules: [], settings: null },
      application_packets: { packets: [] },
      packet_stop_answers: { stop_answers: [] },
      packet_approval_snapshots: { snapshots: [] },
      queue_audit: { events: [] },
      cv_documents: { schema_version: 'cv-documents-export/v1', exported_at: '2026-07-12T10:00:00Z', document_count: 1, documents: [cv] },
    })
    expect(parsed.cv_documents.documents[0].variants[0].name).toBe('Base')
  })

  it('requires scoring quota visibility in every quality response', () => {
    expect(() => cvQualityResponseSchema.parse({
      schema_version: 'cv-quality/v1', dimensions: [], ats_checks: [], scoring_mode: 'heuristic',
      advisory_note: 'Directional only.', access_mode: 'authenticated', saved: true, locked_actions: [],
    })).toThrow()
  })

  it('requires reviewable tailoring provenance and a server-authenticated proposal', () => {
    const parsed = cvTailoringProposalSchema.parse({
      schema_version: 'cv-tailoring/v1', job_title: 'Platform Engineer', remaining_regenerations: 9,
      request_id: 'a5ac39c0-5a76-4e94-98f1-a0fd8b42a5b2',
      proposal_token: 'a'.repeat(64), history_id: 'run-1', access_mode: 'authenticated', saved: true, locked_actions: [],
      changes: [{ id: 'change-1', section_id: 'section-1', entry_id: 'entry-1', before: 'Before', after: 'After', job_requirement: 'Reliable platforms', evidence_item_ids: ['evidence-1'], support: 'confirmed' }],
    })
    expect(parsed.changes[0].support).toBe('confirmed')
  })

  it('requires artifact template and format as a matched validation pair', () => {
    expect(() => cvQualityRequestSchema.parse({ use_model: false, artifact_template: 'ats-essential' })).toThrow()
    expect(cvQualityRequestSchema.parse({ use_model: false, artifact_template: 'ats-essential', artifact_format: 'pdf' }).artifact_format).toBe('pdf')
  })
})
