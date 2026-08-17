import { z } from 'zod'
import {
  gapActionPathSchema,
  gapRecommendationSourceSchema,
  gapResponseOfferSchema,
} from '#/lib/api/schemas'

export {
  gapActionPathSchema,
  gapRecommendationSourceSchema,
  gapResponseOfferSchema,
}

// Mirrors backend/app/schemas/gap_response.py (R17 #200, D-110/D-111). The single
// honest response for one classified gap. Read-only: capture_proposal is the body
// the user submits to the R11 create path; nothing is written by #200.
export type GapActionPath = z.infer<typeof gapActionPathSchema>
export type GapResponseOffer = z.infer<typeof gapResponseOfferSchema>
// D-111's disclosure marker. Derived from the schema rather than restated, so
// widening the backend Literal forces every presentation site to be revisited
// instead of silently continuing to assert the old disclosure.
export type GapCommercialRelationship = GapResponseOffer['commercial_relationship']
