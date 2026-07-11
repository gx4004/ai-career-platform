import { describe, expect, it } from 'vitest'
import {
  evidenceConfirmationActionSchema,
  evidenceImportProposalsSchema,
  evidenceImportRequestSchema,
  evidenceItemCreateSchema,
  evidenceItemSchema,
  evidenceItemUpdateSchema,
  evidenceProposalSchema,
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
      provenance: 'generated', confirmation_state: 'approved',
      created_at: 'x', updated_at: 'x',
    })).toThrow()
  })

  it('mirrors create, update, and confirmation request constraints', () => {
    expect(() => evidenceItemCreateSchema.parse({
      kind: 'skill', content: {}, provenance: 'user-entered',
    })).toThrow()
    expect(() => evidenceItemUpdateSchema.parse({})).toThrow()
    expect(evidenceConfirmationActionSchema.parse({ action: 'reject' })).toEqual({
      action: 'reject',
    })
    expect(() => evidenceConfirmationActionSchema.parse({ action: 'approve' })).toThrow()
  })
})

describe('evidence-import proposal schema (R11, #146)', () => {
  it('mirrors the ephemeral proposal contract', () => {
    const parsed = evidenceImportProposalsSchema.parse({
      proposals: [
        {
          proposal_id: 'p1',
          kind: 'experience',
          content: { role: 'Backend Engineer' },
          provenance: 'imported',
        },
      ],
    })
    expect(parsed.proposals[0].provenance).toBe('imported')
  })

  it('rejects any provenance other than imported for a proposal', () => {
    expect(() =>
      evidenceProposalSchema.parse({
        proposal_id: 'p1', kind: 'skill', content: { name: 'x' }, provenance: 'user-entered',
      }),
    ).toThrow()
  })

  it('enforces the resume_text bounds on the request', () => {
    expect(() => evidenceImportRequestSchema.parse({ resume_text: 'too short' })).toThrow()
    expect(evidenceImportRequestSchema.parse({ resume_text: 'x'.repeat(60) }).resume_text).toHaveLength(60)
  })
})
