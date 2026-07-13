import { z } from 'zod'

// Mirrors backend/app/schemas/queue_rules.py (D-094). The keyword dimensions
// carry a keyword list; `quality_threshold` carries a minimum score.
export const queueRuleTypeSchema = z.enum([
  'role',
  'location',
  'compensation',
  'work_authorization',
  'quality_threshold',
])
export type QueueRuleType = z.infer<typeof queueRuleTypeSchema>

const keywordRuleTypes = new Set<QueueRuleType>([
  'role',
  'location',
  'compensation',
  'work_authorization',
])

const offsetDateTimeSchema = z.iso.datetime({ offset: true })

// Owner-supplied upsert body. The refinement mirrors the Pydantic
// model_validator so the client and server agree on rule shape exactly.
export const queueRuleUpsertSchema = z
  .strictObject({
    rule_type: queueRuleTypeSchema,
    keywords: z.array(z.string().min(1).max(80)).min(1).max(20).nullish(),
    min_score: z.number().int().min(0).max(100).nullish(),
  })
  .superRefine((value, ctx) => {
    if (keywordRuleTypes.has(value.rule_type)) {
      if (!value.keywords || value.keywords.length === 0) {
        ctx.addIssue({ code: 'custom', message: 'keyword rule requires keywords' })
      }
      if (value.min_score !== undefined && value.min_score !== null) {
        ctx.addIssue({ code: 'custom', message: 'keyword rule must not set min_score' })
      }
    } else {
      if (value.min_score === undefined || value.min_score === null) {
        ctx.addIssue({ code: 'custom', message: 'quality_threshold requires min_score' })
      }
      if (value.keywords && value.keywords.length > 0) {
        ctx.addIssue({ code: 'custom', message: 'quality_threshold must not set keywords' })
      }
    }
  })
export type QueueRuleUpsert = z.infer<typeof queueRuleUpsertSchema>

export const queueRuleItemSchema = z.strictObject({
  id: z.string(),
  rule_type: queueRuleTypeSchema,
  keywords: z.array(z.string()).nullable(),
  min_score: z.number().int().min(0).max(100).nullable(),
  created_at: offsetDateTimeSchema,
  updated_at: offsetDateTimeSchema,
})
export type QueueRuleItem = z.infer<typeof queueRuleItemSchema>

export const queueRuleListSchema = z.strictObject({
  items: z.array(queueRuleItemSchema),
})
export type QueueRuleList = z.infer<typeof queueRuleListSchema>

export const queueSettingsUpsertSchema = z.strictObject({
  max_packets_per_run: z.number().int().min(1).max(1000),
  cost_ceiling_usd: z.number().gt(0).max(1_000_000),
})
export type QueueSettingsUpsert = z.infer<typeof queueSettingsUpsertSchema>

export const queueSettingsResponseSchema = z.strictObject({
  max_packets_per_run: z.number().int().min(1),
  cost_ceiling_usd: z.number().gt(0),
  estimated_packet_cost_usd: z.number().min(0),
  is_default: z.boolean(),
})
export type QueueSettingsResponse = z.infer<typeof queueSettingsResponseSchema>

export const queueCandidateSchema = z.strictObject({
  listing_id: z.string(),
  title: z.string(),
  company: z.string(),
  score: z.number().int().min(0).max(100),
  estimated_cost_usd: z.number().min(0),
})
export type QueueCandidate = z.infer<typeof queueCandidateSchema>

export const queuePreviewSchema = z.strictObject({
  prepares: z.boolean(),
  reason: z.enum(['no_rules_defined', 'ready']),
  evaluated_count: z.number().int().min(0),
  passed_rules_count: z.number().int().min(0),
  prepared_count: z.number().int().min(0),
  excluded_by_volume_cap: z.number().int().min(0),
  excluded_by_cost_ceiling: z.number().int().min(0),
  volume_cap: z.number().int().min(0),
  cost_ceiling_usd: z.number().min(0),
  estimated_packet_cost_usd: z.number().min(0),
  estimated_total_cost_usd: z.number().min(0),
  candidates: z.array(queueCandidateSchema),
})
export type QueuePreview = z.infer<typeof queuePreviewSchema>

export const queueRulesExportSchema = z.strictObject({
  rules: z.array(queueRuleItemSchema),
  settings: queueSettingsResponseSchema.nullable(),
})
export type QueueRulesExport = z.infer<typeof queueRulesExportSchema>
