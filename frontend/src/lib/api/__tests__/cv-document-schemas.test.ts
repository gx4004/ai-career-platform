import { describe, expect, it } from 'vitest'
import {
  cvDocumentCreateSchema,
  cvDocumentSchema,
  cvDocumentsExportSchema,
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
})
