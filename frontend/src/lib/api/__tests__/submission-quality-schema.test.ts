import { describe, expect, it } from 'vitest'
import { adminSubmissionQualitySchema } from '#/lib/api/admin'

const payload = {
  window_start: '2026-07-16T00:00:00Z',
  window_end: '2026-07-30T00:00:00Z',
  families: [
    {
      source_family: 'employer_ats',
      evidence_base: 4,
      response_rate: 0.5,
      packet_edit_rate: 0.25,
      duplicate_prevention_rate: 0.25,
      complaint_rate: 0,
    },
  ],
}

describe('submission quality admin schema', () => {
  it('accepts only the bounded aggregate contract', () => {
    expect(adminSubmissionQualitySchema.parse(payload)).toEqual(payload)
  })

  it('rejects source identifiers and submitted values', () => {
    expect(() =>
      adminSubmissionQualitySchema.parse({
        ...payload,
        families: [
          {
            ...payload.families[0],
            source_key: 'private-source',
            submitted_fields: { salary: 'private' },
          },
        ],
      }),
    ).toThrow()
  })
})
