import { describe, expect, it } from 'vitest'
import {
  applicationPacketItemSchema,
  applicationPacketListSchema,
  applicationPacketsExportSchema,
  packetApprovalResultSchema,
  packetApprovalSnapshotsExportSchema,
  packetDecisionSchema,
  packetPreparationResultSchema,
  packetStopAnswersExportSchema,
  queueReviewStateSchema,
  stopAnswerRequestSchema,
  stopAnswerResultSchema,
  stopCategorySchema,
  unresolvedQuestionCategorySchema,
} from '#/lib/api/packetSchemas'

const packet = {
  id: 'packet-1',
  campaign_id: 'ws-1',
  listing_id: 'listing-1',
  listing_attribution_id: 'attribution-1',
  cv_variant_id: 'variant-1',
  drafts_run_id: 'run-1',
  review_run_id: 'review-1',
  status: 'prepared',
  gate_state: 'passed',
  decision: 'pending',
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
    // Trust-chain gate outcome + reviewer reference (R15 #184, D-097).
    expect(parsed.gate_state).toBe('passed')
    expect(parsed.review_run_id).toBe('review-1')
    // The owner's review decision (R15 #183).
    expect(parsed.decision).toBe('pending')
  })

  it('mirrors the review decision set + rejects drift (R15 #183)', () => {
    for (const decision of ['pending', 'accepted', 'skipped', 'rejected']) {
      expect(packetDecisionSchema.safeParse(decision).success).toBe(true)
      expect(applicationPacketItemSchema.parse({ ...packet, decision }).decision).toBe(decision)
    }
    expect(packetDecisionSchema.safeParse('submitted').success).toBe(false)
    // decision is required — a packet item without it is contract drift.
    const { decision: _omitted, ...withoutDecision } = packet
    expect(applicationPacketItemSchema.safeParse(withoutDecision).success).toBe(false)
  })

  it('mirrors the queue review state (pause + regression halt, R15 #183)', () => {
    const parsed = queueReviewStateSchema.parse({ paused: true, preparation_halted: false })
    expect(parsed.paused).toBe(true)
    expect(parsed.preparation_halted).toBe(false)
    expect(queueReviewStateSchema.safeParse({ paused: true }).success).toBe(false)
    expect(
      queueReviewStateSchema.safeParse({ paused: true, preparation_halted: false, extra: 1 })
        .success,
    ).toBe(false)
  })

  it('accepts nullable references (a blocked packet lacking a CV variant)', () => {
    const parsed = applicationPacketItemSchema.parse({
      ...packet,
      status: 'blocked',
      cv_variant_id: null,
      listing_id: null,
      drafts_run_id: null,
      review_run_id: null,
      gate_state: 'blocked',
      unresolved_questions: [
        { field: 'cv_variant', category: 'missing_material', question: 'Select a CV.' },
      ],
    })
    expect(parsed.cv_variant_id).toBeNull()
    expect(parsed.review_run_id).toBeNull()
    expect(parsed.status).toBe('blocked')
    expect(parsed.gate_state).toBe('blocked')
  })

  it('rejects an out-of-set gate state (D-097)', () => {
    expect(applicationPacketItemSchema.safeParse({ ...packet, gate_state: 'queued' }).success).toBe(
      false,
    )
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

  it('mirrors the immutable approval snapshot and manual handoff', () => {
    const snapshot = {
      id: 'snapshot-1',
      packet_id: 'packet-1',
      campaign_id: 'ws-1',
      listing_id: 'listing-1',
      role_key: 'acme|backend engineer',
      destination_url: 'https://jobs.example/apply/1',
      content: {
        schema_version: 'packet-approval/v1',
        packet_id: 'packet-1',
        campaign_id: 'ws-1',
        listing_id: 'listing-1',
        frozen_at: '2026-07-25T12:00:00Z',
        match_rationale: packet.match_rationale,
        unresolved_questions: [],
        unsupported_claims: [],
        resolved_stop_answers: [],
        listing: {
          id: 'listing-1',
          content_sha256: 'b'.repeat(64),
          title: 'Backend Engineer',
          company: 'Acme',
          description: 'Build reliable systems.',
          attributions: [{
            id: 'attribution-1',
            source_id: 'source-1',
            source_listing_key: 'job-1',
            source_url: 'https://jobs.example/apply/1',
            retrieved_at: '2026-07-24T12:00:00Z',
          }],
        },
        manual_handoff: {
          attribution_id: 'attribution-1',
          listing_id: 'listing-1',
          source_id: 'source-1',
          source_listing_key: 'job-1',
          source_url: 'https://jobs.example/apply/1',
          retrieved_at: '2026-07-24T12:00:00Z',
        },
        cv_variant: null,
        drafts: { cover_letter: { body: 'Exact approved copy.' } },
      },
      content_sha256: 'a'.repeat(64),
      created_at: '2026-07-25T12:00:00Z',
    }
    const result = packetApprovalResultSchema.parse({
      packet: { ...packet, decision: 'accepted', unresolved_questions: [] },
      snapshot,
      handoff: {
        destination_url: 'https://jobs.example/apply/1',
        instructions: 'Open the official listing and submit it yourself.',
      },
    })

    expect(result.snapshot.content).toEqual(snapshot.content)
    expect(result.handoff.destination_url).toBe('https://jobs.example/apply/1')
    expect(
      packetApprovalSnapshotsExportSchema.parse({ snapshots: [snapshot] }).snapshots,
    ).toHaveLength(1)
    const legacyContent = { ...snapshot.content }
    delete (legacyContent as { unsupported_claims?: unknown }).unsupported_claims
    const legacy = packetApprovalSnapshotsExportSchema.parse({
      snapshots: [{ ...snapshot, content: legacyContent }],
    })
    expect('unsupported_claims' in legacy.snapshots[0].content).toBe(false)
  })

  it('rejects approval snapshot contract drift', () => {
    const snapshot = {
      id: 'snapshot-1',
      packet_id: 'packet-1',
      campaign_id: 'ws-1',
      listing_id: null,
      role_key: 'acme|backend engineer',
      destination_url: null,
      content: { schema_version: 'packet-approval/v1' },
      content_sha256: 'not-a-sha256',
      created_at: '2026-07-25T12:00:00Z',
    }
    expect(packetApprovalSnapshotsExportSchema.safeParse({ snapshots: [snapshot] }).success).toBe(
      false,
    )
    expect(
      packetApprovalSnapshotsExportSchema.safeParse({
        snapshots: [{ ...snapshot, content_sha256: 'a'.repeat(64), mutable: true }],
      }).success,
    ).toBe(false)
    expect(
      packetApprovalSnapshotsExportSchema.safeParse({
        snapshots: [
          {
            ...snapshot,
            destination_url: 'https://user:secret@jobs.example/apply',
            content_sha256: 'a'.repeat(64),
          },
        ],
      }).success,
    ).toBe(false)
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

  it('mirrors the exhaustive stop-category set (D-095, #182)', () => {
    for (const category of [
      'work_authorization',
      'salary',
      'relocation',
      'eligibility',
      'demographic',
      'legal',
      'sensitive',
      'uncertain',
    ]) {
      expect(stopCategorySchema.safeParse(category).success).toBe(true)
      expect(unresolvedQuestionCategorySchema.safeParse(category).success).toBe(true)
    }
    expect(unresolvedQuestionCategorySchema.safeParse('missing_material').success).toBe(true)
    // Provisional #181 category names are gone — one authoritative set.
    expect(stopCategorySchema.safeParse('compensation').success).toBe(false)
    expect(stopCategorySchema.safeParse('demographic_or_eligibility').success).toBe(false)
  })

  it('mirrors the stop-answer request/result + export contracts', () => {
    expect(
      stopAnswerRequestSchema.parse({ field: 'work_authorization', answer: 'EU citizen.' }).field,
    ).toBe('work_authorization')
    expect(stopAnswerRequestSchema.safeParse({ field: 'salary', answer: '' }).success).toBe(false)

    const result = stopAnswerResultSchema.parse({
      packet_id: 'p1',
      resolved_field: 'salary',
      remaining_unresolved: 0,
      approvable: true,
      unresolved_questions: [],
    })
    expect(result.approvable).toBe(true)

    const exported = packetStopAnswersExportSchema.parse({
      stop_answers: [
        {
          packet_id: 'p1',
          field: 'salary',
          category: 'salary',
          answer: '100k EUR',
          created_at: '2026-07-14T00:00:00Z',
          updated_at: '2026-07-14T00:00:00Z',
        },
      ],
    })
    expect(exported.stop_answers).toHaveLength(1)
  })

  it('accepts the halted preparation result (regression eval halt, D-097)', () => {
    const parsed = packetPreparationResultSchema.parse({
      prepares: false,
      reason: 'halted',
      prepared_count: 0,
      skipped_existing_count: 0,
      excluded_by_volume_cap: 0,
      excluded_by_cost_ceiling: 0,
      volume_cap: 0,
      cost_ceiling_usd: 0,
      estimated_packet_cost_usd: 0,
      estimated_total_cost_usd: 0,
      packets: [],
    })
    expect(parsed.reason).toBe('halted')
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
