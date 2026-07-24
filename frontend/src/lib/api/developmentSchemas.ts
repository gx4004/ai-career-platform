import { z } from 'zod'
import { gapKindSchema } from '#/lib/api/gapClassificationSchemas'

// Mirrors backend/app/schemas/development.py (R17 #199, D-112). A development
// item is the user's bounded to-do derived from one classified gap.
export const developmentResponseKindSchema = z.enum([
  'reword',
  'capture_evidence',
  'produce_evidence',
  'learn_skill',
])
export type DevelopmentResponseKind = z.infer<typeof developmentResponseKindSchema>

export const developmentStateSchema = z.enum(['planned', 'in_progress', 'completed'])
export type DevelopmentState = z.infer<typeof developmentStateSchema>

export const developmentItemSchema = z.strictObject({
  id: z.string(),
  gap_classification_id: z.string().nullable(),
  gap_kind: gapKindSchema,
  response_kind: developmentResponseKindSchema,
  state: developmentStateSchema,
  target_date: z.string().nullable(),
  notes: z.string().nullable(),
  source_finding_id: z.string().nullable(),
  timeline: z.array(z.record(z.string(), z.unknown())),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
})
export type DevelopmentItem = z.infer<typeof developmentItemSchema>

export const developmentPlanResponseSchema = z.strictObject({
  schema_version: z.literal('development-plan/v1'),
  items: z.array(developmentItemSchema),
})
export type DevelopmentPlanResponse = z.infer<typeof developmentPlanResponseSchema>

export const developmentPlanExportSchema = z
  .strictObject({
    item_count: z.number().int().nonnegative(),
    items: z.array(developmentItemSchema),
  })
  .refine((value) => value.item_count === value.items.length)

// Request bodies. `target_date`/`notes` accept null to clear; omit to leave
// unchanged (mirrors the backend model_fields_set semantics).
export const developmentItemCreateSchema = z.strictObject({
  gap_classification_id: z.string(),
  target_date: z.string().nullish(),
  notes: z.string().max(2000).nullish(),
})
export const developmentItemUpdateSchema = z.strictObject({
  state: developmentStateSchema.optional(),
  target_date: z.string().nullish(),
  notes: z.string().max(2000).nullish(),
})
