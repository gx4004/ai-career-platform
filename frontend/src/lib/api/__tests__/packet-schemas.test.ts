import { describe, expect, it } from 'vitest'
import {
  applicationPacketItemSchema,
  applicationPacketListSchema,
  applicationPacketsExportSchema,
  packetPreparationResultSchema,
} from '#/lib/api/packetSchemas'

const packet = {
  id: 'packet-1',
  campaign_id: 'ws-1',
  listing_id: 'listing-1',
  cv_variant_id: 'variant-1',
  drafts_run_id: 'run-1',
  status: 'prepared',
  match_rationale: {
    composite_score: 82,
    signals: [
      {
        kind: 'confirmed_evidence',
        label: 'Python backend',
        matched_keywords: ['python'],
        evidence_item_ids: ['ev-1'],
        score: 88,
      },
    ],
    matched_rules: [
      { rule_type: 'role', matched_keywords: ['engineer'], min_score: null },
      { rule_type: 'quality_threshold', matched_keywords: [], min_score: 80 },
    ],
  },
  unresolved_questions: [
    { field: 'work_authorization', category: 'work_authorization', question: 'Confirm status.' },
  ],
  estimated_cost_usd: 0.05,
  created_at: '2026-07-14T00:00:00Z',
  updated_at: '2026-07-14T00:00:00Z',
}

describe('application packet contracts', () => {
  it('mirrors the packet item (references + derived rationale/questions)', () => {
    const parsed = applicationPacketItemSchema.parse(packet)
    expect(parsed.listing_id).toBe('listing-1')
    expect(parsed.match_rationale.composite_score).toBe(82)
    expect(parsed.unresolved_questions[0].category).toBe('work_authorization')
  })

  it('accepts nullable references (a blocked packet lacking a CV variant)', () => {
    const parsed = applicationPacketItemSchema.parse({
      ...packet,
      status: 'blocked',
      cv_variant_id: null,
      listing_id: null,
      drafts_run_id: null,
      unresolved_questions: [
        { field: 'cv_variant', category: 'missing_material', question: 'Select a CV.' },
      ],
    })
    expect(parsed.cv_variant_id).toBeNull()
    expect(parsed.status).toBe('blocked')
  })

  it('rejects packet contract drift', () => {
    expect(applicationPacketItemSchema.safeParse({ ...packet, status: 'sent' }).success).toBe(false)
    expect(applicationPacketItemSchema.safeParse({ ...packet, unexpected: true }).success).toBe(
      false,
    )
    expect(
      applicationPacketItemSchema.safeParse({
        ...packet,
        match_rationale: { ...packet.match_rationale, composite_score: 140 },
      }).success,
    ).toBe(false)
    expect(
      applicationPacketItemSchema.safeParse({
        ...packet,
        unresolved_questions: [{ field: 'x', category: 'bogus', question: 'q' }],
      }).success,
    ).toBe(false)
  })

  it('mirrors the list and export wrappers', () => {
    expect(applicationPacketListSchema.parse({ items: [packet] }).items).toHaveLength(1)
    expect(applicationPacketsExportSchema.parse({ packets: [packet] }).packets).toHaveLength(1)
  })

  it('mirrors the preparation result (cap/ceiling counters visible)', () => {
    const parsed = packetPreparationResultSchema.parse({
      prepares: true,
      reason: 'ready',
      prepared_count: 2,
      skipped_existing_count: 1,
      excluded_by_volume_cap: 1,
      excluded_by_cost_ceiling: 0,
      volume_cap: 10,
      cost_ceiling_usd: 1.0,
      estimated_packet_cost_usd: 0.05,
      estimated_total_cost_usd: 0.1,
      packets: [packet],
    })
    expect(parsed.prepared_count).toBe(2)
    expect(parsed.skipped_existing_count).toBe(1)
  })

  it('accepts the no-rules preparation result', () => {
    const parsed = packetPreparationResultSchema.parse({
      prepares: false,
      reason: 'no_rules_defined',
      prepared_count: 0,
      skipped_existing_count: 0,
      excluded_by_volume_cap: 0,
      excluded_by_cost_ceiling: 0,
      volume_cap: 10,
      cost_ceiling_usd: 1.0,
      estimated_packet_cost_usd: 0.05,
      estimated_total_cost_usd: 0,
      packets: [],
    })
    expect(parsed.prepares).toBe(false)
  })
})
