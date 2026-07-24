import { describe, expect, it } from 'vitest'
import {
  developmentItemSchema,
  developmentPlanResponseSchema,
} from '#/lib/api/developmentSchemas'

const item = {
  id: 'development-1',
  gap_classification_id: 'gap-1',
  gap_kind: 'missing_skill',
  response_kind: 'learn_skill',
  state: 'completed',
  target_date: null,
  notes: 'Completed a supervised Rust learning project.',
  source_finding_id: 'finding-1',
  timeline: [
    { event: 'evidence_proposal_created', at: '2026-07-24T12:00:00Z' },
  ],
  evidence_proposal: {
    id: 'evidence-1',
    content: { statement: 'Completed a supervised Rust learning project.' },
    confirmation_state: 'unconfirmed',
  },
  created_at: '2026-07-24T10:00:00Z',
  updated_at: '2026-07-24T12:00:00Z',
}

describe('development plan schemas', () => {
  it('mirrors the completion proposal and UTC-aware backend response', () => {
    expect(developmentItemSchema.parse(item)).toEqual(item)
    expect(
      developmentPlanResponseSchema.parse({
        schema_version: 'development-plan/v1',
        items: [item],
      }).items,
    ).toEqual([item])
  })

  it('rejects missing proposal state, invalid timestamps, and unknown fields', () => {
    expect(() => {
      const { evidence_proposal: _, ...missingProposal } = item
      developmentItemSchema.parse(missingProposal)
    }).toThrow()
    expect(() =>
      developmentItemSchema.parse({ ...item, created_at: '2026-07-24T10:00:00' }),
    ).toThrow()
    expect(() => developmentItemSchema.parse({ ...item, board_column: 'done' })).toThrow()
  })
})
