import { describe, expect, it } from 'vitest'

import { sharedResultEnvelopeSchema } from '#/lib/api/schemas'

const legacyEnvelope = {
  schema_version: 'quality_v2',
  summary: {
    headline: 'Ready',
    verdict: 'control',
    confidence_note: 'Synthetic fixture.',
  },
  top_actions: [],
  generated_at: '2026-08-02T12:00:00Z',
  download_title: 'Result',
}

describe('result access schema', () => {
  it('keeps legacy persisted results readable with the full control default', () => {
    const parsed = sharedResultEnvelopeSchema.parse(legacyEnvelope)

    expect(parsed.access_decision).toEqual({
      state: 'full',
      treatment: 'control',
      reason: 'policy_disabled',
      can_export: true,
      policy_version: 'control-v1',
    })
  })

  it('accepts the explicit candidate-neutral server decision', () => {
    const parsed = sharedResultEnvelopeSchema.parse({
      ...legacyEnvelope,
      access_decision: {
        state: 'full',
        treatment: 'control',
        reason: 'no_candidate_selected',
        can_export: true,
        policy_version: 'control-v1',
      },
    })

    expect(parsed.access_decision.reason).toBe('no_candidate_selected')
  })

  it('rejects a browser-manufactured treatment', () => {
    expect(
      sharedResultEnvelopeSchema.safeParse({
        ...legacyEnvelope,
        access_decision: {
          state: 'restricted',
          treatment: 'paid',
          reason: 'client_override',
          can_export: true,
          policy_version: 'control-v1',
        },
      }).success,
    ).toBe(false)
  })
})
