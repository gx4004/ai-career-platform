import { z } from 'zod'
import { PASSWORD_COPY } from '#/lib/api/errors'
import {
  developmentItemSchema,
  developmentResponseKindSchema,
} from '#/lib/api/developmentSchemas'
import { gapClassificationSchema, gapKindSchema } from '#/lib/api/gapClassificationSchemas'

// ── Applications (mirrors backend/app/schemas/applications.py) ──
// Timestamps may carry the database session's UTC offset (e.g. +02:00), not only Z.
const offsetDateTime = z.iso.datetime({ offset: true })

export const applicationStatusSchema = z.enum([
  'saved', 'applied', 'no_reply', 'interviewing', 'offer', 'rejected', 'withdrawn',
])
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>
export const applicationListingSchema = z.strictObject({
  title: z.string(), company: z.string(), description: z.string(),
  source_url: z.string().url().nullable(),
  apply_url: z.string().url().nullable().default(null),
  retrieved_at: offsetDateTime,
})
export const applicationTaskSchema = z.object({
  id: z.string(), title: z.string(), deadline: offsetDateTime.nullable(),
  completed: z.boolean(), created_at: offsetDateTime,
})
// One event shape for the page's activity list and the data export (which omits provenance).
export const applicationEventSchema = z.object({
  id: z.string(), event_type: z.string(), details: z.record(z.string(), z.unknown()),
  provenance: z.enum(['user', 'system']).default('user'), created_at: offsetDateTime,
})
export const applicationSnapshotSchema = z.object({
  id: z.string(), content: z.record(z.string(), z.unknown()),
  content_sha256: z.string().length(64), created_at: offsetDateTime,
})
export const applicationCardSchema = z.object({
  id: z.string(),
  label: z.string().nullable().default(null),
  title: z.string().nullable().default(null),
  company: z.string().nullable().default(null),
  status: applicationStatusSchema,
  deadline: offsetDateTime.nullable().default(null),
  applied_at: offsetDateTime.nullable().default(null),
  status_changed_at: offsetDateTime.nullable().default(null),
  no_reply_suggested: z.boolean().default(false),
  match_score: z.number().int().nullable().default(null),
  prepared: z.boolean().default(false),
  ready: z.boolean().default(false),
  open_question_count: z.number().int().nonnegative().default(0),
  next_task: z.object({ title: z.string(), deadline: offsetDateTime.nullable() }).nullable().default(null),
  last_activity_at: offsetDateTime.nullable().default(null),
  is_pinned: z.boolean().default(false),
  updated_at: offsetDateTime,
})
export const applicationListSchema = z.object({
  items: z.array(applicationCardSchema),
  total: z.number(),
})
// "What's working" (#416): reply rate by segment, each with its sample size.
export const insightSegmentSchema = z.object({
  label: z.string(),
  applied: z.number().int().nonnegative(),
  replied: z.number().int().nonnegative(),
  reply_rate: z.number().int().min(0).max(100).nullable().default(null),
  enough_data: z.boolean(),
})
export const insightsDimensionSchema = z.object({
  key: z.enum(['source', 'company', 'role_family', 'work_mode', 'skills_fit']),
  title: z.string(),
  segments: z.array(insightSegmentSchema),
  hidden_count: z.number().int().nonnegative().default(0),
})
export const whatsWorkingSchema = z.object({
  overall: z.object({
    applied: z.number().int().nonnegative(),
    replied: z.number().int().nonnegative(),
    reply_rate: z.number().int().min(0).max(100).nullable().default(null),
  }),
  min_segment_size: z.number().int().positive(),
  dimensions: z.array(insightsDimensionSchema),
})
export type WhatsWorking = z.infer<typeof whatsWorkingSchema>
export type InsightsDimension = z.infer<typeof insightsDimensionSchema>
export type InsightSegment = z.infer<typeof insightSegmentSchema>
const cvVariantReferenceSchema = z.object({
  id: z.string(), document_id: z.string(), document_name: z.string(), name: z.string(),
  target_role: z.string().nullable().default(null), created_at: offsetDateTime,
})
const runReferenceSchema = z.object({
  id: z.string(), label: z.string().nullable().default(null),
  parent_run_id: z.string().nullable().default(null), created_at: offsetDateTime,
})
export const applicationEventPageSchema = z.object({
  items: z.array(applicationEventSchema),
  total: z.number().int().nonnegative(),
})
export const applicationDetailSchema = applicationCardSchema.extend({
  role: z.string().nullable().default(null),
  created_at: offsetDateTime.nullable().default(null),
  listing: applicationListingSchema.nullable().default(null),
  notes: z.string().nullable().default(null),
  selected_materials: z.object({
    cv_variant: cvVariantReferenceSchema.nullable(),
    cover_letter: runReferenceSchema.nullable(),
    interview: runReferenceSchema.nullable(),
  }),
  available_materials: z.object({
    cv_variants: z.array(cvVariantReferenceSchema),
    cover_letters: z.array(runReferenceSchema),
    interviews: z.array(runReferenceSchema),
  }),
  drafts: z.object({
    run_id: z.string(),
    created_at: offsetDateTime,
    cover_letter: z.object({
      body: z.string(),
      support: z.enum(['confirmed', 'document', 'unsupported']),
      evidence_item_ids: z.array(z.string()).default([]),
    }).nullable().default(null),
    screening_answers: z.array(z.object({
      question: z.string(),
      answer: z.string(),
      support: z.enum(['confirmed', 'document']),
      evidence_item_ids: z.array(z.string()).default([]),
    })).default([]),
  }).nullable().default(null),
  open_questions: z.array(z.object({
    key: z.string(), question: z.string(), category: z.string(), answered: z.boolean().default(false),
  })).default([]),
  answers: z.record(z.string(), z.string()).default({}),
  tasks: z.array(applicationTaskSchema).default([]),
  events: z.array(applicationEventSchema).default([]),
  events_total: z.number().int().nonnegative().default(0),
  snapshot: applicationSnapshotSchema.nullable().default(null),
  autofill_supported: z.boolean().default(false),
})
// POST /applications: track a job by hand, or from a Job Match (history_id).
export const applicationCreateSchema = z.strictObject({
  role: z.string().trim().min(1).max(200),
  company: z.string().trim().min(1).max(200),
  description: z.string().trim().min(20).max(20_000).nullable().optional(),
  source_url: z
    .string()
    .max(2048)
    .refine((v) => v.trim() === '' || /^https?:\/\/\S+$/i.test(v.trim()), 'Enter an http(s) address')
    .nullable()
    .optional(),
  deadline: offsetDateTime.nullable().optional(),
  history_id: z.string().max(64).nullable().optional(),
})
export const applicationUpdateSchema = z.strictObject({
  label: z.string().max(200).nullable().optional(),
  company: z.string().max(200).nullable().optional(),
  role: z.string().max(200).nullable().optional(),
  status: applicationStatusSchema.optional(),
  deadline: offsetDateTime.nullable().optional(),
  notes: z.string().max(20_000).nullable().optional(),
  cv_variant_id: z.string().nullable().optional(),
  cover_letter_run_id: z.string().nullable().optional(),
  interview_run_id: z.string().nullable().optional(),
}).refine((value) => Object.keys(value).length > 0)
export const applicationPreferencesSchema = z.object({
  keywords: z.array(z.string()).default([]),
  locations: z.array(z.string()).default([]),
  remote: z.boolean().default(false),
  max_per_run: z.number().int().min(1),
  max_per_run_limit: z.number().int().min(1).default(10),
  is_default: z.boolean().default(false),
})
export const applicationPreferencesUpdateSchema = z.strictObject({
  keywords: z.array(z.string().max(100)).max(20),
  locations: z.array(z.string().max(100)).max(20),
  remote: z.boolean(),
  max_per_run: z.number().int().min(1).max(10),
})
const applicationDetailsFields = {
  full_name: z.string().max(200),
  email: z.string().max(320),
  phone: z.string().max(50),
  linkedin: z.string().max(500),
  website: z.string().max(500),
  location: z.string().max(200),
  work_authorization: z.string().max(1000),
  visa_sponsorship: z.string().max(1000),
  notice_period: z.string().max(1000),
  salary_expectation: z.string().max(1000),
  relocation: z.string().max(1000),
}
/** The owner's contact details and standing answers for application forms (#374). */
export const applicationDetailsSchema = z.object({
  ...applicationDetailsFields,
  is_default: z.boolean().default(false),
})
// Mirrors the backend rules (schemas/applications.py): an email-shaped value, and
// links that are empty, a bare host (linkedin.com/in/me) or http(s) only.
const detailsEmail = z
  .string()
  .max(320)
  .refine((v) => v.trim() === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim()), 'Enter a valid email address')
// Mirrors _PHONE_SHAPE: digits with the usual separators and an optional extension,
// 5 to 20 digits in all.
const detailsPhone = z
  .string()
  .max(50)
  .refine((raw) => {
    const v = raw.trim()
    if (v === '') return true
    if (!/^\+?[\d\s().\-/]+(?:\s*(?:ext\.?|x)\s*\d{1,6})?$/i.test(v)) return false
    const digits = v.replace(/\D/g, '').length
    return digits >= 5 && digits <= 20
  }, 'Enter a valid phone number')
const detailsLink = z
  .string()
  .max(500)
  .refine((raw) => {
    const v = raw.trim()
    if (v === '') return true
    if (/[\s\u0000-\u001f]/.test(v)) return false
    if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) return true
    if (/^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:\/\S*)?$/i.test(v)) return true
    if (/^localhost(?::\d+)?(?:\/\S*)?$/i.test(v)) return true
    return /^https?:\/\/\S+$/i.test(v)
  }, 'Enter a web address starting with http(s):// or a plain domain')
export const applicationDetailsUpdateSchema = z.strictObject({
  ...applicationDetailsFields,
  email: detailsEmail,
  phone: detailsPhone,
  linkedin: detailsLink,
  website: detailsLink,
})
export const bulkPrepareResultSchema = z.object({
  reason: z.enum(['prepared', 'no_preferences', 'no_cv', 'no_evidence']),
  prepared: z.array(applicationCardSchema).default([]),
  matched_count: z.number().int().nonnegative().default(0),
  skipped_existing_count: z.number().int().nonnegative().default(0),
  max_per_run: z.number().int(),
})
export const autofillReportSchema = z.object({
  filled: z.array(z.string()),
  skipped: z.array(z.string()),
  mismatched: z.array(z.string()).default([]),
  url: z.string(),
})
export const autofillRunStatusSchema = z.object({
  state: z.enum(['idle', 'running', 'review', 'failed', 'closed']),
  kind: z.string().nullable().default(null),
  message: z.string().nullable().default(null),
  next_step: z.string().nullable().default(null),
  seconds_left: z.number().int().nullable().default(null),
  report: autofillReportSchema.nullable().default(null),
})
const runExportSchema = z.object({
  id: z.string(), tool_name: z.string(), label: z.string().nullable(),
  parent_run_id: z.string().nullable(), result_payload: z.record(z.string(), z.unknown()),
  created_at: offsetDateTime,
})
export const applicationsExportSchema = z.strictObject({
  application_count: z.number().int().nonnegative(),
  applications: z.array(z.object({
    id: z.string(), label: z.string().nullable(), is_pinned: z.boolean(),
    company: z.string().nullable(), role: z.string().nullable(),
    status: applicationStatusSchema.nullable(),
    deadline: offsetDateTime.nullable(), applied_at: offsetDateTime.nullable(),
    match_score: z.number().int().nullable(), notes: z.string().nullable(),
    open_questions: z.array(z.record(z.string(), z.unknown())).default([]),
    answers: z.record(z.string(), z.string()).default({}),
    created_at: offsetDateTime, updated_at: offsetDateTime,
    listing: applicationListingSchema.nullable().default(null),
    listing_revisions: z.array(applicationListingSchema).default([]),
    selected_cv_variant_id: z.string().nullable().default(null),
    selected_cover_letter: runExportSchema.nullable().default(null),
    selected_interview: runExportSchema.nullable().default(null),
    drafts: runExportSchema.nullable().default(null),
    tasks: z.array(applicationTaskSchema).default([]),
    snapshot: applicationSnapshotSchema.nullable().default(null),
    events: z.array(applicationEventSchema.omit({ provenance: true })).default([]),
  })),
  preferences: applicationPreferencesSchema.nullable().default(null),
  details: applicationDetailsSchema.nullable().default(null),
}).refine((value) => value.application_count === value.applications.length)

export const evidenceKindSchema = z.enum([
  'experience', 'achievement', 'skill', 'education', 'project',
  'certification', 'preference', 'interview-evidence',
])
export const evidenceProvenanceSchema = z.enum(['imported', 'inferred', 'user-entered'])
export const evidenceConfirmationStateSchema = z.enum(['unconfirmed', 'confirmed'])
export const evidenceItemCreateSchema = z.strictObject({
  kind: evidenceKindSchema,
  content: z.record(z.string(), z.unknown()).refine((value) => Object.keys(value).length > 0),
  provenance: evidenceProvenanceSchema,
})
// Updates are content-only: kind and provenance keep the item's recorded origin.
export const evidenceItemUpdateSchema = evidenceItemCreateSchema.pick({ content: true })
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

// Job search (#323). Mirrors DiscoveryListingPage in
// backend/app/schemas/discovery_recommendations.py.
const httpsUrlSchema = z.string().url().max(2_048).refine((value) => value.startsWith('https://'))
// The owner's own outcomes for similar applications (#417): x of n got a reply.
// A signal apart from skills_fit; null below the sample thresholds.
export const similarApplicationsSchema = z.strictObject({
  role_family: z.string(),
  fit_bucket: z.string(),
  applied: z.number().int().min(1),
  replied: z.number().int().nonnegative(),
})
export const discoveryListingSchema = z.strictObject({
  listing_id: z.string(),
  title: z.string(),
  company: z.string(),
  // A short excerpt; the full description comes from the detail endpoint.
  preview: z.string(),
  location: z.string().nullable().default(null),
  remote: z.boolean().nullable().default(null),
  posted_at: z.iso.datetime({ offset: true }).nullable().default(null),
  apply_url: httpsUrlSchema.nullable().default(null),
  department: z.string().nullable().default(null),
  // Two separate signals, never blended (#414). skills_fit is null without
  // confirmed evidence; preference_hits are confirmed preference keywords the
  // listing mentions.
  // Also null when the listing names no skills (matched and missing are then
  // empty): nothing to compare, which is not a 0% fit.
  skills_fit: z.number().int().min(0).max(100).nullable(),
  // How many listing keywords the fit rests on: low is under four, high six+.
  fit_confidence: z.enum(['low', 'medium', 'high']).nullable().default(null),
  matched_skills: z.array(z.string()),
  missing_skills: z.array(z.string()),
  preference_hits: z.array(z.string()),
  similar_applications: similarApplicationsSchema.nullable().default(null),
  // The owner's application for this listing when they already added it.
  application_id: z.string().nullable().default(null),
  source_name: z.string(),
  source_url: httpsUrlSchema,
})
export const discoveryListingPageSchema = z.strictObject({
  items: z.array(discoveryListingSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  sort: z.enum(['best_match', 'newest']),
  has_evidence: z.boolean(),
  // Company filter options; page 1 only.
  companies: z.array(z.string()).nullable().default(null),
})
// The Job Match run linked to a listing (its own LLM score, shown apart from
// the feed's skills fit).
export const discoveryDeepMatchSchema = z.strictObject({
  history_id: z.string(),
  match_score: z.number().int().min(0).max(100),
  verdict: z.string().nullable().default(null),
  created_at: z.iso.datetime({ offset: true }),
})
export const discoveryListingDetailSchema = discoveryListingSchema.extend({
  description: z.string(),
  deep_match: discoveryDeepMatchSchema.nullable().default(null),
})
// Dashboard "today" plan (#418). Mirrors TodayPlan in backend/app/schemas/today.py.
export const todayActionItemSchema = z.strictObject({
  application_id: z.string(),
  title: z.string(),
  company: z.string().nullable().default(null),
  status: applicationStatusSchema,
  reason: z.enum(['interview', 'deadline', 'no_reply']),
  deadline: offsetDateTime.nullable().default(null),
  applied_at: offsetDateTime.nullable().default(null),
  days_since_applied: z.number().int().nonnegative().nullable().default(null),
})
export const todayPlanSchema = z.strictObject({
  has_sources: z.boolean(),
  has_evidence: z.boolean(),
  // Only listings at or above best_match_min_fit; closest_matches is filled only when none clear it.
  best_matches: z.array(discoveryListingSchema),
  closest_matches: z.array(discoveryListingSchema).default([]),
  best_match_min_fit: z.number().int().min(0).max(100).optional(),
  needs_action: z.array(todayActionItemSchema),
  needs_action_total: z.number().int().nonnegative(),
})
export type TodayActionItem = z.infer<typeof todayActionItemSchema>
export type TodayPlan = z.infer<typeof todayPlanSchema>
export type DiscoveryDeepMatch = z.infer<typeof discoveryDeepMatchSchema>
export type DiscoveryListing = z.infer<typeof discoveryListingSchema>
export type DiscoveryListingPage = z.infer<typeof discoveryListingPageSchema>
export type DiscoveryListingDetail = z.infer<typeof discoveryListingDetailSchema>

// R14 #175 discovery dismissals. Mirrors
// backend/app/schemas/discovery_personalization.py.
export const discoveryDismissalSchema = z.strictObject({
  listing_id: z.string(),
  created_at: z.iso.datetime({ offset: true }),
})
export const discoveryPersonalizationExportSchema = z.strictObject({
  dismissals: z.array(discoveryDismissalSchema),
})
export type DiscoveryDismissal = z.infer<typeof discoveryDismissalSchema>

// GET /discovery/dismissals: the hidden jobs, newest hidden first, each
// restorable with DELETE /discovery/dismissals/{listing_id}. Mirrors
// HiddenListingPage in backend/app/schemas/discovery_recommendations.py.
export const hiddenListingSchema = z.strictObject({
  listing_id: z.string(),
  title: z.string(),
  company: z.string(),
  location: z.string().nullable().default(null),
  remote: z.boolean().nullable().default(null),
  posted_at: z.iso.datetime({ offset: true }).nullable().default(null),
  hidden_at: z.iso.datetime({ offset: true }),
})
export const hiddenListingPageSchema = z.strictObject({
  items: z.array(hiddenListingSchema),
  total: z.number().int().nonnegative(),
})
export type HiddenListing = z.infer<typeof hiddenListingSchema>
export type HiddenListingPage = z.infer<typeof hiddenListingPageSchema>

// R11 resume import (#146): extracted facts are stored as `imported`,
// `unconfirmed` suggestions and reviewed on the profile (D-062).
export const evidenceImportRequestSchema = z.strictObject({
  resume_text: z.string().min(50).max(50_000),
})
export const evidenceItemIdsSchema = z.strictObject({
  ids: z.array(z.string()).min(1).max(1000),
})
export type EvidenceItem = z.infer<typeof evidenceItemSchema>
export type EvidenceKind = z.infer<typeof evidenceKindSchema>
export type EvidenceProvenance = z.infer<typeof evidenceProvenanceSchema>
export type EvidenceConfirmationState = z.infer<typeof evidenceConfirmationStateSchema>
export type EvidenceItemCreate = z.infer<typeof evidenceItemCreateSchema>
export type EvidenceItemUpdate = z.infer<typeof evidenceItemUpdateSchema>

export const cvSectionKindSchema = z.enum([
  'summary', 'experience', 'achievements', 'skills', 'education', 'projects',
  'certifications', 'interview-evidence', 'custom',
])
export const cvEntrySchema = z.strictObject({
  id: z.string().min(1).max(100),
  evidence_item_id: z.string().min(1).nullable(),
  body: z.string().min(1).max(5_000),
  position: z.number().int().nonnegative(),
  heading: z.string().min(1).max(200).nullable().optional(),
  subheading: z.string().min(1).max(200).nullable().optional(),
  location: z.string().min(1).max(200).nullable().optional(),
  start_date: z.string().min(1).max(40).nullable().optional(),
  end_date: z.string().min(1).max(40).nullable().optional(),
  bullets: z.array(z.string()).max(30).optional(),
})
/** The 16 template ids (mirrors backend `CvTemplateId`). Not every id has a template yet:
 * the style catalog lists the available ones, and an unavailable id renders as the first. */
export const cvTemplateIdSchema = z.enum([
  'classic', 'scholar', 'academic', 'manuscript', 'executive', 'frame', 'lagoon', 'lilac',
  'meadow', 'rail', 'almanac', 'slate', 'violet', 'grotesk', 'panel', 'ledger',
])
export type CvTemplateId = z.infer<typeof cvTemplateIdSchema>
export const cvPageSizeSchema = z.enum(['a4', 'letter'])
/** The six typeface overrides (mirrors backend `CvFontId`). Ids stored before the 16-template
 * catalog (`lato`, `pt-sans`, ...) are mapped to the nearest of these by the backend. */
export const cvFontIdSchema = z.enum(['inter', 'source-sans-3', 'ibm-plex-sans', 'source-serif-4', 'lora', 'eb-garamond'])
export const cvDensitySchema = z.enum(['compact', 'normal', 'spacious'])
export const CV_ACCENT_PALETTE = [
  '#111827', '#7C2D12', '#075985', '#166534', '#6D28D9', '#B91C1C', '#0F766E',
  '#9D174D', '#334155', '#B45309',
] as const
export const cvStyleSchema = z.strictObject({
  template_id: cvTemplateIdSchema.default('classic'),
  /** Typeface override; null uses the template's own pairing. */
  font_id: cvFontIdSchema.nullable().default(null),
  /** Null prints the template's own colour (its catalog `default_accent`); Ink is an explicit choice. */
  accent_color: z.enum(CV_ACCENT_PALETTE).nullable().default(null),
  density: cvDensitySchema.default('normal'),
  ats_mode: z.boolean().default(false),
  page_size: cvPageSizeSchema.default('a4'),
  fit_one_page: z.boolean().default(false),
})
export type CvStyle = z.infer<typeof cvStyleSchema>
export const cvSectionSchema = z.strictObject({
  id: z.string().min(1).max(100),
  kind: cvSectionKindSchema,
  title: z.string().min(1).max(120),
  visible: z.boolean().default(true),
  position: z.number().int().nonnegative(),
  entries: z.array(cvEntrySchema).max(200).default([]),
})
// The candidate's name, headline and contact details; every part is optional.
export const cvHeaderSchema = z.strictObject({
  name: z.string().min(1).max(120).nullable().default(null),
  headline: z.string().min(1).max(200).nullable().default(null),
  email: z.string().min(1).max(200).nullable().default(null),
  phone: z.string().min(1).max(40).nullable().default(null),
  location: z.string().min(1).max(200).nullable().default(null),
  links: z.array(z.string().min(1).max(200)).max(6).default([]),
})
export type CvHeader = z.infer<typeof cvHeaderSchema>
const emptyCvHeader = (): CvHeader => ({
  name: null, headline: null, email: null, phone: null, location: null, links: [],
})
export const cvDocumentCreateSchema = z.strictObject({
  name: z.string().min(1).max(120),
  sections: z.array(cvSectionSchema).max(50).default([]),
  seed_evidence_item_ids: z.array(z.string()).max(200).default([]),
  header: cvHeaderSchema.optional(),
})
export type CvDocumentCreate = z.input<typeof cvDocumentCreateSchema>
export const cvDocumentUpdateSchema = z.strictObject({
  name: z.string().min(1).max(120).optional(),
  sections: z.array(cvSectionSchema).max(50).optional(),
  style: cvStyleSchema.optional(),
  header: cvHeaderSchema.optional(),
  /** The `updated_at` of the copy being edited; the server answers 409 (with `current`) when it has moved on. */
  expected_updated_at: z.string().optional(),
}).refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'))
/** The 409 body of a save made on a stale copy: the newer version, so nothing is lost silently. */
export const cvConflictSchema = z.object({ detail: z.string(), current: z.lazy(() => cvDocumentSchema) })
export const cvVariantUpdateSchema = z.strictObject({
  name: z.string().trim().min(1).max(120).optional(),
  target_role: z.string().trim().min(1).max(200).optional(),
}).refine((value) => Object.keys(value).length > 0)
export const cvVariantCreateSchema = z.strictObject({
  name: z.string().min(1).max(120),
  target_role: z.string().min(1).max(200).nullable().optional(),
})
export const cvVariantSchema = z.object({
  id: z.string(), name: z.string(), target_role: z.string().nullable(),
  sections: z.array(cvSectionSchema), created_at: z.iso.datetime({ offset: true }),
})
export const cvDocumentSchema = z.object({
  id: z.string(), name: z.string(), sections: z.array(cvSectionSchema),
  style: cvStyleSchema.default(() => ({
    template_id: 'classic' as const, font_id: null, accent_color: null,
    density: 'normal' as const, ats_mode: false, page_size: 'a4' as const, fit_one_page: false,
  })),
  header: cvHeaderSchema.default(emptyCvHeader),
  created_at: z.iso.datetime({ offset: true }), updated_at: z.iso.datetime({ offset: true }),
  tailoring_model_runs: z.number().int().nonnegative(), tailoring_model_run_limit: z.literal(10),
  variants: z.array(cvVariantSchema),
})
export const cvDocumentListSchema = z.object({ items: z.array(cvDocumentSchema) })
export const cvDocumentsExportSchema = z.object({
  schema_version: z.literal('cv-documents-export/v1'), exported_at: z.iso.datetime(),
  document_count: z.number().int().nonnegative(), documents: z.array(cvDocumentSchema),
}).refine((value) => value.document_count === value.documents.length)

// R17 #200/#202: the canonical mirrored honest-response shape also appears in
// the complete career-data export. It lives here to avoid a schema import cycle
// (`gapResponseSchemas.ts` re-exports it for the endpoint client).
export const gapActionPathSchema = z.enum([
  'reviewer_reword',
  'evidence_profile_create',
  'portfolio_planner',
  'career_path',
  // Kept for a response with no product surface to name; every current response
  // names one, because advice that names nothing is not a next step (D-111).
  'advisory',
])
// The first-party surfaces a next step may point at. A literal union (not a bare
// string) so a route that no longer exists cannot be linked to.
export const gapFirstPartyRouteSchema = z.enum(['/portfolio', '/career', '/cv-studio'])
export const gapRecommendationSourceSchema = z.strictObject({
  label: z.string(),
  url: z.string().url().nullish(),
  route: gapFirstPartyRouteSchema.nullish(),
})
export const gapResponseOfferSchema = z.strictObject({
  gap_classification_id: z.string(),
  gap_kind: gapKindSchema,
  response_kind: developmentResponseKindSchema,
  action_path: gapActionPathSchema,
  headline: z.string(),
  detail: z.string(),
  capture_proposal: evidenceItemCreateSchema.nullish(),
  sources: z.array(gapRecommendationSourceSchema),
  commercial_relationship: z.literal('none'),
})
export const developmentLoopExportSchema = z
  .strictObject({
    classification_count: z.number().int().nonnegative(),
    classifications: z.array(gapClassificationSchema),
    item_count: z.number().int().nonnegative(),
    items: z.array(developmentItemSchema),
    recommendation_count: z.number().int().nonnegative(),
    recommendations: z.array(gapResponseOfferSchema),
  })
  .refine(
    (value) =>
      value.classification_count === value.classifications.length &&
      value.item_count === value.items.length &&
      value.recommendation_count === value.recommendations.length,
  )

export const accountExportSchema = z.strictObject({
  id: z.string(), email: z.string(), full_name: z.string().nullish(),
  created_at: z.iso.datetime({ offset: true }).nullish(),
})
export const savedRunExportSchema = z.strictObject({
  id: z.string(), tool_name: z.string(), label: z.string().nullish(),
  is_favorite: z.boolean().default(false), parent_run_id: z.string().nullish(),
  workspace_id: z.string().nullish(), feedback_text: z.string().nullish(),
  result_payload: z.record(z.string(), z.unknown()),
  created_at: z.iso.datetime({ offset: true }).nullish(),
})
export const runsExportSchema = z.strictObject({
  run_count: z.number().int().nonnegative(), runs: z.array(savedRunExportSchema),
}).refine((value) => value.run_count === value.runs.length)

export const careerDataExportSchema = z.strictObject({
  schema_version: z.literal('career-data-export/v1'),
  exported_at: z.iso.datetime(),
  account: accountExportSchema.nullish(),
  runs: runsExportSchema.optional(),
  item_count: z.number().int().nonnegative(), items: z.array(evidenceItemSchema),
  cv_documents: cvDocumentsExportSchema,
  personalization: discoveryPersonalizationExportSchema,
  development: developmentLoopExportSchema,
  applications: applicationsExportSchema,
}).refine((value) => value.item_count === value.items.length)
export type CvEntry = z.infer<typeof cvEntrySchema>
export type CvSection = z.infer<typeof cvSectionSchema>
export type CvDocument = z.infer<typeof cvDocumentSchema>
export type CvVariant = z.infer<typeof cvVariantSchema>
export type CvDocumentUpdate = z.infer<typeof cvDocumentUpdateSchema>

/** `POST /cv-documents/{id}/preview`: the unsaved draft as page images (print-faithful WebP data URLs) plus where
 * each section sits on them, as fractions (0..1) of the page. A section that crosses a page break has one rectangle per page. */
export const cvPreviewSchema = z.object({
  pages: z.array(z.object({ url: z.string(), width: z.number().int().positive(), height: z.number().int().positive() })),
  page_count: z.number().int().nonnegative(),
  sections: z.array(z.object({
    id: z.string(), kind: z.string(), page: z.number().int().nonnegative(),
    x: z.number(), y: z.number(), w: z.number(), h: z.number(),
  })),
  warnings: z.array(z.object({ code: z.string(), message: z.string(), characters: z.array(z.string()).default([]) })).default([]),
  truncated: z.boolean().default(false),
  /** Present when the style asks to fit to one page: whether it fit, the pages at the chosen scale (more than one means
   * it runs to that many at the smallest allowed scale), the scale and the body size in points. */
  fit: z.object({ fits: z.boolean(), pages: z.number().int().positive(), scale: z.number(), body_pt: z.number() }).nullish(),
  /** How long the CV runs, with a plain-sentence suggestion when there is one (`action` is a style option to switch on). */
  length: z.object({
    pages: z.number().int().nonnegative(),
    last_page_fill: z.number(),
    advice: z.object({ code: z.string(), message: z.string(), action: z.literal('fit_one_page').nullish() }).nullish(),
  }).nullish(),
})
export type CvPreview = z.infer<typeof cvPreviewSchema>

/** `POST /cv-documents/{id}/template-thumbnails`: page 1 of the unsaved draft in every available template (WebP data
 * URLs). A template that could not be drawn has no `url` and an `error` sentence; `sample` is true when the CV has no
 * entries yet and the built-in sample CV is shown instead. */
export const cvTemplateThumbnailsSchema = z.object({
  thumbnails: z.array(z.object({
    template_id: z.string(),
    url: z.string().nullish(),
    width: z.number().int().nonnegative(),
    height: z.number().int().nonnegative(),
    pages: z.number().int().nonnegative(),
    error: z.string().nullish(),
  })),
  sample: z.boolean().default(false),
})
export type CvTemplateThumbnails = z.infer<typeof cvTemplateThumbnailsSchema>

export const cvTailoringChangeSchema = z.strictObject({
  id: z.string().min(1).max(100), section_id: z.string().min(1).max(100), entry_id: z.string().min(1).max(100),
  // Which entry field this change rewrites: "body", or "bullets[<index>]" for
  // a specific rendered bullet — structured entries render bullets, not body (#322).
  field: z.string().min(1).max(20).default('body'),
  before: z.string().min(1).max(5_000), after: z.string().min(1).max(5_000), job_requirement: z.string().min(1).max(1_000),
  evidence_item_ids: z.array(z.string()).max(20), support: z.enum(['confirmed', 'document', 'unsupported']),
})
export const cvTailoringProposalSchema = z.object({
  schema_version: z.literal('cv-tailoring/v1'), job_title: z.string(), changes: z.array(cvTailoringChangeSchema).max(50),
  skipped: z.array(z.strictObject({ id: z.string(), reason: z.literal('stale_before_text') })).max(50).default([]),
  remaining_regenerations: z.number().int().nonnegative(), request_id: z.string().uuid(), proposal_token: z.string().length(64), history_id: z.string().nullable(), access_mode: z.literal('authenticated'),
  saved: z.boolean(), locked_actions: z.array(z.string()),
})
export const cvTailoringApplySchema = z.strictObject({
  request_id: z.string().uuid(), variant_name: z.string().min(1).max(120), job_title: z.string().min(1).max(200), proposal_token: z.string().length(64),
  changes: z.array(cvTailoringChangeSchema).max(50), decisions: z.array(z.strictObject({
    change_id: z.string(), action: z.enum(['accept', 'reject']),
  })).max(50),
})
export type CvTailoringProposal = z.infer<typeof cvTailoringProposalSchema>
export type CvTailoringChange = z.infer<typeof cvTailoringChangeSchema>

export const cvQualityResponseSchema = z.object({
  schema_version: z.literal('cv-quality/v3'),
  checks: z.array(z.object({
    id: z.enum(['sections', 'reads_back', 'links', 'page_breaks', 'layout']),
    label: z.string(), passed: z.boolean(), detail: z.string(), fix: z.string(),
  })),
})
// GET /cv-documents/style-catalog: the backend's single source of CV design
// values. The live preview looks sizes, fonts and names up here.
const cvStyleSizesSchema = z.object({ body_pt: z.number(), heading_pt: z.number(), section_gap_pt: z.number() })
export const cvStyleCatalogSchema = z.object({
  templates: z.array(z.object({
    id: cvTemplateIdSchema, name: z.string(), description: z.string(), ats_safe: z.boolean(),
    columns: z.union([z.literal(1), z.literal(2)]), photo_slot: z.boolean(),
    group: z.enum(['ats-safe', 'more']),
    typefaces: z.record(z.string(), z.string()),
    title_align: z.enum(['left', 'center']), margin_mm: z.number(),
    sidebar_kinds: z.array(cvSectionKindSchema),
    // A plain sentence about the Word export when it differs from the PDF; null when it matches.
    docx_note: z.string().nullable().default(null),
    // The palette colour the template prints with while the style's accent is null.
    default_accent: z.enum(CV_ACCENT_PALETTE).default('#111827'),
    sizes: z.object({ compact: cvStyleSizesSchema, normal: cvStyleSizesSchema, spacious: cvStyleSizesSchema }),
  })).min(1),
  fonts: z.array(z.object({ id: cvFontIdSchema, name: z.string(), category: z.string(), css_family: z.string() })).min(1),
  palette: z.array(z.object({ value: z.enum(CV_ACCENT_PALETTE), name: z.string() })).min(1),
  densities: z.array(z.object({ id: cvDensitySchema, name: z.string() })).min(1),
  ats_mode: z.object({
    template_id: cvTemplateIdSchema, offered_template_ids: z.array(cvTemplateIdSchema),
    density: cvDensitySchema, accent: z.string(), css_family: z.string(),
  }),
})
export type CvStyleCatalog = z.infer<typeof cvStyleCatalogSchema>
export type CvQualityResponse = z.infer<typeof cvQualityResponseSchema>

export const cvImportClaimSchema = z.strictObject({
  kind: evidenceKindSchema,
  content: z.record(z.string(), z.string()).refine((value) => Object.keys(value).length > 0),
  provenance: z.literal('imported'),
})
export const cvImportEntrySchema = z.strictObject({
  id: z.string().min(1).max(100), body: z.string().min(1).max(5_000),
  position: z.number().int().nonnegative(), claim: cvImportClaimSchema.nullable(),
  heading: z.string().min(1).max(200).nullable().optional(),
  subheading: z.string().min(1).max(200).nullable().optional(),
  location: z.string().min(1).max(200).nullable().optional(),
  start_date: z.string().min(1).max(40).nullable().optional(),
  end_date: z.string().min(1).max(40).nullable().optional(),
  bullets: z.array(z.string()).max(30).optional(),
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
  header: cvHeaderSchema.default(emptyCvHeader),
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
  has_password: z.boolean().optional(),
})

export const authSessionResponseSchema = z.strictObject({
  ok: z.boolean(),
})

/** GET /auth/refresh/session (alias /auth/session): the signed-in user or null for a guest; always a 200, never a 401. */
export const sessionStateSchema = z.object({
  user: userSchema.nullable(),
  // A guest whose refresh cookie would succeed at POST /auth/refresh.
  refreshable: z.boolean().optional(),
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
  // False when no fetch tier produced a posting: job_description is then empty (paste the listing instead).
  readable: z.boolean().optional(),
})

export const importJobUrlSchema = z.strictObject({
  url: z.string().url().max(2_048).refine((value) => {
    // Checks run even after .url() failed, so a bare "example.com/job" must not throw here.
    try {
      const protocol = new URL(value).protocol
      return protocol === 'http:' || protocol === 'https:'
    } catch {
      return false
    }
  }, 'Enter a full link starting with https://'),
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
  // The run this one re-generates (absent on an older API): lets list rows tag revisions.
  parent_run_id: z.string().nullable().optional(),
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
      status: applicationStatusSchema.nullable().default(null),
      deadline: z.iso.datetime({ offset: true }).nullable().default(null),
      listing: applicationListingSchema.nullable().default(null),
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
  status: applicationStatusSchema.nullable().default(null),
  deadline: z.iso.datetime({ offset: true }).nullable().default(null),
  listing: applicationListingSchema.nullable().default(null),
  linked_run_ids: z.array(z.string()).default([]),
  last_active_tool: z.string().nullable().optional(),
  last_active_result_id: z.string().nullable().optional(),
  updated_at: z.string(),
})

// Label and pin only; application fields are edited through /applications.
export const workspaceUpdateSchema = z.strictObject({
  label: z.string().max(200).nullable().optional(),
  is_pinned: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0)

export const workspaceListSchema = z.object({
  items: z.array(workspaceSummarySchema),
  total: z.number(),
})

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

export const boundedIdentifierSchema = codePointBoundedString({ min: 1, max: 100 })
export const workspaceContextInputSchema = z.object({
  workspace_id: boundedIdentifierSchema.nullable().optional(),
  linked_history_ids: z.array(boundedIdentifierSchema).max(50).default([]),
})

export const resumeIssueSchema = z.object({
  id: z.string(),
  severity: z.enum(['high', 'medium', 'low']),
  category: z.enum(['keywords', 'impact', 'structure', 'clarity', 'completeness']),
  title: z.string(),
  why_it_matters: z.string(),
  evidence: z.string(),
  fix: z.string(),
})
export const resumeEvidenceSchema = z.object({
  detected_sections: z.array(z.string()),
  detected_skills: z.array(z.string()),
  matched_keywords: z.array(z.string()),
  missing_keywords: z.array(z.string()),
  quantified_bullets: z.number(),
})
export const resumeRoleFitSchema = z.object({
  target_role_label: z.string(),
  fit_score: z.number(),
  rationale: z.string(),
})
export const jobRequirementSchema = z.object({
  requirement: z.string(),
  importance: z.enum(['must', 'preferred']),
  status: z.enum(['matched', 'partial', 'missing']),
  resume_evidence: z.string(),
  suggested_fix: z.string(),
})
export const missingKeywordSchema = z.object({
  keyword: z.string(),
  contextual_guidance: z.string().default(''),
  anti_stuffing_note: z.string().default(''),
})
export const tailoringActionSchema = z.object({
  section: z.enum(['summary', 'experience', 'skills', 'projects']),
  keyword: z.string(),
  action: z.string(),
})

function utf8Size(value: string): number | null {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return null
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return null
    }
  }
  return new TextEncoder().encode(value).length
}

function codePointBoundedString({ min, max, minMessage }: { min?: number; max?: number; minMessage?: string }) {
  return z.string().superRefine((value, ctx) => {
    const length = Array.from(value).length
    if (min !== undefined && length < min) {
      ctx.addIssue({
        code: 'too_small',
        origin: 'string',
        minimum: min,
        inclusive: true,
        message: minMessage ?? `Too small: expected string to have >=${min} characters`,
      })
    }
    if (max !== undefined && length > max) {
      ctx.addIssue({
        code: 'too_big',
        origin: 'string',
        maximum: max,
        inclusive: true,
        message: `Too big: expected string to have <=${max} characters`,
      })
    }
  })
}

function validateUtf8(value: string, ctx: z.RefinementCtx): void {
  if (utf8Size(value) === null) {
    ctx.addIssue({ code: 'custom', message: PASSWORD_COPY.encoding })
  }
}

export const loginPasswordSchema = z.string().superRefine(validateUtf8)
export const newPasswordSchema = codePointBoundedString({ min: 8, minMessage: 'Password must be at least 8 characters.' }).superRefine(
  (value, ctx) => {
    const size = utf8Size(value)
    if (size === null) {
      ctx.addIssue({ code: 'custom', message: PASSWORD_COPY.encoding })
    } else if (size > 72) {
      ctx.addIssue({ code: 'custom', message: PASSWORD_COPY.tooLong })
    }
  },
)
export const loginRequestSchema = z.object({
  email: z.email(),
  password: loginPasswordSchema,
})
export const registerRequestSchema = z.object({
  email: z.email(),
  password: newPasswordSchema,
  full_name: z.string().max(200).nullable().optional(),
  tos_accepted: z.boolean().refine(value => value, {
    message: 'You must accept the Terms of Service',
  }),
})
export const passwordResetConfirmRequestSchema = z.object({
  token: z.string(),
  new_password: newPasswordSchema,
})

/** POST /auth/password-reset/request. `dev_reset_url` only ever arrives in local development. */
export const passwordResetRequestResponseSchema = z.object({
  message: z.string(),
  dev_reset_url: z.string().optional(),
})

/** PATCH /auth/me: send at least one of the two; the answer is the updated user (userSchema). */
export const profileUpdateRequestSchema = z
  .strictObject({
    full_name: z.string().max(200).nullable().optional(),
    // The backend trims before validating, so a padded address is valid.
    email: z.string().trim().pipe(z.email()).optional(),
  })
  .refine((v) => v.full_name !== undefined || v.email !== undefined, 'Send a name or an email address to change')

/** POST /auth/change-password; the answer is authSessionResponseSchema and renews this session's cookies. */
export const changePasswordRequestSchema = z.strictObject({
  current_password: z.string().min(1),
  new_password: newPasswordSchema,
})

function validateBoundedHandoff(value: unknown, ctx: z.RefinementCtx): void {
  const pending = [value]
  let nodes = 0
  let encodedSize = 0

  while (pending.length > 0) {
    const item = pending.pop()
    nodes += 1
    if (nodes > 1_000) {
      ctx.addIssue({ code: 'custom', message: 'Handoff payload is too complex' })
      return
    }

    if (typeof item === 'string') {
      const stringSize = utf8Size(item)
      if (stringSize === null) {
        ctx.addIssue({ code: 'custom', message: 'Handoff values must be valid UTF-8' })
        return
      }
      if (stringSize > 20_000) {
        ctx.addIssue({ code: 'custom', message: 'Handoff strings must be at most 20000 UTF-8 bytes' })
        return
      }
      encodedSize += new TextEncoder().encode(JSON.stringify(item)).length
    } else if (Array.isArray(item)) {
      if (item.length > 100) {
        ctx.addIssue({ code: 'custom', message: 'Handoff lists must contain at most 100 items' })
        return
      }
      encodedSize += Math.max(0, item.length - 1) + 2
      pending.push(...item)
    } else if (item !== null && typeof item === 'object') {
      const entries = Object.entries(item)
      encodedSize += Math.max(0, entries.length - 1) + 2
      for (const [key, child] of entries) {
        encodedSize += new TextEncoder().encode(JSON.stringify(key)).length + 1
        pending.push(child)
      }
    } else {
      encodedSize += new TextEncoder().encode(JSON.stringify(item) ?? 'null').length
    }

    if (encodedSize > 100_000) {
      ctx.addIssue({ code: 'custom', message: 'Handoff payload must be at most 100000 UTF-8 bytes' })
      return
    }
  }
}

export const resumeAnalysisHandoffSchema = z.object({
  history_id: boundedIdentifierSchema.nullable().optional(),
  summary: resultSummarySchema.nullable().optional(),
  top_actions: z.array(topActionSchema).max(100).optional(),
  strengths: z.array(z.string()).max(100).optional(),
  issues: z.array(resumeIssueSchema).max(100).optional(),
  evidence: resumeEvidenceSchema.nullable().optional(),
  role_fit: resumeRoleFitSchema.nullable().optional(),
}).superRefine(validateBoundedHandoff)

export const jobMatchHandoffSchema = z.object({
  history_id: boundedIdentifierSchema.nullable().optional(),
  summary: resultSummarySchema.nullable().optional(),
  top_actions: z.array(topActionSchema).max(100).optional(),
  match_score: z.number().int().nullable().optional(),
  verdict: z.enum(['strong', 'borderline', 'stretch']).nullable().optional(),
  requirements: z.array(jobRequirementSchema).max(100).optional(),
  matched_keywords: z.array(z.string()).max(100).optional(),
  missing_keywords: z.array(missingKeywordSchema).max(100).optional(),
  tailoring_actions: z.array(tailoringActionSchema).max(100).optional(),
  interview_focus: z.array(z.string()).max(100).optional(),
  recruiter_summary: z.string().nullable().optional(),
}).superRefine(validateBoundedHandoff)

const toolRequestContextShape = {
  workspace_context: workspaceContextInputSchema.nullable().optional(),
  parent_run_id: boundedIdentifierSchema.nullable().optional(),
  feedback: codePointBoundedString({ max: 2_000 }).nullable().optional(),
}

export const resumeAnalyzeRequestSchema = z.object({
  resume_text: codePointBoundedString({ min: 50, max: 50_000 }),
  job_description: codePointBoundedString({ max: 20_000 }).nullable().optional(),
  ...toolRequestContextShape,
})
export const jobMatchRequestSchema = z.object({
  resume_text: codePointBoundedString({ min: 50, max: 50_000 }),
  job_description: codePointBoundedString({ min: 20, max: 20_000 }),
  ...toolRequestContextShape,
})
export const coverLetterRequestSchema = z.object({
  resume_text: codePointBoundedString({ min: 50, max: 50_000 }),
  job_description: codePointBoundedString({ min: 20, max: 20_000 }),
  tone: codePointBoundedString({ max: 50 }).nullable().optional(),
  resume_analysis: resumeAnalysisHandoffSchema.nullable().optional(),
  job_match: jobMatchHandoffSchema.nullable().optional(),
  ...toolRequestContextShape,
})
export const interviewRequestSchema = z.object({
  resume_text: codePointBoundedString({ min: 50, max: 50_000 }),
  job_description: codePointBoundedString({ min: 20, max: 20_000 }),
  num_questions: z.number().int().min(3).max(12).nullable().optional(),
  resume_analysis: resumeAnalysisHandoffSchema.nullable().optional(),
  job_match: jobMatchHandoffSchema.nullable().optional(),
  ...toolRequestContextShape,
})
export const careerRequestSchema = z.object({
  resume_text: codePointBoundedString({ min: 50, max: 50_000 }),
  target_role: codePointBoundedString({ max: 200 }).nullable().optional(),
  ...toolRequestContextShape,
})
export const portfolioRequestSchema = z.object({
  resume_text: codePointBoundedString({ min: 50, max: 50_000 }),
  target_role: codePointBoundedString({ max: 200 }),
  ...toolRequestContextShape,
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

export const applicationReviewFindingSchema = z.object({
  id: z.string(), category: z.enum(['unsupported_claim', 'missed_requirement', 'contradiction', 'generic_language', 'repetition', 'document_defect']),
  severity: z.enum(['high', 'medium', 'low']), message: z.string(), locations: z.array(z.string()), trace: z.array(z.string()),
})
/** Which documents the checks read (a CV version chosen; a cover letter with text). Older results lack it: both. */
export const applicationReviewDocumentsSchema = z.object({ cv: z.boolean().default(true), cover_letter: z.boolean().default(true) })
export const applicationReviewResponseSchema = sharedResultEnvelopeSchema.extend({
  documents: applicationReviewDocumentsSchema.default({ cv: true, cover_letter: true }),
  findings: z.array(applicationReviewFindingSchema),
})

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
    issues: z.array(resumeIssueSchema),
    evidence: resumeEvidenceSchema,
    role_fit: resumeRoleFitSchema.nullable().optional(),
  })
  .passthrough()

export const jobMatchResultSchema = sharedResultEnvelopeSchema
  .extend({
    match_score: z.number(),
    verdict: z.enum(['strong', 'borderline', 'stretch']),
    requirements: z.array(jobRequirementSchema),
    matched_keywords: z.array(z.string()),
    missing_keywords: z.array(missingKeywordSchema),
    tailoring_actions: z.array(tailoringActionSchema),
    interview_focus: z.array(z.string()),
    recruiter_summary: z.string(),
    // The job the posting names (Track job prefills Role and Company); null when unknown.
    job_title: z.string().nullable().optional(),
    company: z.string().nullable().optional(),
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
    // "Sincerely,\nName" when the resume names the applicant; kept through edits and exports.
    sign_off: z.string().default(''),
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
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>
export type SessionState = z.infer<typeof sessionStateSchema>
export type PasswordResetRequestResponse = z.infer<typeof passwordResetRequestResponseSchema>
export type ProfileUpdateRequest = z.input<typeof profileUpdateRequestSchema>
export type ChangePasswordRequest = z.input<typeof changePasswordRequestSchema>
export type HealthCheck = z.infer<typeof healthCheckSchema>
export type ParsedCvResult = z.infer<typeof parsedCvSchema>
export type ImportedJobPost = z.infer<typeof importedJobSchema>
export type ToolRunSummary = z.infer<typeof toolRunSummarySchema>
export type ToolRunDetail = z.infer<typeof toolRunDetailSchema>
export type ToolRunList = z.infer<typeof toolRunListSchema>
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>
export type WorkspaceList = z.infer<typeof workspaceListSchema>
export type WorkspaceUpdate = z.input<typeof workspaceUpdateSchema>
export type ApplicationListing = z.infer<typeof applicationListingSchema>
export type ApplicationCard = z.infer<typeof applicationCardSchema>
export type ApplicationList = z.infer<typeof applicationListSchema>
export type ApplicationDetail = z.infer<typeof applicationDetailSchema>
export type ApplicationUpdate = z.input<typeof applicationUpdateSchema>
export type ApplicationCreate = z.input<typeof applicationCreateSchema>
export type ApplicationEventPage = z.infer<typeof applicationEventPageSchema>
export type ApplicationTask = z.infer<typeof applicationTaskSchema>
export type ApplicationEvent = z.infer<typeof applicationEventSchema>
export type ApplicationPreferences = z.infer<typeof applicationPreferencesSchema>
export type ApplicationPreferencesUpdate = z.input<typeof applicationPreferencesUpdateSchema>
export type ApplicationDetails = z.infer<typeof applicationDetailsSchema>
export type ApplicationDetailsUpdate = z.input<typeof applicationDetailsUpdateSchema>
export type BulkPrepareResult = z.infer<typeof bulkPrepareResultSchema>
export type AutofillReport = z.infer<typeof autofillReportSchema>
export type AutofillRunStatus = z.infer<typeof autofillRunStatusSchema>
export type ApplicationReviewFinding = z.infer<typeof applicationReviewFindingSchema>
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
