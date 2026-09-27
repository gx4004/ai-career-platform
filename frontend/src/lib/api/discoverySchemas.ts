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

export const discoveryRobotsPolicySchema = z.enum([
  'required',
  'not_applicable',
])

const offsetDateTimeSchema = z.iso.datetime({ offset: true })

// This is a read-only response schema: `allowed_query_parameters` and
// `endpoint_url` describe whatever a source was registered with server-side
// (backend/app/schemas/discovery_sources.py: DiscoverySourceResponse). The
// backend already enforces its own input rules (closed query-parameter set,
// https-only endpoint, no credentials/query/fragment, uniqueness) on write;
// re-validating those rules here on a read rejects real data instead of
// merely mirroring shape, e.g. employer-ATS sources whose
// `allowed_query_parameters` include provider switches like `content`,
// `mode`, or `includeCompensation` (see backend/app/scripts/ats_sources.json).
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
  endpoint_url: z.string().nullable(),
  allowed_query_parameters: z.array(z.string()).nullable(),
  robots_policy: discoveryRobotsPolicySchema.nullable(),
  rate_limit_per_minute: z.number().int().positive(),
  attribution_rule: z.string(),
  retention_days: z.number().int().positive(),
  kill_switch: z.boolean(),
  ingestion_allowed: z.boolean(),
  // Latest ingestion run, stamped once per run (#369).
  last_fetched_at: offsetDateTimeSchema.nullable(),
  last_outcome: z.string().nullable(),
  listing_count: z.number().int().nonnegative().nullable(),
  created_at: offsetDateTimeSchema,
  updated_at: offsetDateTimeSchema,
})

export const discoverySourceListSchema = z.object({
  items: z.array(discoverySourceSchema),
})

export type DiscoverySource = z.infer<typeof discoverySourceSchema>
export type DiscoverySourceList = z.infer<typeof discoverySourceListSchema>
