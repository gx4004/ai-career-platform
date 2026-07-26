import { z } from 'zod'

// Mirrors backend/app/schemas/application_packets.py (R15 #181, D-093/D-094).
// A packet is a reference-only composition: the *_id fields are foreign keys,
// never inlined content. `match_rationale` and `unresolved_questions` are the two
// derived structures the packet owns.

const offsetDateTimeSchema = z.iso.datetime({ offset: true })

export const packetStatusSchema = z.enum(['prepared', 'blocked'])
export type PacketStatus = z.infer<typeof packetStatusSchema>

// The trust-chain gate outcome (R15 #184, D-097). Only `passed` is queue-eligible;
// a packet with an unresolved fabrication finding stays `blocked` and never queues.
export const packetGateStateSchema = z.enum(['pending', 'passed', 'blocked'])
export type PacketGateState = z.infer<typeof packetGateStateSchema>

// The owner's review decision on the packet (R15 #183). `accepted` is guarded by the
// approval predicate (D-095): a packet with any unresolved question is not approvable.
export const packetDecisionSchema = z.enum(['pending', 'accepted', 'skipped', 'rejected'])
export type PacketDecision = z.infer<typeof packetDecisionSchema>

// Mirrors app.services.stop_classifier.StopCategory + the non-stop
// `missing_material` question (D-095, #182). One authoritative category set.
export const stopCategorySchema = z.enum([
  'work_authorization',
  'salary',
  'relocation',
  'eligibility',
  'demographic',
  'legal',
  'sensitive',
  'uncertain',
])
export type StopCategory = z.infer<typeof stopCategorySchema>

export const unresolvedQuestionCategorySchema = z.enum([
  'missing_material',
  ...stopCategorySchema.options,
])
export type UnresolvedQuestionCategory = z.infer<typeof unresolvedQuestionCategorySchema>

export const packetMatchSignalSchema = z.strictObject({
  kind: z.enum(['confirmed_evidence', 'preference']),
  label: z.string(),
  matched_keywords: z.array(z.string()),
  evidence_item_ids: z.array(z.string()),
  score: z.number().int().min(0).max(100),
})
export type PacketMatchSignal = z.infer<typeof packetMatchSignalSchema>

export const packetMatchedRuleSchema = z.strictObject({
  rule_type: z.enum([
    'role',
    'location',
    'compensation',
    'work_authorization',
    'quality_threshold',
  ]),
  matched_keywords: z.array(z.string()),
  min_score: z.number().int().min(0).max(100).nullable(),
})
export type PacketMatchedRule = z.infer<typeof packetMatchedRuleSchema>

export const packetMatchRationaleSchema = z.strictObject({
  composite_score: z.number().int().min(0).max(100),
  signals: z.array(packetMatchSignalSchema),
  matched_rules: z.array(packetMatchedRuleSchema),
})
export type PacketMatchRationale = z.infer<typeof packetMatchRationaleSchema>

export const unresolvedQuestionSchema = z.strictObject({
  field: z.string(),
  category: unresolvedQuestionCategorySchema,
  question: z.string(),
})
export type UnresolvedQuestion = z.infer<typeof unresolvedQuestionSchema>

export const applicationPacketItemSchema = z.strictObject({
  id: z.string(),
  campaign_id: z.string(),
  listing_id: z.string().nullable(),
  listing_attribution_id: z.string().nullable(),
  cv_variant_id: z.string().nullable(),
  drafts_run_id: z.string().nullable(),
  // The reviewer pass whose findings the packet surfaces by-reference (D-093).
  review_run_id: z.string().nullable(),
  status: packetStatusSchema,
  // Trust-chain gate outcome (D-097). `passed` is the only queue-eligible state.
  gate_state: packetGateStateSchema,
  // The owner's review decision (R15 #183). `accepted` requires the packet be approvable.
  decision: packetDecisionSchema,
  match_rationale: packetMatchRationaleSchema,
  unresolved_questions: z.array(unresolvedQuestionSchema),
  estimated_cost_usd: z.number().min(0),
  created_at: offsetDateTimeSchema,
  updated_at: offsetDateTimeSchema,
})
export type ApplicationPacketItem = z.infer<typeof applicationPacketItemSchema>

export const applicationPacketListSchema = z.strictObject({
  items: z.array(applicationPacketItemSchema),
})
export type ApplicationPacketList = z.infer<typeof applicationPacketListSchema>

export const packetPreparationResultSchema = z.strictObject({
  prepares: z.boolean(),
  reason: z.enum(['no_rules_defined', 'ready', 'halted']),
  prepared_count: z.number().int().min(0),
  skipped_existing_count: z.number().int().min(0),
  excluded_by_volume_cap: z.number().int().min(0),
  excluded_by_cost_ceiling: z.number().int().min(0),
  volume_cap: z.number().int().min(0),
  cost_ceiling_usd: z.number().min(0),
  estimated_packet_cost_usd: z.number().min(0),
  estimated_total_cost_usd: z.number().min(0),
  packets: z.array(applicationPacketItemSchema),
})
export type PacketPreparationResult = z.infer<typeof packetPreparationResultSchema>

export const applicationPacketsExportSchema = z.strictObject({
  packets: z.array(applicationPacketItemSchema),
})
export type ApplicationPacketsExport = z.infer<typeof applicationPacketsExportSchema>

// Approval freezes a by-value copy of the exact packet materials (D-096). Handoff
// is a manual link to the official destination; this contract never represents a
// submission operation.
const safeHttpsDestinationSchema = z.url().refine((value) => {
  const parsed = new URL(value)
  return (
    parsed.protocol === 'https:' &&
    parsed.hostname.length > 0 &&
    parsed.username.length === 0 &&
    parsed.password.length === 0
  )
})

export const frozenListingAttributionSchema = z.strictObject({
  id: z.string(),
  source_id: z.string(),
  source_listing_key: z.string(),
  source_url: z.string(),
  retrieved_at: offsetDateTimeSchema,
})

export const frozenManualHandoffSchema = z.strictObject({
  listing_id: z.string().nullable(),
  attribution_id: z.string(),
  source_id: z.string(),
  source_listing_key: z.string(),
  source_url: z.string(),
  retrieved_at: offsetDateTimeSchema,
})

export const packetApprovalSnapshotContentSchema = z.strictObject({
  schema_version: z.literal('packet-approval/v1'),
  packet_id: z.string(),
  campaign_id: z.string(),
  listing_id: z.string().nullable(),
  frozen_at: offsetDateTimeSchema,
  match_rationale: packetMatchRationaleSchema,
  unresolved_questions: z.array(unresolvedQuestionSchema),
  resolved_stop_answers: z.array(z.strictObject({
    field: z.string(),
    category: z.string(),
    answer: z.string(),
  })),
  listing: z.strictObject({
    id: z.string(),
    content_sha256: z.string(),
    title: z.string(),
    company: z.string(),
    description: z.string(),
    attributions: z.array(frozenListingAttributionSchema),
  }).nullable(),
  manual_handoff: frozenManualHandoffSchema.nullable(),
  cv_variant: z.strictObject({
    id: z.string(),
    document_id: z.string(),
    name: z.string(),
    target_role: z.string().nullable(),
    sections: z.array(z.record(z.string(), z.unknown())),
  }).nullable(),
  drafts: z.record(z.string(), z.unknown()).nullable(),
})

export const packetApprovalSnapshotResponseSchema = z.strictObject({
  id: z.string(),
  packet_id: z.string(),
  campaign_id: z.string(),
  listing_id: z.string().nullable(),
  role_key: z.string(),
  destination_url: safeHttpsDestinationSchema.nullable(),
  content: packetApprovalSnapshotContentSchema,
  content_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  created_at: offsetDateTimeSchema,
})
export type PacketApprovalSnapshotResponse = z.infer<
  typeof packetApprovalSnapshotResponseSchema
>

export const packetApprovalPreviewSchema = z.strictObject({
  content: packetApprovalSnapshotContentSchema,
  destination_url: safeHttpsDestinationSchema.nullable(),
  material_sha256: z.string().regex(/^[0-9a-f]{64}$/),
})
export type PacketApprovalPreview = z.infer<typeof packetApprovalPreviewSchema>

export const packetApprovalRequestSchema = z.strictObject({
  expected_material_sha256: z.string().regex(/^[0-9a-f]{64}$/),
})

export const packetSubmissionHandoffSchema = z.strictObject({
  destination_url: safeHttpsDestinationSchema.nullable(),
  instructions: z.string(),
})
export type PacketSubmissionHandoff = z.infer<typeof packetSubmissionHandoffSchema>

export const packetApprovalResultSchema = z.strictObject({
  packet: applicationPacketItemSchema,
  snapshot: packetApprovalSnapshotResponseSchema,
  handoff: packetSubmissionHandoffSchema,
})
export type PacketApprovalResult = z.infer<typeof packetApprovalResultSchema>

export const packetApprovalSnapshotsExportSchema = z.strictObject({
  snapshots: z.array(packetApprovalSnapshotResponseSchema),
})
export type PacketApprovalSnapshotsExport = z.infer<
  typeof packetApprovalSnapshotsExportSchema
>

// Stop answers (R15 #182, D-095/D-099): the owner's typed answers to mandatory-stop
// questions. Only the user can resolve a stop; the system never drafts these fields.
export const stopAnswerRequestSchema = z.strictObject({
  field: z.string().min(1).max(64),
  answer: z.string().min(1).max(4000),
})
export type StopAnswerRequest = z.infer<typeof stopAnswerRequestSchema>

export const stopAnswerResultSchema = z.strictObject({
  packet_id: z.string(),
  resolved_field: z.string(),
  remaining_unresolved: z.number().int().min(0),
  approvable: z.boolean(),
  unresolved_questions: z.array(unresolvedQuestionSchema),
})
export type StopAnswerResult = z.infer<typeof stopAnswerResultSchema>

export const stopAnswerExportItemSchema = z.strictObject({
  packet_id: z.string(),
  field: z.string(),
  category: z.string(),
  answer: z.string(),
  created_at: offsetDateTimeSchema,
  updated_at: offsetDateTimeSchema,
})
export type StopAnswerExportItem = z.infer<typeof stopAnswerExportItemSchema>

export const packetStopAnswersExportSchema = z.strictObject({
  stop_answers: z.array(stopAnswerExportItemSchema),
})
export type PacketStopAnswersExport = z.infer<typeof packetStopAnswersExportSchema>

// Queue review controls (R15 #183). `paused` is the owner's global pause toggle —
// while set, preparation refuses immediately (ADR 0009). `preparation_halted` reflects
// a pipeline-wide regression halt (#184); either one halts preparation.
export const queueReviewStateSchema = z.strictObject({
  paused: z.boolean(),
  preparation_halted: z.boolean(),
})
export type QueueReviewState = z.infer<typeof queueReviewStateSchema>
