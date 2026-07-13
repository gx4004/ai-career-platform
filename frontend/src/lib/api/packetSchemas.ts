import { z } from 'zod'

// Mirrors backend/app/schemas/application_packets.py (R15 #181, D-093/D-094).
// A packet is a reference-only composition: the *_id fields are foreign keys,
// never inlined content. `match_rationale` and `unresolved_questions` are the two
// derived structures the packet owns.

const offsetDateTimeSchema = z.iso.datetime({ offset: true })

export const packetStatusSchema = z.enum(['prepared', 'blocked'])
export type PacketStatus = z.infer<typeof packetStatusSchema>

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
  cv_variant_id: z.string().nullable(),
  drafts_run_id: z.string().nullable(),
  status: packetStatusSchema,
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
  reason: z.enum(['no_rules_defined', 'ready']),
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
