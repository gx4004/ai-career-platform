import { z } from 'zod'

export const submissionAuthorizationMechanismSchema = z.enum([
  'oauth2_authorization_code',
  'oauth2_device_authorization',
])

export const submissionAuthorizationSchema = z
  .object({
    id: z.string(),
    source_id: z.string(),
    source_key: z.string(),
    source_display_name: z.string(),
    source_family: z.enum([
      'licensed',
      'employer_ats',
      'public_career_page',
      'user_provided',
    ]),
    mechanism: submissionAuthorizationMechanismSchema,
    scope: z.literal('submit_applications'),
    granted_at: z.iso.datetime({ offset: true }),
  })
  .strict()

export const submissionAuthorizationListSchema = z
  .object({
    items: z.array(submissionAuthorizationSchema),
  })
  .strict()

export const submissionAuthorizationsExportSchema = z
  .object({
    schema_version: z.literal('submission-authorizations-export/v1'),
    grant_count: z.number().int().nonnegative(),
    grants: z.array(submissionAuthorizationSchema),
  })
  .strict()
  .refine(
    (value) => value.grant_count === value.grants.length,
    'grant_count must equal grants length',
  )

export type SubmissionAuthorization = z.infer<
  typeof submissionAuthorizationSchema
>
export type SubmissionAuthorizationList = z.infer<
  typeof submissionAuthorizationListSchema
>
