import { z } from 'zod'

export const discoverySourceFamilySchema = z.enum([
  'licensed',
  'employer_ats',
  'public_career_page',
  'user_provided',
])

export const discoveryTermsStatusSchema = z.enum([
  'pending',
  'accepted',
  'failed',
])

export const discoveryAllowedBehaviorSchema = z.enum([
  'api',
  'feed',
  'ats_integration',
  'public_page',
  'user_url',
  'paste',
])

const offsetDateTimeSchema = z.iso.datetime({ offset: true })

export const discoverySourceSchema = z.object({
  id: z.string(),
  source_key: z.string(),
  display_name: z.string(),
  source_family: discoverySourceFamilySchema,
  owner: z.string(),
  terms_status: discoveryTermsStatusSchema,
  terms_reviewed_at: offsetDateTimeSchema.nullable(),
  terms_reviewed_by: z.string().nullable(),
  allowed_behavior: discoveryAllowedBehaviorSchema,
  rate_limit_per_minute: z.number().int().positive(),
  attribution_rule: z.string(),
  retention_days: z.number().int().positive(),
  kill_switch: z.boolean(),
  ingestion_allowed: z.boolean(),
  created_at: offsetDateTimeSchema,
  updated_at: offsetDateTimeSchema,
})

export const discoverySourceListSchema = z.object({
  items: z.array(discoverySourceSchema),
})

export type DiscoverySource = z.infer<typeof discoverySourceSchema>
export type DiscoverySourceList = z.infer<typeof discoverySourceListSchema>
