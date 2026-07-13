import { z } from 'zod'

export const campaignStatusSchema = z.enum([
  'planning', 'preparing', 'applied', 'interviewing',
  'offer', 'accepted', 'rejected', 'withdrawn',
])
export type CampaignStatus = z.infer<typeof campaignStatusSchema>
export const campaignListingSchema = z.strictObject({
  title: z.string(), company: z.string(), description: z.string(),
  source_url: z.string().url().nullable(), retrieved_at: z.iso.datetime({ offset: true }),
})

export const evidenceKindSchema = z.enum([
  'experience', 'achievement', 'skill', 'education', 'project',
  'certification', 'preference', 'interview-evidence',
])
export const evidenceProvenanceSchema = z.enum(['imported', 'inferred', 'user-entered'])
export const evidenceConfirmationStateSchema = z.enum(['unconfirmed', 'confirmed', 'rejected'])
export const evidenceItemCreateSchema = z.strictObject({
  kind: evidenceKindSchema,
  content: z.record(z.string(), z.unknown()).refine((value) => Object.keys(value).length > 0),
  provenance: evidenceProvenanceSchema,
})
export const evidenceItemUpdateSchema = evidenceItemCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0)
export const evidenceConfirmationActionSchema = z.strictObject({
  action: z.enum(['confirm', 'reject']),
})
export const evidenceItemSchema = z.object({
  id: z.string(),
  kind: evidenceKindSchema,
  content: z.record(z.string(), z.unknown()),
  provenance: evidenceProvenanceSchema,
  confirmation_state: evidenceConfirmationStateSchema,
  created_at: z.string(),
  updated_at: z.string(),
})
export const evidenceItemListSchema = z.object({ items: z.array(evidenceItemSchema) })

export const discoveryRecommendationSignalSchema = z.strictObject({
  kind: z.enum(['confirmed_evidence', 'preference']),
  label: z.string(),
  matched_keywords: z.array(z.string()),
  evidence_item_ids: z.array(z.string()),
  score: z.number().int().min(0).max(100),
})
export const discoveryRecommendationAttributionSchema = z.strictObject({
  source_id: z.string(),
  source_name: z.string(),
  source_family: z.enum([
    'licensed', 'employer_ats', 'public_career_page', 'user_provided',
  ]),
  source_url: z.string().url().max(2_048).refine((value) => value.startsWith('https://')),
  retrieved_at: z.iso.datetime({ offset: true }),
})
export const discoveryRecommendationSchema = z.strictObject({
  listing_id: z.string(),
  title: z.string(),
  company: z.string(),
  description: z.string(),
  score: z.number().int().min(0).max(100),
  rationale: z.array(discoveryRecommendationSignalSchema),
  attributions: z.array(discoveryRecommendationAttributionSchema).min(1),
})
export const discoveryRecommendationListSchema = z.strictObject({
  items: z.array(discoveryRecommendationSchema),
  confirmed_item_count: z.number().int().nonnegative(),
  preference_item_count: z.number().int().nonnegative(),
})
export type DiscoveryRecommendation = z.infer<typeof discoveryRecommendationSchema>
export type DiscoveryRecommendationList = z.infer<typeof discoveryRecommendationListSchema>

// R14 #175 discovery correction controls. Mirrors
// backend/app/schemas/discovery_personalization.py.
export const discoverySourceFamilySchema = z.enum([
  'licensed', 'employer_ats', 'public_career_page', 'user_provided',
])
export const discoveryReportReasonCategorySchema = z.enum([
  'not_relevant', 'expired', 'duplicate', 'wrong_location', 'low_quality', 'other',
])
export const discoveryHiddenSourceSchema = z.strictObject({
  source_id: z.string(),
  source_key: z.string(),
  display_name: z.string(),
  source_family: discoverySourceFamilySchema,
  created_at: z.iso.datetime({ offset: true }),
})
export const discoveryDismissalSchema = z.strictObject({
  listing_id: z.string(),
  created_at: z.iso.datetime({ offset: true }),
})
export const discoveryPersonalizationSchema = z.strictObject({
  hidden_sources: z.array(discoveryHiddenSourceSchema),
  dismissals: z.array(discoveryDismissalSchema),
})
export const discoveryReportAckSchema = z.strictObject({
  id: z.string(),
  listing_id: z.string(),
  reason_category: discoveryReportReasonCategorySchema,
  created_at: z.iso.datetime({ offset: true }),
})
export const discoveryPersonalizationReportExportSchema = z.strictObject({
  listing_id: z.string(),
  listing_title: z.string(),
  listing_company: z.string(),
  source_family: discoverySourceFamilySchema,
  reason_category: discoveryReportReasonCategorySchema,
  reason: z.string(),
  created_at: z.iso.datetime({ offset: true }),
})
export const discoveryPersonalizationExportSchema = z.strictObject({
  hidden_sources: z.array(discoveryHiddenSourceSchema),
  dismissals: z.array(discoveryDismissalSchema),
  reports: z.array(discoveryPersonalizationReportExportSchema),
})
export const adminDiscoveryReportSchema = z.strictObject({
  id: z.string(),
  listing_id: z.string(),
  listing_title: z.string(),
  listing_company: z.string(),
  source_family: discoverySourceFamilySchema,
  reason_category: discoveryReportReasonCategorySchema,
  reason: z.string(),
  created_at: z.iso.datetime({ offset: true }),
})
export const adminDiscoveryReportListSchema = z.strictObject({
  items: z.array(adminDiscoveryReportSchema),
})
export type DiscoveryPersonalization = z.infer<typeof discoveryPersonalizationSchema>
export type DiscoveryHiddenSource = z.infer<typeof discoveryHiddenSourceSchema>
export type DiscoveryDismissal = z.infer<typeof discoveryDismissalSchema>
export type DiscoveryReportReasonCategory = z.infer<typeof discoveryReportReasonCategorySchema>
export type AdminDiscoveryReport = z.infer<typeof adminDiscoveryReportSchema>
export type AdminDiscoveryReportList = z.infer<typeof adminDiscoveryReportListSchema>

// R11 reviewable resume-import proposals (#146). A proposal is ephemeral — it is
// never persisted server-side and carries no confirmation state. Resume-derived
// proposals are always `imported`; accepting one goes through the normal
// item-create path, which stores it `unconfirmed` (D-062).
export const evidenceImportRequestSchema = z.strictObject({
  resume_text: z.string().min(50).max(50_000),
})
export const evidenceProposalSchema = z.object({
  proposal_id: z.string(),
  kind: evidenceKindSchema,
  content: z.record(z.string(), z.unknown()),
  provenance: z.literal('imported'),
})
export const evidenceImportProposalsSchema = z.object({
  proposals: z.array(evidenceProposalSchema),
})
export type EvidenceItem = z.infer<typeof evidenceItemSchema>
export type EvidenceProposal = z.infer<typeof evidenceProposalSchema>
export type EvidenceImportRequest = z.infer<typeof evidenceImportRequestSchema>
export type EvidenceKind = z.infer<typeof evidenceKindSchema>
export type EvidenceProvenance = z.infer<typeof evidenceProvenanceSchema>
export type EvidenceConfirmationState = z.infer<typeof evidenceConfirmationStateSchema>
export type EvidenceItemCreate = z.infer<typeof evidenceItemCreateSchema>
export type EvidenceItemUpdate = z.infer<typeof evidenceItemUpdateSchema>
export type EvidenceConfirmationAction = z.infer<typeof evidenceConfirmationActionSchema>

export const cvSectionKindSchema = z.enum([
  'summary', 'experience', 'achievements', 'skills', 'education', 'projects',
  'certifications', 'interview-evidence', 'custom',
])
export const cvEntrySchema = z.strictObject({
  id: z.string().min(1).max(100),
  evidence_item_id: z.string().min(1).nullable(),
  body: z.string().min(1).max(5_000),
  position: z.number().int().nonnegative(),
})
export const cvSectionSchema = z.strictObject({
  id: z.string().min(1).max(100),
  kind: cvSectionKindSchema,
  title: z.string().min(1).max(120),
  visible: z.boolean().default(true),
  position: z.number().int().nonnegative(),
  entries: z.array(cvEntrySchema).max(200).default([]),
})
export const cvDocumentCreateSchema = z.strictObject({
  name: z.string().min(1).max(120),
  sections: z.array(cvSectionSchema).max(50).default([]),
  seed_evidence_item_ids: z.array(z.string()).max(200).default([]),
})
export const cvDocumentUpdateSchema = z.strictObject({
  name: z.string().min(1).max(120).optional(),
  sections: z.array(cvSectionSchema).max(50).optional(),
}).refine((value) => Object.keys(value).length > 0)
export const cvVariantCreateSchema = z.strictObject({
  name: z.string().min(1).max(120),
  target_role: z.string().min(1).max(200).nullable().optional(),
})
export const cvVariantSchema = z.object({
  id: z.string(), name: z.string(), target_role: z.string().nullable(),
  sections: z.array(cvSectionSchema), created_at: z.iso.datetime(),
})
export const cvDocumentSchema = z.object({
  id: z.string(), name: z.string(), sections: z.array(cvSectionSchema),
  created_at: z.iso.datetime(), updated_at: z.iso.datetime(),
  quality_model_runs: z.number().int().nonnegative(), tailoring_model_runs: z.number().int().nonnegative(),
  quality_model_run_limit: z.literal(10), tailoring_model_run_limit: z.literal(10),
  variants: z.array(cvVariantSchema),
})
export const cvDocumentListSchema = z.object({ items: z.array(cvDocumentSchema) })
export const cvDocumentsExportSchema = z.object({
  schema_version: z.literal('cv-documents-export/v1'), exported_at: z.iso.datetime(),
  document_count: z.number().int().nonnegative(), documents: z.array(cvDocumentSchema),
}).refine((value) => value.document_count === value.documents.length)
export const careerDataExportSchema = z.strictObject({
  schema_version: z.literal('career-data-export/v1'),
  exported_at: z.iso.datetime(),
  item_count: z.number().int().nonnegative(), items: z.array(evidenceItemSchema),
  cv_documents: cvDocumentsExportSchema,
  personalization: discoveryPersonalizationExportSchema,
  campaigns: z.strictObject({
    campaign_count: z.number().int().nonnegative(),
    campaigns: z.array(z.object({
      id: z.string(), label: z.string().nullable(), is_pinned: z.boolean(),
      company: z.string().nullable(), role: z.string().nullable(),
      status: campaignStatusSchema.nullable(),
      deadline: z.iso.datetime({ offset: true }).nullable(), reminders_enabled: z.boolean().default(false), created_at: z.iso.datetime(), updated_at: z.iso.datetime(),
      listing: campaignListingSchema.nullable().default(null),
      listing_revisions: z.array(campaignListingSchema).default([]),
      events: z.array(z.object({
        id: z.string(), event_type: z.enum(['status_changed', 'deadline_changed', 'listing_attached', 'listing_adopted', 'material_selection_changed', 'task_created', 'task_completed', 'task_reopened', 'task_deleted', 'note_added', 'note_deleted', 'contact_added', 'contact_deleted', 'submission_snapshot_created']),
        details: z.record(z.string(), z.unknown()), created_at: z.iso.datetime(),
      })),
      tasks: z.array(z.object({ id: z.string(), title: z.string(), deadline: z.iso.datetime({ offset: true }).nullable(), completed: z.boolean(), created_at: z.iso.datetime() })).default([]),
      notes: z.array(z.object({ id: z.string(), text: z.string(), created_at: z.iso.datetime() })).default([]),
      contacts: z.array(z.object({ id: z.string(), name: z.string(), role: z.string().nullable(), channel: z.string().nullable(), created_at: z.iso.datetime() })).default([]),
      submission_snapshots: z.array(z.object({ id: z.string(), content: z.record(z.string(), z.unknown()), content_sha256: z.string(), created_at: z.iso.datetime() })).default([]),
      selected_cv_variant_id: z.string().nullable().default(null),
      selected_cover_letter_run_id: z.string().nullable().default(null),
      selected_interview_run_id: z.string().nullable().default(null),
      selected_cover_letter: z.object({ id: z.string(), tool_name: z.literal('cover-letter'), label: z.string().nullable(), parent_run_id: z.string().nullable(), result_payload: z.record(z.string(), z.unknown()), created_at: z.iso.datetime() }).nullable().default(null),
      selected_interview: z.object({ id: z.string(), tool_name: z.literal('interview'), label: z.string().nullable(), parent_run_id: z.string().nullable(), result_payload: z.record(z.string(), z.unknown()), created_at: z.iso.datetime() }).nullable().default(null),
    })),
  }).refine((value) => value.campaign_count === value.campaigns.length),
}).refine((value) => value.item_count === value.items.length)
export type CvEntry = z.infer<typeof cvEntrySchema>
export type CvSection = z.infer<typeof cvSectionSchema>
export type CvDocument = z.infer<typeof cvDocumentSchema>
export type CvVariant = z.infer<typeof cvVariantSchema>
export type CvDocumentUpdate = z.infer<typeof cvDocumentUpdateSchema>

export const cvTailoringChangeSchema = z.strictObject({
  id: z.string().min(1).max(100), section_id: z.string().min(1).max(100), entry_id: z.string().min(1).max(100),
  before: z.string().min(1).max(5_000), after: z.string().min(1).max(5_000), job_requirement: z.string().min(1).max(1_000),
  evidence_item_ids: z.array(z.string()).max(20), support: z.enum(['confirmed', 'document', 'unsupported']),
})
export const cvTailoringProposalSchema = z.object({
  schema_version: z.literal('cv-tailoring/v1'), job_title: z.string(), changes: z.array(cvTailoringChangeSchema).max(50),
  remaining_regenerations: z.number().int().nonnegative(), request_id: z.string().uuid(), proposal_token: z.string().length(64), history_id: z.string().nullable(), access_mode: z.literal('authenticated'),
  saved: z.boolean(), locked_actions: z.array(z.string()),
})
export const cvTailoringApplySchema = z.strictObject({
  request_id: z.string().uuid(), variant_name: z.string().min(1).max(120), job_title: z.string().min(1).max(200), proposal_token: z.string().length(64),
  changes: z.array(cvTailoringChangeSchema).max(50), decisions: z.array(z.strictObject({
    change_id: z.string(), action: z.enum(['accept', 'reject', 'edit']), edited_after: z.string().min(1).max(5_000).optional(),
  })).max(50),
})
export type CvTailoringProposal = z.infer<typeof cvTailoringProposalSchema>
export type CvTailoringChange = z.infer<typeof cvTailoringChangeSchema>

export const cvAtsCheckKeySchema = z.enum([
  'section_structure', 'text_layer', 'links', 'page_breaks', 're_importability',
])
export const cvQualityRequestSchema = z.strictObject({
  use_model: z.boolean().default(false),
  checks: z.array(cvAtsCheckKeySchema).min(1).max(5).optional(),
  artifact_template: z.enum(['ats-essential', 'professional-editorial', 'technical-portfolio']).optional(),
  artifact_format: z.enum(['docx', 'pdf']).optional(),
}).refine((value) => Boolean(value.artifact_template) === Boolean(value.artifact_format), {
  message: 'artifact_template and artifact_format must be supplied together',
})
export const cvTemplateIdSchema = z.enum(['ats-essential', 'professional-editorial', 'technical-portfolio'])
export const cvRenderModelSchema = z.object({
  schema_version: z.literal('cv-render/v1'), document_id: z.string(), document_name: z.string(), template_id: cvTemplateIdSchema,
  page: z.object({ width_mm: z.number().int(), height_mm: z.number().int(), margin_mm: z.number().int() }),
  tokens: z.record(z.string(), z.union([z.string(), z.number()])),
  sections: z.array(z.object({ id: z.string(), kind: cvSectionKindSchema, title: z.string(), entries: z.array(z.object({ id: z.string(), text: z.string(), links: z.array(z.string()) })) })),
  canonical_hash: z.string().regex(/^[0-9a-f]{64}$/),
})
export type CvTemplateId = z.infer<typeof cvTemplateIdSchema>
export type CvRenderModel = z.infer<typeof cvRenderModelSchema>
export const cvQualityResponseSchema = z.object({
  schema_version: z.literal('cv-quality/v1'),
  dimensions: z.array(z.object({
    key: z.enum(['impact', 'clarity', 'completeness', 'structure']),
    label: z.string(), score: z.number().min(0).max(100),
    reasons: z.array(z.string()).min(1).max(4), remediation: z.string(),
  })),
  ats_checks: z.array(z.object({
    key: cvAtsCheckKeySchema, label: z.string(), status: z.enum(['pass', 'fail', 'review', 'not_run']),
    explanation: z.string(), remediation: z.string(),
  })),
  scoring_mode: z.enum(['heuristic', 'blended']), advisory_note: z.string(),
  remaining_model_runs: z.number().int().nonnegative(),
  history_id: z.string().nullable().optional(), access_mode: z.literal('authenticated'),
  saved: z.boolean(), locked_actions: z.array(z.string()),
})
export type CvAtsCheckKey = z.infer<typeof cvAtsCheckKeySchema>
export type CvQualityResponse = z.infer<typeof cvQualityResponseSchema>

export const cvImportClaimSchema = z.strictObject({
  kind: evidenceKindSchema,
  content: z.record(z.string(), z.string()).refine((value) => Object.keys(value).length > 0),
  provenance: z.literal('imported'),
})
export const cvImportEntrySchema = z.strictObject({
  id: z.string().min(1).max(100), body: z.string().min(1).max(5_000),
  position: z.number().int().nonnegative(), claim: cvImportClaimSchema.nullable(),
})
export const cvImportSectionSchema = z.strictObject({
  id: z.string().min(1).max(100), kind: cvSectionKindSchema,
  title: z.string().min(1).max(120), visible: z.boolean().default(true),
  position: z.number().int().nonnegative(), entries: z.array(cvImportEntrySchema).max(200),
})
export const cvImportProposalSchema = z.strictObject({
  filename: z.string().min(1).max(255), import_id: z.uuid(),
  name: z.string().min(1).max(120),
  sections: z.array(cvImportSectionSchema).max(50), warnings: z.array(z.string()).max(20),
})
export const cvImportAcceptSchema = cvImportProposalSchema
export type CvImportProposal = z.infer<typeof cvImportProposalSchema>

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  full_name: z.string().nullable().optional(),
  is_active: z.boolean(),
  is_admin: z.boolean().optional(),
  created_at: z.string().optional(),
})

export const tokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  token_type: z.string().default('bearer'),
})

// The backend returns an array of provider name strings (e.g. ["google"]);
// only enabled providers are included. The display shape (label, enabled flag)
// is derived in the session layer.
export const authProvidersSchema = z.object({
  providers: z.array(z.string()).default([]),
})

export type OAuthProvider = {
  provider: string
  enabled: boolean
  label: string
}

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
  job_title: z.string().nullable().optional(),
  company_name: z.string().nullable().optional(),
  job_description: z.string(),
  source_url: z.string().url().nullable().optional(),
  retrieved_at: z.iso.datetime({ offset: true }).nullable().optional(),
})
export const importJobUrlSchema = z.strictObject({
  url: z.string().url().max(2_048).refine((value) => {
    const protocol = new URL(value).protocol
    return protocol === 'http:' || protocol === 'https:'
  }, 'URL must use HTTP or HTTPS'),
  campaign_id: z.string().optional(),
})
export const importJobTextSchema = z.strictObject({
  campaign_id: z.string(),
  job_title: z.string().min(1).max(200),
  company_name: z.string().min(1).max(200),
  job_description: z.string().min(20).max(20_000),
})

export const toolRunSummarySchema = z.object({
  id: z.string(),
  tool_name: z.string(),
  label: z.string().nullable().optional(),
  is_favorite: z.boolean(),
  created_at: z.string(),
  saved: z.boolean().default(true),
  access_mode: z.enum(['authenticated', 'guest_demo']).default('authenticated'),
  locked_actions: z.array(z.string()).default([]),
  metadata: z
    .object({
      summary_headline: z.string().nullable().optional(),
      primary_recommendation_title: z.string().nullable().optional(),
      schema_version: z.string().nullable().optional(),
      linked_context_ids: z.array(z.string()).default([]),
      next_step_tool: z.string().nullable().optional(),
    })
    .default({
      summary_headline: null,
      primary_recommendation_title: null,
      schema_version: null,
      linked_context_ids: [],
      next_step_tool: null,
    }),
  workspace: z
    .object({
      id: z.string(),
      label: z.string().nullable().optional(),
      is_pinned: z.boolean().default(false),
      company: z.string().nullable().default(null),
      role: z.string().nullable().default(null),
      status: campaignStatusSchema.nullable().default(null),
      deadline: z.iso.datetime({ offset: true }).nullable().default(null),
      listing: campaignListingSchema.nullable().default(null),
      linked_run_ids: z.array(z.string()).default([]),
      last_active_tool: z.string().nullable().optional(),
      last_active_result_id: z.string().nullable().optional(),
      updated_at: z.string(),
    })
    .nullable()
    .optional(),
})

export const toolRunDetailSchema = toolRunSummarySchema.extend({
  parent_run_id: z.string().nullable().optional(),
  result_payload: z.record(z.string(), z.unknown()).default({}),
})

export const toolRunListSchema = z.object({
  items: z.array(toolRunSummarySchema),
  total: z.number(),
  page: z.number(),
  page_size: z.number(),
  has_more: z.boolean(),
})

export const workspaceSummarySchema = z.object({
  id: z.string(),
  label: z.string().nullable().optional(),
  is_pinned: z.boolean().default(false),
  company: z.string().nullable().default(null),
  role: z.string().nullable().default(null),
  status: campaignStatusSchema.nullable().default(null),
  deadline: z.iso.datetime({ offset: true }).nullable().default(null),
  listing: campaignListingSchema.nullable().default(null),
  linked_run_ids: z.array(z.string()).default([]),
  last_active_tool: z.string().nullable().optional(),
  last_active_result_id: z.string().nullable().optional(),
  updated_at: z.string(),
})

export const workspaceUpdateSchema = z.strictObject({
  label: z.string().max(200).nullable().optional(),
  is_pinned: z.boolean().optional(),
  company: z.string().max(200).nullable().optional(),
  role: z.string().max(200).nullable().optional(),
  status: campaignStatusSchema.nullable().optional(),
  deadline: z.iso.datetime({ offset: true }).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0)

export const workspaceListSchema = z.object({
  items: z.array(workspaceSummarySchema),
  total: z.number(),
})

export const campaignCvVariantReferenceSchema = z.object({
  id: z.string(), document_id: z.string(), document_name: z.string(), name: z.string(),
  target_role: z.string().nullable().default(null), created_at: z.iso.datetime(),
})
export const campaignRunReferenceSchema = z.object({
  id: z.string(), label: z.string().nullable().default(null),
  parent_run_id: z.string().nullable().default(null), created_at: z.iso.datetime(),
})
export const campaignEventSchema = z.object({ id: z.string(), event_type: z.string(), details: z.record(z.string(), z.unknown()), provenance: z.enum(['user', 'system']), created_at: z.iso.datetime() })
export const campaignTaskSchema = z.object({ id: z.string(), title: z.string(), deadline: z.iso.datetime({ offset: true }).nullable(), completed: z.boolean(), created_at: z.iso.datetime() })
export const campaignNoteSchema = z.object({ id: z.string(), text: z.string(), created_at: z.iso.datetime() })
export const campaignContactSchema = z.object({ id: z.string(), name: z.string(), role: z.string().nullable(), channel: z.string().nullable(), created_at: z.iso.datetime() })
export const campaignReminderResponseSchema = z.object({
  enabled: z.boolean(),
  items: z.array(z.object({ kind: z.enum(['campaign_deadline', 'task_deadline']), task_id: z.string().nullable(), label: z.string(), deadline: z.iso.datetime({ offset: true }) })),
  next_surface_at: z.iso.datetime({ offset: true }).nullable(),
})
export const campaignSubmissionSnapshotSchema = z.object({ id: z.string(), content: z.record(z.string(), z.unknown()), content_sha256: z.string().length(64), created_at: z.iso.datetime() })
export const campaignDetailSchema = workspaceSummarySchema.extend({
  selected_materials: z.object({
    cv_variant: campaignCvVariantReferenceSchema.nullable(),
    cover_letter: campaignRunReferenceSchema.nullable(),
    interview: campaignRunReferenceSchema.nullable(),
  }),
  available_materials: z.object({
    cv_variants: z.array(campaignCvVariantReferenceSchema),
    cover_letters: z.array(campaignRunReferenceSchema),
    interviews: z.array(campaignRunReferenceSchema),
  }),
  events: z.array(campaignEventSchema), tasks: z.array(campaignTaskSchema),
  notes: z.array(campaignNoteSchema), contacts: z.array(campaignContactSchema),
  submission_snapshots: z.array(campaignSubmissionSnapshotSchema),
})
export const campaignMaterialSelectionSchema = z.strictObject({
  cv_variant_id: z.string().nullable().optional(),
  cover_letter_run_id: z.string().nullable().optional(),
  interview_run_id: z.string().nullable().optional(),
}).refine((value) => Object.keys(value).length > 0)

export const deletedResponseSchema = z.object({
  deleted: z.number(),
})

export const genericObjectSchema = z.record(z.string(), z.unknown())

export const resultSummarySchema = z.object({
  headline: z.string(),
  verdict: z.string(),
  confidence_note: z.string(),
})

export const topActionSchema = z.object({
  title: z.string(),
  action: z.string(),
  priority: z.enum(['high', 'medium', 'low']),
})

export const riskLevelSchema = z.enum(['low', 'medium', 'high'])
export const urgencySchema = z.enum(['high', 'medium', 'low'])
export const complexitySchema = z.enum(['foundational', 'intermediate', 'advanced'])

export const sharedResultEnvelopeSchema = z.object({
  history_id: z.string().nullable().optional(),
  schema_version: z.string(),
  summary: resultSummarySchema,
  top_actions: z.array(topActionSchema),
  generated_at: z.string(),
  download_title: z.string(),
  exportable_sections: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        body: z.string().nullable().optional(),
        items: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  editable_blocks: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        content: z.string(),
        placeholder: z.string().nullable().optional(),
      }),
    )
    .default([]),
  access_mode: z.enum(['authenticated', 'guest_demo']).default('authenticated'),
  saved: z.boolean().default(true),
  locked_actions: z.array(z.enum(['save', 'favorite', 'continue', 'history'])).default([]),
})

export const campaignReviewFindingSchema = z.object({
  id: z.string(), category: z.enum(['unsupported_claim', 'missed_requirement', 'contradiction', 'generic_language', 'repetition', 'document_defect']),
  severity: z.enum(['high', 'medium', 'low']), message: z.string(), locations: z.array(z.string()), trace: z.array(z.string()),
})
export const campaignReviewResponseSchema = sharedResultEnvelopeSchema.extend({ findings: z.array(campaignReviewFindingSchema) })

export const resumeResultSchema = sharedResultEnvelopeSchema
  .extend({
    overall_score: z.number(),
    score_breakdown: z.array(
      z.object({
        key: z.enum(['keywords', 'impact', 'structure', 'clarity', 'completeness']),
        label: z.string(),
        score: z.number(),
      }),
    ),
    strengths: z.array(z.string()),
    issues: z.array(
      z.object({
        id: z.string(),
        severity: z.enum(['high', 'medium', 'low']),
        category: z.enum(['keywords', 'impact', 'structure', 'clarity', 'completeness']),
        title: z.string(),
        why_it_matters: z.string(),
        evidence: z.string(),
        fix: z.string(),
      }),
    ),
    evidence: z.object({
      detected_sections: z.array(z.string()),
      detected_skills: z.array(z.string()),
      matched_keywords: z.array(z.string()),
      missing_keywords: z.array(z.string()),
      quantified_bullets: z.number(),
    }),
    role_fit: z
      .object({
        target_role_label: z.string(),
        fit_score: z.number(),
        rationale: z.string(),
      })
      .nullable()
      .optional(),
  })
  .passthrough()

export const jobMatchResultSchema = sharedResultEnvelopeSchema
  .extend({
    match_score: z.number(),
    verdict: z.enum(['strong', 'borderline', 'stretch']),
    requirements: z.array(
      z.object({
        requirement: z.string(),
        importance: z.enum(['must', 'preferred']),
        status: z.enum(['matched', 'partial', 'missing']),
        resume_evidence: z.string(),
        suggested_fix: z.string(),
      }),
    ),
    matched_keywords: z.array(z.string()),
    missing_keywords: z.array(
      z.object({
        keyword: z.string(),
        contextual_guidance: z.string().default(''),
        anti_stuffing_note: z.string().default(''),
      }),
    ),
    tailoring_actions: z.array(
      z.object({
        section: z.enum(['summary', 'experience', 'skills', 'projects']),
        keyword: z.string(),
        action: z.string(),
      }),
    ),
    interview_focus: z.array(z.string()),
    recruiter_summary: z.string(),
  })
  .passthrough()

export const coverLetterResultSchema = sharedResultEnvelopeSchema
  .extend({
    opening: z.object({
      text: z.string(),
      why_this_paragraph: z.string(),
      requirements_used: z.array(z.string()),
      evidence_used: z.array(z.string()).default([]),
    }),
    body_points: z.array(
      z.object({
        text: z.string(),
        why_this_paragraph: z.string(),
        requirements_used: z.array(z.string()),
        evidence_used: z.array(z.string()).default([]),
      }),
    ),
    closing: z.object({
      text: z.string(),
      why_this_paragraph: z.string(),
      requirements_used: z.array(z.string()),
      evidence_used: z.array(z.string()).default([]),
    }),
    full_text: z.string(),
    tone_used: z.string(),
    customization_notes: z.array(
      z.object({
        category: z.enum(['tone', 'evidence', 'keyword', 'gap']),
        note: z.string(),
        requirements_used: z.array(z.string()).default([]),
        source: z.enum(['resume', 'resume-analysis', 'job-match', 'job-description']),
      }),
    ),
  })
  .passthrough()

export const interviewResultSchema = sharedResultEnvelopeSchema
  .extend({
    questions: z.array(
      z.object({
        question: z.string(),
        answer: z.string(),
        key_points: z.array(z.string()),
        answer_structure: z.array(z.string()),
        follow_up_questions: z.array(z.string()),
        focus_area: z.string(),
        why_asked: z.string(),
        practice_first: z.boolean().default(false),
      }),
    ),
    focus_areas: z.array(
      z.object({
        title: z.string(),
        reason: z.string(),
        requirements_used: z.array(z.string()),
        practice_first: z.boolean().default(false),
      }),
    ),
    weak_signals_to_prepare: z.array(
      z.object({
        title: z.string(),
        severity: z.enum(['high', 'medium', 'low']),
        why_it_matters: z.string(),
        prep_action: z.string(),
        related_requirements: z.array(z.string()),
      }),
    ),
    interviewer_notes: z.array(z.string()),
  })
  .passthrough()

export const careerResultSchema = sharedResultEnvelopeSchema
  .extend({
    recommended_direction: z.object({
      role_title: z.string(),
      fit_score: z.number(),
      transition_timeline: z.string(),
      why_now: z.string(),
      confidence: z.enum(['high', 'medium', 'low']),
    }),
    paths: z.array(
      z.object({
        role_title: z.string(),
        fit_score: z.number(),
        transition_timeline: z.string(),
        rationale: z.string(),
        strengths_to_leverage: z.array(z.string()),
        gaps_to_close: z.array(z.string()),
        risk_level: riskLevelSchema,
      }),
    ),
    current_skills: z.array(z.string()),
    target_skills: z.array(z.string()),
    skill_gaps: z.array(
      z.object({
        skill: z.string(),
        urgency: urgencySchema,
        why_it_matters: z.string(),
        how_to_build: z.string(),
      }),
    ),
    next_steps: z.array(
      z.object({
        timeframe: z.string(),
        action: z.string(),
      }),
    ),
  })
  .passthrough()

export const portfolioResultSchema = sharedResultEnvelopeSchema
  .extend({
    target_role: z.string(),
    portfolio_strategy: z.object({
      headline: z.string(),
      focus: z.string(),
      proof_goal: z.string(),
    }),
    projects: z.array(
      z.object({
        project_title: z.string(),
        description: z.string(),
        skills: z.array(z.string()),
        complexity: complexitySchema,
        why_this_project: z.string(),
        deliverables: z.array(z.string()),
        hiring_signals: z.array(z.string()),
        estimated_timeline: z.string(),
      }),
    ),
    recommended_start_project: z.string(),
    sequence_plan: z.array(
      z.object({
        order: z.number(),
        project_title: z.string(),
        reason: z.string(),
      }),
    ),
    presentation_tips: z.array(z.string()),
  })
  .passthrough()

export type User = z.infer<typeof userSchema>
export type Token = z.infer<typeof tokenSchema>
export type HealthCheck = z.infer<typeof healthCheckSchema>
export type ParsedCvResult = z.infer<typeof parsedCvSchema>
export type ImportedJobPost = z.infer<typeof importedJobSchema>
export type ToolRunSummary = z.infer<typeof toolRunSummarySchema>
export type ToolRunDetail = z.infer<typeof toolRunDetailSchema>
export type ToolRunList = z.infer<typeof toolRunListSchema>
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>
export type WorkspaceList = z.infer<typeof workspaceListSchema>
export type WorkspaceUpdate = z.input<typeof workspaceUpdateSchema>
export type CampaignDetail = z.infer<typeof campaignDetailSchema>
export type CampaignMaterialSelection = z.input<typeof campaignMaterialSelectionSchema>
export type CampaignTask = z.infer<typeof campaignTaskSchema>
export type ResumeResult = z.infer<typeof resumeResultSchema>
export type JobMatchResult = z.infer<typeof jobMatchResultSchema>
export type CoverLetterResult = z.infer<typeof coverLetterResultSchema>
export type InterviewResult = z.infer<typeof interviewResultSchema>

export const interviewPracticeFeedbackSchema = z.object({
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  suggestions: z.array(z.string()).default([]),
  overall_feedback: z.string().default(''),
  is_empty_answer: z.boolean().default(false),
})

export type InterviewPracticeFeedback = z.infer<typeof interviewPracticeFeedbackSchema>
export type CareerResult = z.infer<typeof careerResultSchema>
export type PortfolioResult = z.infer<typeof portfolioResultSchema>
