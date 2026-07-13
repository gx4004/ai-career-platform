import { describe, expect, it } from 'vitest'
import { discoveryRecommendationListSchema } from '#/lib/api/schemas'

const payload = {
  items: [
    {
      listing_id: 'listing-1',
      title: 'Platform Engineer',
      company: 'Acme Systems',
      description: 'Build Kubernetes services.',
      score: 82,
      rationale: [
        {
          kind: 'confirmed_evidence',
          label: 'Confirmed evidence overlaps this listing',
          matched_keywords: ['Kubernetes'],
          evidence_item_ids: ['evidence-1'],
          score: 80,
        },
        {
          kind: 'preference',
          label: 'Confirmed preferences align with this listing',
          matched_keywords: ['Platform'],
          evidence_item_ids: ['preference-1'],
          score: 90,
        },
      ],
      attributions: [
        {
          source_name: 'Licensed Feed',
          source_family: 'licensed',
          source_url: 'https://feed.example/jobs/1',
          retrieved_at: '2026-07-13T00:00:00Z',
        },
      ],
    },
  ],
  confirmed_item_count: 2,
  preference_item_count: 1,
}

describe('discovery recommendation contracts', () => {
  it('mirrors the ranked rationale and attribution response', () => {
    const parsed = discoveryRecommendationListSchema.parse(payload)
    expect(parsed.items[0].rationale[0].matched_keywords).toEqual(['Kubernetes'])
    expect(parsed.items[0].attributions[0].source_family).toBe('licensed')
  })

  it('rejects out-of-range scores and recommendations without attribution', () => {
    expect(
      discoveryRecommendationListSchema.safeParse({
        ...payload,
        items: [{ ...payload.items[0], score: 101, attributions: [] }],
      }).success,
    ).toBe(false)
  })

  it.each([
    { source_url: 'http://feed.example/jobs/1' },
    { source_url: `https://feed.example/${'a'.repeat(2_049)}` },
    { source_url: 'https://feed.example/jobs/1', unexpected: true },
  ])('rejects attribution contract drift: %o', (attributionChange) => {
    expect(
      discoveryRecommendationListSchema.safeParse({
        ...payload,
        items: [
          {
            ...payload.items[0],
            attributions: [
              { ...payload.items[0].attributions[0], ...attributionChange },
            ],
          },
        ],
      }).success,
    ).toBe(false)
  })
})
