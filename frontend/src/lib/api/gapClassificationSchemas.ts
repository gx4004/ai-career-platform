import { z } from 'zod'

// Mirrors backend/app/schemas/gap_classification.py (R17 #198, D-109). Each
// advisory reviewer finding is labeled as exactly one of four honest gap kinds,
// derived deterministically from the finding's own trace plus profile state.
export const gapKindSchema = z.enum([
  'presentation_weakness',
  'uncaptured_evidence',
  'evidence_not_yet_produced',
  'missing_skill',
])
export type GapKind = z.infer<typeof gapKindSchema>

export const gapClassificationSchema = z.strictObject({
  id: z.string(),
  workspace_id: z.string(),
  finding_id: z.string(),
  source_category: z.string(),
  gap_kind: gapKindSchema,
  message: z.string(),
  locations: z.array(z.string()),
  cited_trace: z.array(z.string()),
  created_at: z.iso.datetime({ offset: true }),
})
export type GapClassification = z.infer<typeof gapClassificationSchema>

export const gapClassificationListResponseSchema = z.strictObject({
  schema_version: z.literal('gap-classification/v1'),
  classifications: z.array(gapClassificationSchema),
})
export type GapClassificationListResponse = z.infer<
  typeof gapClassificationListResponseSchema
>
