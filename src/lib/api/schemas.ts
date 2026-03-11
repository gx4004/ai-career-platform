import { z } from 'zod'

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  full_name: z.string().nullable().optional(),
  is_active: z.boolean(),
  created_at: z.string().optional(),
})

export const tokenSchema = z.object({
  access_token: z.string(),
  token_type: z.string().default('bearer'),
})

export const oauthProviderSchema = z.object({
  provider: z.string(),
  enabled: z.boolean(),
  label: z.string(),
})

export const authProvidersSchema = z.object({
  providers: z.array(oauthProviderSchema).default([]),
})

export const healthCheckSchema = z.object({
  status: z.string(),
  service: z.string().optional(),
  environment: z.string().optional(),
  time: z.string().optional(),
  checks: z.record(z.string(), z.unknown()).optional(),
})

export const parsedCvSchema = z.object({
  filename: z.string(),
  extracted_text: z.string(),
  chars_count: z.number().optional(),
  warnings: z.array(z.string()).default([]),
})

export const importedJobSchema = z.object({
  job_title: z.string().optional(),
  company_name: z.string().optional(),
  job_description: z.string(),
  source_url: z.string().url().optional(),
})

export const toolRunSummarySchema = z.object({
  id: z.string(),
  tool_name: z.string(),
  label: z.string().nullable().optional(),
  is_favorite: z.boolean(),
  created_at: z.string(),
})

export const toolRunDetailSchema = toolRunSummarySchema.extend({
  result_payload: z.record(z.string(), z.unknown()).default({}),
})

export const toolRunListSchema = z.object({
  items: z.array(toolRunSummarySchema),
  total: z.number(),
  page: z.number(),
  page_size: z.number(),
  has_more: z.boolean(),
})

export const deletedResponseSchema = z.object({
  deleted: z.number(),
})

export const genericObjectSchema = z.record(z.string(), z.unknown())

export const resumeResultSchema = z
  .object({
    history_id: z.string(),
    score: z.number(),
    skills: z.array(z.string()),
    strengths: z.array(z.string()),
    improvements: z.array(z.string()),
  })
  .passthrough()

export const jobMatchResultSchema = z
  .object({
    history_id: z.string(),
    fit_percent: z.number(),
    matched_skills: z.array(z.string()),
    missing_skills: z.array(z.string()),
    recommendation: z.string(),
  })
  .passthrough()

export const coverLetterResultSchema = z
  .object({
    history_id: z.string(),
    cover_letter: z.string(),
  })
  .passthrough()

export const interviewResultSchema = z
  .object({
    history_id: z.string(),
    questions: z.array(
      z.object({
        question: z.string(),
        answer: z.string(),
        key_points: z.array(z.string()),
      }),
    ),
  })
  .passthrough()

export const careerResultSchema = z
  .object({
    history_id: z.string(),
    paths: z.array(
      z.object({
        role_title: z.string(),
        fit_score: z.number(),
        transition_timeline: z.string(),
        required_skills: z.array(z.string()),
      }),
    ),
    current_skills: z.array(z.string()),
    target_skills: z.array(z.string()),
  })
  .passthrough()

export const portfolioResultSchema = z
  .object({
    history_id: z.string(),
    projects: z.array(
      z.object({
        project_title: z.string(),
        description: z.string(),
        skills: z.array(z.string()),
        complexity: z.string(),
      }),
    ),
  })
  .passthrough()

export type User = z.infer<typeof userSchema>
export type Token = z.infer<typeof tokenSchema>
export type OAuthProvider = z.infer<typeof oauthProviderSchema>
export type HealthCheck = z.infer<typeof healthCheckSchema>
export type ParsedCvResult = z.infer<typeof parsedCvSchema>
export type ImportedJobPost = z.infer<typeof importedJobSchema>
export type ToolRunSummary = z.infer<typeof toolRunSummarySchema>
export type ToolRunDetail = z.infer<typeof toolRunDetailSchema>
export type ToolRunList = z.infer<typeof toolRunListSchema>
export type ResumeResult = z.infer<typeof resumeResultSchema>
export type JobMatchResult = z.infer<typeof jobMatchResultSchema>
export type CoverLetterResult = z.infer<typeof coverLetterResultSchema>
export type InterviewResult = z.infer<typeof interviewResultSchema>
export type CareerResult = z.infer<typeof careerResultSchema>
export type PortfolioResult = z.infer<typeof portfolioResultSchema>
