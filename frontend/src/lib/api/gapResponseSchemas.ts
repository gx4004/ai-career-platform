import { z } from 'zod'
import { developmentResponseKindSchema } from '#/lib/api/developmentSchemas'
import { gapKindSchema } from '#/lib/api/gapClassificationSchemas'
import { evidenceItemCreateSchema } from '#/lib/api/schemas'

// Mirrors backend/app/schemas/gap_response.py (R17 #200, D-110/D-111). The single
// honest response for one classified gap. Read-only: capture_proposal is the body
// the user submits to the R11 create path; nothing is written by #200.
export const gapActionPathSchema = z.enum([
  'reviewer_reword',
  'evidence_profile_create',
  'advisory',
])
export type GapActionPath = z.infer<typeof gapActionPathSchema>

export const gapRecommendationSourceSchema = z.strictObject({
  label: z.string(),
  url: z.string().url().nullish(),
})

export const gapResponseOfferSchema = z.strictObject({
  gap_classification_id: z.string(),
  gap_kind: gapKindSchema,
  response_kind: developmentResponseKindSchema,
  action_path: gapActionPathSchema,
  headline: z.string(),
  detail: z.string(),
  capture_proposal: evidenceItemCreateSchema.nullish(),
  sources: z.array(gapRecommendationSourceSchema),
  commercial_relationship: z.literal('none'),
})
export type GapResponseOffer = z.infer<typeof gapResponseOfferSchema>
