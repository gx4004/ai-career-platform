import { describe, expect, it } from 'vitest'
import { adminDevelopmentLoopSchema } from '#/lib/api/admin'

const aggregate = {
  window_start: '2026-07-10T00:00:00+00:00',
  window_end: '2026-07-24T23:59:59.999000+00:00',
  total_items_created: 2,
  total_items_deleted: 1,
  total_state_transitions: 1,
  created_by_gap_kind: [{ gap_kind: 'missing_skill', count: 2 }],
  created_by_response_kind: [{ response_kind: 'learn_skill', count: 2 }],
  state_transitions: [
    { from_state: 'planned', to_state: 'in_progress', count: 1 },
  ],
}

describe('admin development-loop contract', () => {
  it('accepts the exact aggregate-only backend response', () => {
    expect(adminDevelopmentLoopSchema.parse(aggregate)).toEqual(aggregate)
  })

  it('rejects content and row-level identifiers at every aggregate seam', () => {
    expect(() =>
      adminDevelopmentLoopSchema.parse({
        ...aggregate,
        recommendation_content: 'private advice',
      }),
    ).toThrow()
    expect(() =>
      adminDevelopmentLoopSchema.parse({
        ...aggregate,
        created_by_gap_kind: [
          { gap_kind: 'missing_skill', count: 2, gap_description: 'private gap' },
        ],
      }),
    ).toThrow()
  })
})
