import { describe, expect, it } from 'vitest'
import {
  evidenceImportRequestSchema,
  evidenceItemCreateSchema,
  evidenceItemSchema,
  evidenceItemUpdateSchema,
} from '#/lib/api/schemas'

describe('evidence item schema', () => {
  it('matches the backend item contract', () => {
    const item = evidenceItemSchema.parse({
      id: 'item-id', kind: 'interview-evidence',
      content: { situation: 'Synthetic example' }, provenance: 'inferred',
      confirmation_state: 'unconfirmed', created_at: '2026-07-11T12:00:00Z',
      updated_at: '2026-07-11T12:00:00Z',
    })
    expect(item.kind).toBe('interview-evidence')
  })

  it('rejects non-allowlisted enum values and scalar content', () => {
    expect(() => evidenceItemSchema.parse({
      id: 'x', kind: 'other', content: 'sensitive text',
      provenance: 'generated', confirmation_state: 'rejected',
      created_at: 'x', updated_at: 'x',
    })).toThrow()
  })

  it('mirrors create and content-only update constraints', () => {
    expect(() => evidenceItemCreateSchema.parse({
      kind: 'skill', content: {}, provenance: 'user-entered',
    })).toThrow()
    expect(() => evidenceItemUpdateSchema.parse({})).toThrow()
    expect(() => evidenceItemUpdateSchema.parse({
      content: { name: 'x' }, provenance: 'user-entered',
    })).toThrow()
  })
})

describe('evidence import request schema (R11, #146)', () => {
  it('enforces the resume_text bounds on the request', () => {
    expect(() => evidenceImportRequestSchema.parse({ resume_text: 'too short' })).toThrow()
    expect(evidenceImportRequestSchema.parse({ resume_text: 'x'.repeat(60) }).resume_text).toHaveLength(60)
  })
})
