import { describe, expect, it } from 'vitest'
import { gapResponseOfferSchema } from '#/lib/api/gapResponseSchemas'

const learnOffer = {
  gap_classification_id: 'c1',
  gap_kind: 'missing_skill',
  response_kind: 'learn_skill',
  action_path: 'advisory',
  headline: 'Develop this skill',
  detail: 'Nothing shows this skill yet.',
  capture_proposal: null,
  sources: [],
  commercial_relationship: 'none',
}

const captureOffer = {
  gap_classification_id: 'c2',
  gap_kind: 'uncaptured_evidence',
  response_kind: 'capture_evidence',
  action_path: 'evidence_profile_create',
  headline: 'Capture this as evidence',
  detail: 'You already have this.',
  capture_proposal: { kind: 'achievement', content: { statement: 'Led migration' }, provenance: 'inferred' },
  sources: [],
  commercial_relationship: 'none',
}

describe('gapResponseOfferSchema', () => {
  it('parses an advisory learning offer and a capture offer', () => {
    expect(gapResponseOfferSchema.parse(learnOffer).response_kind).toBe('learn_skill')
    const capture = gapResponseOfferSchema.parse(captureOffer)
    expect(capture.capture_proposal?.provenance).toBe('inferred')
  })

  it('rejects any commercial_relationship other than "none" (D-111)', () => {
    expect(
      gapResponseOfferSchema.safeParse({ ...learnOffer, commercial_relationship: 'affiliate' })
        .success,
    ).toBe(false)
  })

  it('rejects unknown fields (mirrors backend extra="forbid")', () => {
    expect(gapResponseOfferSchema.safeParse({ ...learnOffer, sponsored: true }).success).toBe(false)
  })

  it('rejects an out-of-set action_path', () => {
    expect(
      gapResponseOfferSchema.safeParse({ ...learnOffer, action_path: 'auto_apply' }).success,
    ).toBe(false)
  })
})
