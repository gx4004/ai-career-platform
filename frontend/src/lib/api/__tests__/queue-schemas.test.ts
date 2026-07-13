import { describe, expect, it } from 'vitest'
import {
  queuePreviewSchema,
  queueRuleItemSchema,
  queueRuleListSchema,
  queueRuleUpsertSchema,
  queueRulesExportSchema,
  queueSettingsResponseSchema,
  queueSettingsUpsertSchema,
} from '#/lib/api/queueSchemas'

const ruleItem = {
  id: 'rule-1',
  rule_type: 'role',
  keywords: ['engineer', 'developer'],
  min_score: null,
  created_at: '2026-07-14T00:00:00Z',
  updated_at: '2026-07-14T00:00:00Z',
}

const thresholdItem = {
  id: 'rule-2',
  rule_type: 'quality_threshold',
  keywords: null,
  min_score: 80,
  created_at: '2026-07-14T00:00:00Z',
  updated_at: '2026-07-14T00:00:00Z',
}

const settings = {
  max_packets_per_run: 10,
  cost_ceiling_usd: 1.0,
  estimated_packet_cost_usd: 0.05,
  is_default: false,
}

const preview = {
  prepares: true,
  reason: 'ready',
  evaluated_count: 5,
  passed_rules_count: 3,
  prepared_count: 2,
  excluded_by_volume_cap: 1,
  excluded_by_cost_ceiling: 0,
  volume_cap: 10,
  cost_ceiling_usd: 1.0,
  estimated_packet_cost_usd: 0.05,
  estimated_total_cost_usd: 0.1,
  candidates: [
    {
      listing_id: 'listing-1',
      title: 'Senior Engineer',
      company: 'Acme',
      score: 82,
      estimated_cost_usd: 0.05,
    },
  ],
}

describe('queue rule contracts', () => {
  it('mirrors the rule item response (keyword and threshold shapes)', () => {
    expect(queueRuleItemSchema.parse(ruleItem).keywords).toEqual(['engineer', 'developer'])
    expect(queueRuleItemSchema.parse(thresholdItem).min_score).toBe(80)
    expect(queueRuleListSchema.parse({ items: [ruleItem, thresholdItem] }).items).toHaveLength(2)
  })

  it('rejects rule item contract drift', () => {
    expect(queueRuleItemSchema.safeParse({ ...ruleItem, rule_type: 'bogus' }).success).toBe(false)
    expect(queueRuleItemSchema.safeParse({ ...ruleItem, unexpected: true }).success).toBe(false)
  })

  it('enforces the upsert dimension shape like the backend validator', () => {
    expect(
      queueRuleUpsertSchema.safeParse({ rule_type: 'role', keywords: ['engineer'] }).success,
    ).toBe(true)
    expect(
      queueRuleUpsertSchema.safeParse({ rule_type: 'quality_threshold', min_score: 70 }).success,
    ).toBe(true)
    // Keyword rule without keywords, or with a stray min_score.
    expect(queueRuleUpsertSchema.safeParse({ rule_type: 'role' }).success).toBe(false)
    expect(
      queueRuleUpsertSchema.safeParse({ rule_type: 'role', keywords: ['x'], min_score: 5 }).success,
    ).toBe(false)
    // Threshold rule missing the score, or carrying keywords.
    expect(queueRuleUpsertSchema.safeParse({ rule_type: 'quality_threshold' }).success).toBe(false)
    expect(
      queueRuleUpsertSchema.safeParse({
        rule_type: 'quality_threshold',
        keywords: ['x'],
        min_score: 5,
      }).success,
    ).toBe(false)
  })
})

describe('queue settings contracts', () => {
  it('mirrors the settings response and upsert bounds', () => {
    expect(queueSettingsResponseSchema.parse(settings).is_default).toBe(false)
    expect(
      queueSettingsUpsertSchema.safeParse({ max_packets_per_run: 5, cost_ceiling_usd: 2 }).success,
    ).toBe(true)
    expect(
      queueSettingsUpsertSchema.safeParse({ max_packets_per_run: 0, cost_ceiling_usd: 2 }).success,
    ).toBe(false)
    expect(
      queueSettingsUpsertSchema.safeParse({ max_packets_per_run: 5, cost_ceiling_usd: 0 }).success,
    ).toBe(false)
  })
})

describe('queue preview + export contracts', () => {
  it('mirrors the candidate preview response', () => {
    const parsed = queuePreviewSchema.parse(preview)
    expect(parsed.candidates[0].listing_id).toBe('listing-1')
    expect(parsed.reason).toBe('ready')
  })

  it('accepts the no-rules preview shape', () => {
    const parsed = queuePreviewSchema.parse({
      ...preview,
      prepares: false,
      reason: 'no_rules_defined',
      evaluated_count: 0,
      passed_rules_count: 0,
      prepared_count: 0,
      excluded_by_volume_cap: 0,
      excluded_by_cost_ceiling: 0,
      estimated_total_cost_usd: 0,
      candidates: [],
    })
    expect(parsed.prepares).toBe(false)
  })

  it('mirrors the machine-readable export (with and without settings)', () => {
    expect(
      queueRulesExportSchema.parse({ rules: [ruleItem], settings }).settings?.max_packets_per_run,
    ).toBe(10)
    expect(queueRulesExportSchema.parse({ rules: [], settings: null }).settings).toBeNull()
  })
})
