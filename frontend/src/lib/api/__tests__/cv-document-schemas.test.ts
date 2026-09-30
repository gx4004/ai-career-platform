import { describe, expect, it } from 'vitest'
import {
  careerDataExportSchema,
  cvDocumentSchema,
  cvQualityResponseSchema,
  cvTailoringApplySchema,
} from '#/lib/api/schemas'

const section = {
  id: 'section-1', kind: 'experience', title: 'Experience', visible: true, position: 0,
  entries: [{ id: 'entry-1', evidence_item_id: 'evidence-1', body: 'Synthetic reviewed wording.', position: 0 }],
}
const cv = {
  id: 'document-1', name: 'Portable', sections: [section],
  created_at: '2026-07-12T10:00:00Z', updated_at: '2026-07-12T10:00:00Z',
  tailoring_model_runs: 3, tailoring_model_run_limit: 10,
  variants: [{ id: 'variant-1', name: 'Base', target_role: null, sections: [section], created_at: '2026-07-12T10:00:00Z' }],
}

describe('CV Studio contracts', () => {
  it('reads a document without a saved style as the default style the preview shows', () => {
    expect(cvDocumentSchema.parse(cv).style).toEqual({
      template_id: 'ats-essential', font_id: 'lato', accent_color: '#111827', density: 'normal', ats_mode: false,
    })
    expect(() => cvDocumentSchema.parse({ ...cv, style: { section_order: ['x'] } })).toThrow()
  })

  it('carries CV documents and their variants in the complete career-data export', () => {
    const parsed = careerDataExportSchema.parse({
      schema_version: 'career-data-export/v1', exported_at: '2026-07-12T10:00:00Z',
      item_count: 0, items: [],
      applications: { application_count: 0, applications: [], preferences: null },
      personalization: { dismissals: [] },
      development: {
        item_count: 0,
        items: [],
        classification_count: 0,
        classifications: [],
        recommendation_count: 0,
        recommendations: [],
      },
      cv_documents: { schema_version: 'cv-documents-export/v1', exported_at: '2026-07-12T10:00:00Z', document_count: 1, documents: [cv] },
    })
    expect(parsed.cv_documents.documents[0].variants[0].name).toBe('Base')
  })

  it('parses pass/fail checks and strips any legacy score', () => {
    const parsed = cvQualityResponseSchema.parse({
      schema_version: 'cv-quality/v3', dimensions: [{ key: 'impact', score: 64 }],
      checks: [{ id: 'links', label: 'Links work', passed: true, detail: 'Links open.', fix: 'Check links.' }],
      ats_score: 72,
    })
    expect(parsed.checks[0].passed).toBe(true)
    expect(parsed).not.toHaveProperty('ats_score')
    expect(parsed).not.toHaveProperty('dimensions')
  })

  it('reviews a tailored change by accepting or rejecting it, never by free-text edit', () => {
    const apply = (action: string) => cvTailoringApplySchema.safeParse({
      request_id: 'a5ac39c0-5a76-4e94-98f1-a0fd8b42a5b2', variant_name: 'Tailored', job_title: 'Engineer',
      proposal_token: 'a'.repeat(64), changes: [], decisions: [{ change_id: 'change-1', action }],
    }).success
    expect([apply('accept'), apply('reject'), apply('edit')]).toEqual([true, true, false])
  })
})
