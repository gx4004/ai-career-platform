import { describe, expect, it } from 'vitest'
import {
  gapClassificationListResponseSchema,
  gapClassificationSchema,
  gapKindSchema,
} from '#/lib/api/gapClassificationSchemas'

const classification = {
  id: 'gap-1',
  workspace_id: 'ws-1',
  finding_id: 'finding-1',
  source_category: 'missed_requirement',
  gap_kind: 'missing_skill',
  message: 'The materials do not address the listing requirement “Kubernetes”.',
  locations: ['Canonical listing:chars 8-18'],
  cited_trace: ['listing_requirement:Kubernetes', 'skill_lexicon:matched:Kubernetes', 'classified:missing_skill'],
  created_at: '2026-07-24T00:00:00Z',
}

describe('gapKindSchema', () => {
  it('accepts exactly the four honest gap kinds and nothing else', () => {
    for (const kind of [
      'presentation_weakness',
      'uncaptured_evidence',
      'evidence_not_yet_produced',
      'missing_skill',
    ]) {
      expect(gapKindSchema.parse(kind)).toBe(kind)
    }
    expect(gapKindSchema.safeParse('rewording').success).toBe(false)
  })
})

describe('gapClassificationSchema', () => {
  it('parses a well-formed classification', () => {
    expect(gapClassificationSchema.parse(classification)).toEqual(classification)
  })

  it('rejects unknown fields (mirrors backend extra="forbid")', () => {
    expect(
      gapClassificationSchema.safeParse({ ...classification, rationale: 'freeform' }).success,
    ).toBe(false)
  })

  it('rejects an out-of-set gap kind', () => {
    expect(
      gapClassificationSchema.safeParse({ ...classification, gap_kind: 'presentation' }).success,
    ).toBe(false)
  })
})

describe('gapClassificationListResponseSchema', () => {
  it('parses the list envelope with its versioned literal', () => {
    const parsed = gapClassificationListResponseSchema.parse({
      schema_version: 'gap-classification/v1',
      classifications: [classification],
    })
    expect(parsed.classifications).toHaveLength(1)
  })

  it('rejects a wrong schema_version literal', () => {
    expect(
      gapClassificationListResponseSchema.safeParse({
        schema_version: 'gap-classification/v2',
        classifications: [],
      }).success,
    ).toBe(false)
  })
})
