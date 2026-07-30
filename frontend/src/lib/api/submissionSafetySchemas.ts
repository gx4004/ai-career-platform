import { z } from 'zod'

const offsetDateTimeSchema = z.iso.datetime({ offset: true })

const policyShape = {
  user_rate_limit_per_minute: z.number().int().min(1).max(60),
  user_daily_volume_limit: z.number().int().min(1).max(1_000),
  source_rate_limit_per_minute: z.number().int().min(1).max(1_000),
  source_daily_volume_limit: z.number().int().min(1).max(100_000),
  anomaly_user_attempts_per_hour: z.number().int().min(1).max(1_000),
}

const anomalyBeforeDailyLimit = (value: {
  anomaly_user_attempts_per_hour: number
  user_daily_volume_limit: number
}) => value.anomaly_user_attempts_per_hour <= value.user_daily_volume_limit

export const submissionSafetyPolicyConfigSchema = z
  .object(policyShape)
  .strict()
  .refine(anomalyBeforeDailyLimit, {
    message: 'Anomaly threshold cannot exceed the user daily volume limit',
  })

export const submissionSafetyPolicySchema = z
  .object({
    ...policyShape,
    discovery_source_id: z.string(),
    configured_at: offsetDateTimeSchema,
    updated_at: offsetDateTimeSchema,
  })
  .strict()
  .refine(anomalyBeforeDailyLimit, {
    message: 'Anomaly threshold cannot exceed the user daily volume limit',
  })

export const submissionSafetyControlSchema = z
  .object({
    global_kill_switch: z.boolean(),
    incident_playbook_version: z.string().nullable(),
    incident_rehearsed_at: offsetDateTimeSchema.nullable(),
    updated_at: offsetDateTimeSchema,
  })
  .strict()

export const submissionIncidentRehearsalSchema = z
  .object({
    id: z.string(),
    playbook_version: z.string(),
    evidence_reference: z.string(),
    roles_confirmed: z.literal(true),
    rollback_rehearsed: z.literal(true),
    communication_reviewed: z.literal(true),
    recorded_at: offsetDateTimeSchema,
  })
  .strict()

export type SubmissionIncidentRehearsalInput = Omit<
  z.infer<typeof submissionIncidentRehearsalSchema>,
  'id' | 'recorded_at'
>

export const adminSubmissionSafetySchema = z
  .object({
    control: submissionSafetyControlSchema,
    policies: z.array(submissionSafetyPolicySchema),
    rehearsals: z.array(submissionIncidentRehearsalSchema),
  })
  .strict()

export const submissionSafetyStatusSchema = z
  .object({
    allowed: z.boolean(),
    reason: z
      .enum([
        'user_paused',
        'global_kill_switch',
        'policy_missing',
        'incident_rehearsal_missing',
        'attempt_reservation_expired',
        'user_rate_limit',
        'user_volume_limit',
        'source_rate_limit',
        'source_volume_limit',
        'anomaly_detected',
      ])
      .nullable(),
    user_rate_used: z.number().int().nonnegative(),
    user_rate_limit: z.number().int().positive().nullable(),
    user_daily_used: z.number().int().nonnegative(),
    user_daily_limit: z.number().int().positive().nullable(),
  })
  .strict()
  .refine((value) => value.allowed === (value.reason === null), {
    message: 'Allowed state and reason must agree',
  })

export type SubmissionSafetyPolicyConfig = z.infer<
  typeof submissionSafetyPolicyConfigSchema
>
export type SubmissionSafetyPolicy = z.infer<typeof submissionSafetyPolicySchema>
export type SubmissionSafetyControl = z.infer<typeof submissionSafetyControlSchema>
export type AdminSubmissionSafety = z.infer<typeof adminSubmissionSafetySchema>
export type SubmissionSafetyStatus = z.infer<typeof submissionSafetyStatusSchema>
