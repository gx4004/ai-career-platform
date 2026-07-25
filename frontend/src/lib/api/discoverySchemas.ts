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

export const discoveryQueryParameterSchema = z.enum([
  'role',
  'location',
  'remote',
  'page',
  'cursor',
  'limit',
  'posted_after',
])

const offsetDateTimeSchema = z.iso.datetime({ offset: true })
const endpointUrlSchema = z
  .url()
  .startsWith('https://')
  .refine((value) => {
    const parsed = new URL(value)
    return !parsed.username && !parsed.password && !parsed.search && !parsed.hash
  }, 'Endpoint cannot contain credentials, query, or fragment')

const allowedQueryParametersSchema = z
  .array(discoveryQueryParameterSchema)
  .max(7)
  .refine((items) => new Set(items).size === items.length, 'Query parameters must be unique')

const submissionContractFieldSchema = z
  .object({
    source_field: z.string().regex(/^[a-z][a-z0-9_]{0,99}$/),
    packet_field: z
      .string()
      .max(160)
      .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/),
    required: z.boolean(),
  })
  .strict()

const submissionContractFormatSchema = z
  .object({
    source_field: z.string().regex(/^[a-z][a-z0-9_]{0,99}$/),
    kind: z.enum([
      'utf8_text',
      'email',
      'phone_e164',
      'iso_date',
      'https_url',
      'pdf',
      'docx',
      'boolean',
      'integer',
      'decimal',
      'enum',
    ]),
  })
  .strict()

const submissionContractErrorSchema = z
  .object({
    source_code: z.string().regex(/^[a-zA-Z0-9_.-]{1,100}$/),
    meaning: z.enum([
      'accepted',
      'validation_error',
      'authentication_required',
      'authorization_denied',
      'challenge',
      'rate_limited',
      'duplicate',
      'transient_failure',
    ]),
    handling: z.enum([
      'confirm_success',
      'stop_and_return',
      'retry_with_source_idempotency',
    ]),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.meaning === 'accepted' && value.handling !== 'confirm_success') {
      context.addIssue({
        code: 'custom',
        message: 'Accepted responses must confirm success',
      })
    }
    if (value.meaning === 'challenge' && value.handling !== 'stop_and_return') {
      context.addIssue({
        code: 'custom',
        message: 'Challenges must stop and return control to the user',
      })
    }
    if (value.handling === 'confirm_success' && value.meaning !== 'accepted') {
      context.addIssue({
        code: 'custom',
        message: 'Only accepted responses may confirm success',
      })
    }
    if (
      value.handling === 'retry_with_source_idempotency' &&
      value.meaning !== 'rate_limited' &&
      value.meaning !== 'transient_failure'
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Only bounded transient failures may be retryable',
      })
    }
  })

export const submissionSourceGovernanceSchema = z
  .object({
    id: z.string(),
    legal_terms_status: z.enum(['pending', 'accepted', 'failed']),
    legal_terms_reviewed_at: offsetDateTimeSchema.nullable(),
    legal_terms_reviewed_by: z.string().nullable(),
    contract_status: z.enum(['missing', 'verified', 'broken']),
    contract_version: z
      .string()
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,99}$/)
      .nullable(),
    contract_fields: z
      .array(submissionContractFieldSchema)
      .min(1)
      .max(100)
      .nullable(),
    contract_formats: z
      .array(submissionContractFormatSchema)
      .min(1)
      .max(100)
      .nullable(),
    contract_error_semantics: z
      .array(submissionContractErrorSchema)
      .min(1)
      .max(100)
      .nullable(),
    contract_reviewed_at: offsetDateTimeSchema.nullable(),
    contract_reviewed_by: z.string().nullable(),
    promoted: z.boolean(),
    promoted_at: offsetDateTimeSchema.nullable(),
    promoted_by: z.string().nullable(),
    kill_switch: z.boolean(),
    submission_allowed: z.boolean(),
    created_at: offsetDateTimeSchema,
    updated_at: offsetDateTimeSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const reviewValues = [
      value.legal_terms_reviewed_at,
      value.legal_terms_reviewed_by,
    ]
    if (
      (value.legal_terms_status === 'pending' &&
        reviewValues.some((item) => item !== null)) ||
      (value.legal_terms_status !== 'pending' &&
        reviewValues.some((item) => item === null))
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Legal/terms review metadata does not match its status',
      })
    }

    const contractValues = [
      value.contract_version,
      value.contract_fields,
      value.contract_formats,
      value.contract_error_semantics,
      value.contract_reviewed_at,
      value.contract_reviewed_by,
    ]
    if (
      (value.contract_status === 'missing' &&
        contractValues.some((item) => item !== null)) ||
      (value.contract_status !== 'missing' &&
        contractValues.some((item) => item === null))
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Contract metadata does not match its status',
      })
    }
    if (
      value.contract_fields &&
      value.contract_formats &&
      value.contract_error_semantics
    ) {
      const fieldNames = value.contract_fields.map((item) => item.source_field)
      const formatNames = value.contract_formats.map((item) => item.source_field)
      const errorCodes = value.contract_error_semantics.map(
        (item) => item.source_code,
      )
      if (
        new Set(fieldNames).size !== fieldNames.length ||
        new Set(formatNames).size !== formatNames.length ||
        fieldNames.some((item) => !formatNames.includes(item)) ||
        formatNames.some((item) => !fieldNames.includes(item)) ||
        new Set(errorCodes).size !== errorCodes.length ||
        !value.contract_error_semantics.some(
          (item) => item.meaning === 'accepted',
        )
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Compatibility contract is incomplete or inconsistent',
        })
      }
    }

    if (
      (value.promoted &&
        (value.promoted_at === null ||
          value.promoted_by === null ||
          value.legal_terms_status !== 'accepted' ||
          value.contract_status !== 'verified')) ||
      (!value.promoted &&
        (value.promoted_at !== null || value.promoted_by !== null))
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Promotion state does not match its gate metadata',
      })
    }
    if (
      value.submission_allowed &&
      (!value.promoted ||
        value.legal_terms_status !== 'accepted' ||
        value.contract_status !== 'verified' ||
        value.kill_switch)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Allowed submission source must satisfy every local gate',
      })
    }
  })

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
  endpoint_url: endpointUrlSchema.nullable(),
  allowed_query_parameters: allowedQueryParametersSchema.nullable(),
  robots_policy: discoveryRobotsPolicySchema.nullable(),
  rate_limit_per_minute: z.number().int().positive(),
  attribution_rule: z.string(),
  retention_days: z.number().int().positive(),
  kill_switch: z.boolean(),
  ingestion_allowed: z.boolean(),
  submission_governance: submissionSourceGovernanceSchema.nullable(),
  created_at: offsetDateTimeSchema,
  updated_at: offsetDateTimeSchema,
})

export const discoverySourceListSchema = z.object({
  items: z.array(discoverySourceSchema),
})

export type DiscoverySource = z.infer<typeof discoverySourceSchema>
export type DiscoverySourceList = z.infer<typeof discoverySourceListSchema>
