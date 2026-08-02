import { z } from 'zod'
import { ApiError } from '#/lib/api/errors'
import {
  applicationPacketItemSchema,
  applicationPacketListSchema,
  packetApprovalResultSchema,
  packetApprovalPreviewSchema,
  packetApprovalRequestSchema,
  queueReviewStateSchema,
  stopAnswerRequestSchema,
  stopAnswerResultSchema,
} from '#/lib/api/packetSchemas'
import {
  authProvidersSchema,
  careerResultSchema,
  coverLetterResultSchema,
  deletedResponseSchema,
  evidenceItemListSchema,
  evidenceItemSchema,
  evidenceItemCreateSchema,
  evidenceItemUpdateSchema,
  evidenceConfirmationActionSchema,
  evidenceImportRequestSchema,
  evidenceImportProposalsSchema,
  discoveryRecommendationListSchema,
  discoveryPersonalizationSchema,
  discoveryHiddenSourceSchema,
  discoveryDismissalSchema,
  discoveryReportAckSchema,
  healthCheckSchema,
  importedJobSchema,
  importJobTextSchema,
  importJobUrlSchema,
  interviewPracticeFeedbackSchema,
  interviewResultSchema,
  jobMatchResultSchema,
  parsedCvSchema,
  portfolioResultSchema,
  resumeResultSchema,
  toolRunDetailSchema,
  toolRunListSchema,
  toolRunSummarySchema,
  userSchema,
  workspaceListSchema,
  workspaceSummarySchema,
  workspaceUpdateSchema,
  campaignDetailSchema,
  campaignMaterialSelectionSchema,
  campaignTaskSchema, campaignNoteSchema, campaignContactSchema,
  campaignReminderResponseSchema,
  campaignReviewResponseSchema,
  cvDocumentCreateSchema,
  cvDocumentListSchema,
  cvDocumentSchema,
  cvDocumentUpdateSchema,
  cvVariantCreateSchema,
  cvVariantSchema,
  cvQualityRequestSchema,
  cvQualityResponseSchema,
  cvTailoringApplySchema,
  cvTailoringProposalSchema,
  cvRenderModelSchema,
} from '#/lib/api/schemas'
import type {
  EvidenceConfirmationAction,
  EvidenceItemCreate,
  EvidenceItemUpdate,
  JobMatchResult,
  ResumeResult,
  CvDocumentUpdate,
  CvAtsCheckKey,
  CvTemplateId,
  WorkspaceUpdate,
  CampaignMaterialSelection,
} from '#/lib/api/schemas'

export function listCvDocuments() {
  return request('/cv-documents', { method: 'GET', schema: cvDocumentListSchema })
}

export function createCvDocument(payload: { name: string }) {
  return request('/cv-documents', {
    method: 'POST', body: cvDocumentCreateSchema.parse(payload), schema: cvDocumentSchema,
  })
}

export function getCvDocument(documentId: string) {
  return request(`/cv-documents/${documentId}`, { method: 'GET', schema: cvDocumentSchema })
}

export function deleteCvDocument(documentId: string) {
  return request(`/cv-documents/${documentId}`, { method: 'DELETE' })
}

export function deleteAllCvDocuments() {
  return request('/cv-documents', { method: 'DELETE' })
}

export function updateCvDocument(documentId: string, payload: CvDocumentUpdate) {
  return request(`/cv-documents/${documentId}`, {
    method: 'PATCH', body: cvDocumentUpdateSchema.parse(payload), schema: cvDocumentSchema,
  })
}

export function snapshotCvVariant(documentId: string, name: string) {
  return request(`/cv-documents/${documentId}/variants`, {
    method: 'POST', body: cvVariantCreateSchema.parse({ name, target_role: null }), schema: cvVariantSchema,
  })
}

export function restoreCvVariant(documentId: string, variantId: string) {
  return request(`/cv-documents/${documentId}/variants/${variantId}/restore`, {
    method: 'POST', body: {}, schema: cvDocumentSchema,
  })
}

export function scoreCvDocument(
  documentId: string,
  payload: { use_model: boolean; checks?: CvAtsCheckKey[]; artifact_template?: CvTemplateId; artifact_format?: 'docx' | 'pdf' },
) {
  return request(`/cv-documents/${documentId}/quality`, {
    method: 'POST', body: cvQualityRequestSchema.parse(payload), schema: cvQualityResponseSchema,
  })
}

export function getCvRenderModel(documentId: string, template: CvTemplateId) {
  return request(`/cv-documents/${documentId}/render?template=${encodeURIComponent(template)}`, { method: 'GET', schema: cvRenderModelSchema })
}

export function cvArtifactUrl(documentId: string, template: CvTemplateId, format: 'docx' | 'pdf') {
  return `${API_URL}/cv-documents/${encodeURIComponent(documentId)}/artifacts/${format}?template=${encodeURIComponent(template)}`
}

export async function fetchCvArtifactBlob(documentId: string, template: CvTemplateId, format: 'docx' | 'pdf', retry = false): Promise<Blob> {
  const response = await fetch(cvArtifactUrl(documentId, template, format), {
    credentials: 'include', signal: AbortSignal.timeout(180_000),
  })
  if (response.status === 401 && !retry && Date.now() >= refreshCooldownUntil) {
    try {
      if (!refreshPromise) refreshPromise = silentRefresh()
      await refreshPromise
      refreshPromise = null
      return fetchCvArtifactBlob(documentId, template, format, true)
    } catch {
      refreshPromise = null
      refreshCooldownUntil = Date.now() + REFRESH_COOLDOWN_MS
      dispatchSessionExpired()
    }
  }
  if (!response.ok) throw new ApiError('Artifact export failed', response.status)
  return response.blob()
}

export function tailorCvDocument(documentId: string, payload: { job_title: string; job_description: string }) {
  return request(`/cv-documents/${documentId}/tailoring`, { method: 'POST', body: payload, schema: cvTailoringProposalSchema })
}

export function applyCvTailoring(documentId: string, payload: unknown) {
  return request(`/cv-documents/${documentId}/tailoring/apply`, { method: 'POST', body: cvTailoringApplySchema.parse(payload), schema: cvVariantSchema })
}

export function proposeCvTailoringEdit(documentId: string, payload: unknown) {
  const parsed = cvTailoringApplySchema.pick({ request_id: true, job_title: true, proposal_token: true, changes: true }).extend({ change_id: z.string(), edited_after: z.string().min(1).max(5_000) }).parse(payload)
  return request(`/cv-documents/${documentId}/tailoring/edit-proposals`, { method: 'POST', body: parsed, schema: evidenceItemSchema })
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function resolveApiUrl(): string {
  const configuredUrl = import.meta.env.VITE_API_URL?.trim()
  if (configuredUrl) {
    return trimTrailingSlash(configuredUrl)
  }

  // Dev: Vite proxy forwards /api/v1 to backend.
  // Prod: reverse proxy (nginx/caddy) must route /api/v1 to the backend.
  return '/api/v1'
}

export const API_URL = resolveApiUrl()

type RequestOptions<T> = Omit<RequestInit, 'body'> & {
  body?: RequestInit['body'] | Record<string, unknown>
  schema?: z.ZodType<T>
}

function normalizeBody(body: RequestInit['body'] | Record<string, unknown> | undefined) {
  if (!body) return undefined
  if (body instanceof FormData) return body
  if (typeof body === 'string' || body instanceof URLSearchParams) return body
  return JSON.stringify(body)
}

// Silent refresh mutex — prevents concurrent refresh calls
let refreshPromise: Promise<void> | null = null
// Cooldown after a failed refresh — avoids thundering-herd retries when the
// refresh endpoint is down or the refresh cookie is gone.
let refreshCooldownUntil = 0
const REFRESH_COOLDOWN_MS = 2000
// Debounce `cw:session-expired` so a burst of concurrent 401s (e.g. userQuery
// + historyQuery + workspacesQuery failing in the same tick) only fires one
// event, not one per request.
let sessionExpiredDispatchedAt = 0
const SESSION_EXPIRED_DEBOUNCE_MS = 1000

function dispatchSessionExpired() {
  const now = Date.now()
  if (now - sessionExpiredDispatchedAt < SESSION_EXPIRED_DEBOUNCE_MS) return
  sessionExpiredDispatchedAt = now
  window.dispatchEvent(new CustomEvent('cw:session-expired'))
}

// Test-only: reset module state between tests.
export function __resetRefreshState() {
  refreshPromise = null
  refreshCooldownUntil = 0
  sessionExpiredDispatchedAt = 0
}

async function silentRefresh(): Promise<void> {
  // Refresh endpoint sets new HttpOnly cookies server-side; response body is ignored.
  // 10s ceiling so a hung auth endpoint can't block every 401-retry indefinitely
  // while still being generous enough for slow mobile networks.
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    credentials: 'include',
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error('refresh failed')
}

async function request<T>(
  path: string,
  options: RequestOptions<T> = {},
  _isRetry = false,
): Promise<T> {
  const headers = new Headers(options.headers || {})
  const body = normalizeBody(options.body as RequestInit['body'])

  if (body && !(body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    body,
    headers,
    credentials: 'include',
    signal: AbortSignal.timeout(180_000), // 3 minute timeout for LLM calls
  })

  const parsed = await response
    .clone()
    .json()
    .catch(async () => response.text().catch(() => ''))

  if (!response.ok) {
    // Try silent refresh on 401 (skip for refresh endpoint itself and retries)
    if (
      response.status === 401 &&
      !_isRetry &&
      path !== '/auth/refresh' &&
      Date.now() >= refreshCooldownUntil
    ) {
      try {
        if (!refreshPromise) {
          refreshPromise = silentRefresh()
        }
        await refreshPromise
        refreshPromise = null
        return request(path, options, true)
      } catch {
        refreshPromise = null
        refreshCooldownUntil = Date.now() + REFRESH_COOLDOWN_MS
        dispatchSessionExpired()
      }
    } else if (response.status === 401) {
      dispatchSessionExpired()
    }

    const detail =
      typeof parsed === 'string'
        ? parsed
        : typeof parsed === 'object' && parsed && 'detail' in parsed
          ? String(parsed.detail)
          : undefined

    throw new ApiError(detail || 'Request failed', response.status, detail)
  }

  if (options.schema) {
    // Convert a Zod parse failure into an ApiError so downstream consumers can
    // rely on a uniform error shape (`.status`, `.detail`). A 200 with a body
    // that no longer matches the schema is a backend/frontend contract drift,
    // not a 4xx; surface it as 502 so users see "service issue" not "bad input".
    try {
      return options.schema.parse(parsed)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid response shape'
      throw new ApiError('Server returned an unexpected response', 502, message)
    }
  }

  return parsed as T
}

export type HistoryQueryParams = {
  tool?: string
  favorite?: boolean
  q?: string
  page?: number
  page_size?: number
}

// Auth endpoints don't parse response bodies — HttpOnly cookies set by the
// backend are the sole source of session truth. Any `access_token` the
// backend still returns in JSON is explicitly discarded by the frontend
// (Codex-flagged cleanup: backend-side body removal is a follow-up).
export async function login(payload: { email: string; password: string }): Promise<void> {
  await request<unknown>('/auth/login', {
    method: 'POST',
    body: payload,
  })
}

export function register(payload: {
  email: string
  password: string
  full_name?: string
  captcha_token?: string
  tos_accepted: boolean
}) {
  return request('/auth/register', {
    method: 'POST',
    body: payload,
    schema: userSchema,
  })
}

export function getCurrentUser() {
  return request('/auth/me', {
    method: 'GET',
    schema: userSchema,
  })
}

export function getAuthProviders() {
  return request('/auth/providers', {
    method: 'GET',
    schema: authProvidersSchema,
  })
}

export function getHealth() {
  return request('/health', {
    method: 'GET',
    schema: healthCheckSchema,
  })
}

export function listEvidenceItems() {
  return request('/evidence-profile/items', {
    method: 'GET',
    schema: evidenceItemListSchema,
  })
}

export function listDiscoveryRecommendations() {
  return request('/discovery/recommendations', {
    method: 'GET',
    schema: discoveryRecommendationListSchema,
  })
}

// R14 #176 explicit adoption: one user action turns a visible recommendation
// into a campaign whose canonical listing carries the listing content,
// attribution, and retrieval date. Returns the new campaign detail.
export function adoptDiscoveryRecommendation(listingId: string) {
  return request(`/discovery/recommendations/${listingId}/adopt`, {
    method: 'POST',
    body: {},
    schema: campaignDetailSchema,
  })
}

// R14 #175 discovery correction controls. Every write is owner-scoped server-side.
export function getDiscoveryPersonalization() {
  return request('/discovery/personalization', {
    method: 'GET',
    schema: discoveryPersonalizationSchema,
  })
}

export function hideDiscoverySource(sourceId: string) {
  return request('/discovery/hidden-sources', {
    method: 'POST',
    body: { source_id: sourceId },
    schema: discoveryHiddenSourceSchema,
  })
}

export function unhideDiscoverySource(sourceId: string) {
  return request<void>(`/discovery/hidden-sources/${sourceId}`, { method: 'DELETE' })
}

export function dismissDiscoveryRecommendation(listingId: string) {
  return request('/discovery/dismissals', {
    method: 'POST',
    body: { listing_id: listingId },
    schema: discoveryDismissalSchema,
  })
}

export function undismissDiscoveryRecommendation(listingId: string) {
  return request<void>(`/discovery/dismissals/${listingId}`, { method: 'DELETE' })
}

export function reportDiscoveryRecommendation(payload: {
  listingId: string
  reasonCategory: string
  reason: string
}) {
  return request('/discovery/reports', {
    method: 'POST',
    body: {
      listing_id: payload.listingId,
      reason_category: payload.reasonCategory,
      reason: payload.reason,
    },
    schema: discoveryReportAckSchema,
  })
}

export function createEvidenceItem(payload: EvidenceItemCreate) {
  return request('/evidence-profile/items', {
    method: 'POST', body: evidenceItemCreateSchema.parse(payload), schema: evidenceItemSchema,
  })
}

export function updateEvidenceItem(
  itemId: string,
  payload: EvidenceItemUpdate,
) {
  return request(`/evidence-profile/items/${itemId}`, {
    method: 'PATCH', body: evidenceItemUpdateSchema.parse(payload), schema: evidenceItemSchema,
  })
}

export function setEvidenceItemConfirmation(
  itemId: string,
  action: EvidenceConfirmationAction['action'],
) {
  return request(`/evidence-profile/items/${itemId}/confirmation`, {
    method: 'POST',
    body: evidenceConfirmationActionSchema.parse({ action }),
    schema: evidenceItemSchema,
  })
}

export function deleteEvidenceItem(itemId: string) {
  return request<void>(`/evidence-profile/items/${itemId}`, { method: 'DELETE' })
}

// R11 (#146): derive reviewable evidence proposals from parsed resume text.
// Authenticated-only server-side (guests get 401/403). Proposals are ephemeral —
// nothing is stored until the user accepts one via createEvidenceItem.
export function requestEvidenceImportProposals(resumeText: string) {
  return request('/evidence-profile/import/proposals', {
    method: 'POST',
    body: evidenceImportRequestSchema.parse({ resume_text: resumeText }),
    schema: evidenceImportProposalsSchema,
  })
}

export function parseCv(file: File) {
  const formData = new FormData()
  formData.append('file', file)

  return request('/files/parse-cv', {
    method: 'POST',
    body: formData,
    schema: parsedCvSchema,
  })
}

export function importJobUrl(payload: { url: string; campaign_id?: string }) {
  return request('/job-posts/import-url', {
    method: 'POST',
    body: importJobUrlSchema.parse(payload),
    schema: importedJobSchema,
  })
}

export function importJobText(payload: {
  campaign_id: string
  job_title: string
  company_name: string
  job_description: string
}) {
  return request('/job-posts/import-text', {
    method: 'POST', body: importJobTextSchema.parse(payload), schema: importedJobSchema,
  })
}

export function runResumeAnalysis(payload: {
  resume_text: string
  job_description?: string
}) {
  return request('/resume/analyze', {
    method: 'POST',
    body: payload,
    schema: resumeResultSchema,
  })
}

export function runJobMatch(payload: {
  resume_text: string
  job_description: string
}) {
  return request('/job-match/match', {
    method: 'POST',
    body: payload,
    schema: jobMatchResultSchema,
  })
}

export function runCoverLetter(payload: {
  resume_text: string
  job_description: string
  tone?: string
  resume_analysis?: ResumeResult
  job_match?: JobMatchResult
}) {
  return request('/cover-letter/generate', {
    method: 'POST',
    body: payload,
    schema: coverLetterResultSchema,
  })
}

export function runInterview(payload: {
  resume_text: string
  job_description: string
  num_questions?: number
  resume_analysis?: ResumeResult
  job_match?: JobMatchResult
}) {
  return request('/interview/questions', {
    method: 'POST',
    body: payload,
    schema: interviewResultSchema,
  })
}

export function runInterviewPracticeFeedback(payload: {
  question: string
  user_answer: string
  model_answer?: string
}) {
  return request('/interview/practice-feedback', {
    method: 'POST',
    body: payload,
    schema: interviewPracticeFeedbackSchema,
  })
}

export function runCareer(payload: {
  resume_text: string
  target_role?: string
}) {
  return request('/career/recommend', {
    method: 'POST',
    body: payload,
    schema: careerResultSchema,
  })
}

export function runPortfolio(payload: {
  resume_text: string
  target_role: string
}) {
  return request('/portfolio/recommend', {
    method: 'POST',
    body: payload,
    schema: portfolioResultSchema,
  })
}

export function getHistory(params: HistoryQueryParams = {}) {
  const search = new URLSearchParams()
  if (params.tool) search.set('tool', params.tool)
  if (typeof params.favorite === 'boolean') {
    search.set('favorite', String(params.favorite))
  }
  if (params.q) search.set('q', params.q)
  search.set('page', String(params.page ?? 1))
  search.set('page_size', String(params.page_size ?? 12))

  return request(`/history?${search.toString()}`, {
    method: 'GET',
    schema: toolRunListSchema,
  })
}

export function getHistoryItem(historyId: string) {
  return request(`/history/${historyId}`, {
    method: 'GET',
    schema: toolRunDetailSchema,
  })
}

export function deleteHistoryItem(historyId: string) {
  return request(`/history/${historyId}`, {
    method: 'DELETE',
    schema: deletedResponseSchema,
  })
}

export function updateHistoryItem(historyId: string, label: string | null) {
  return request(`/history/${historyId}`, {
    method: 'PATCH',
    body: { label },
    schema: toolRunSummarySchema,
  })
}

export function setHistoryFavorite(historyId: string, isFavorite: boolean) {
  return request(`/history/${historyId}/favorite`, {
    method: 'PATCH',
    body: { is_favorite: isFavorite },
    schema: toolRunSummarySchema,
  })
}

export function getHistoryWorkspaces() {
  return request('/history/workspaces', {
    method: 'GET',
    schema: workspaceListSchema,
  })
}

export function updateHistoryWorkspace(
  workspaceId: string,
  payload: WorkspaceUpdate,
) {
  return request(`/history/workspaces/${workspaceId}`, {
    method: 'PATCH',
    body: workspaceUpdateSchema.parse(payload),
    schema: workspaceSummarySchema,
  })
}

export function getCampaign(workspaceId: string) {
  return request(`/history/workspaces/${workspaceId}`, {
    method: 'GET', schema: campaignDetailSchema,
  })
}

export function deleteCampaign(workspaceId: string) {
  return request(`/history/workspaces/${workspaceId}`, {
    method: 'DELETE', schema: deletedResponseSchema,
  })
}

export function updateCampaignMaterials(
  workspaceId: string,
  payload: CampaignMaterialSelection,
) {
  return request(`/history/workspaces/${workspaceId}/materials`, {
    method: 'PATCH', body: campaignMaterialSelectionSchema.parse(payload), schema: campaignDetailSchema,
  })
}

export function createCampaignTask(workspaceId: string, payload: { title: string; deadline?: string | null }) { return request(`/history/workspaces/${workspaceId}/tasks`, { method: 'POST', body: payload, schema: campaignTaskSchema }) }
export function updateCampaignTask(workspaceId: string, taskId: string, completed: boolean) { return request(`/history/workspaces/${workspaceId}/tasks/${taskId}`, { method: 'PATCH', body: { completed }, schema: campaignTaskSchema }) }
export function deleteCampaignTask(workspaceId: string, taskId: string) { return request(`/history/workspaces/${workspaceId}/tasks/${taskId}`, { method: 'DELETE', schema: deletedResponseSchema }) }
export function createCampaignNote(workspaceId: string, text: string) { return request(`/history/workspaces/${workspaceId}/notes`, { method: 'POST', body: { text }, schema: campaignNoteSchema }) }
export function deleteCampaignNote(workspaceId: string, noteId: string) { return request(`/history/workspaces/${workspaceId}/notes/${noteId}`, { method: 'DELETE', schema: deletedResponseSchema }) }
export function createCampaignContact(workspaceId: string, payload: { name: string; role?: string | null; channel?: string | null }) { return request(`/history/workspaces/${workspaceId}/contacts`, { method: 'POST', body: payload, schema: campaignContactSchema }) }
export function deleteCampaignContact(workspaceId: string, contactId: string) { return request(`/history/workspaces/${workspaceId}/contacts/${contactId}`, { method: 'DELETE', schema: deletedResponseSchema }) }
export function getCampaignReminders(workspaceId: string) { return request(`/history/workspaces/${workspaceId}/reminders`, { method: 'GET', schema: campaignReminderResponseSchema }) }
export function updateCampaignReminderConsent(workspaceId: string, enabled: boolean) { return request(`/history/workspaces/${workspaceId}/reminders`, { method: 'PATCH', body: { enabled }, schema: campaignReminderResponseSchema }) }
export function reviewCampaign(workspaceId: string) { return request(`/history/workspaces/${workspaceId}/review`, { method: 'POST', body: {}, schema: campaignReviewResponseSchema }) }

export function requestPasswordReset(payload: { email: string }) {
  return request<{ message: string }>('/auth/password-reset/request', {
    method: 'POST',
    body: payload,
  })
}

export function confirmPasswordReset(payload: { token: string; new_password: string }) {
  return request<{ message: string }>('/auth/password-reset/confirm', {
    method: 'POST',
    body: payload,
  })
}

export async function refreshToken(): Promise<void> {
  await request<unknown>('/auth/refresh', {
    method: 'POST',
    body: {},
  })
}

export function logout() {
  return request<{ ok: boolean }>('/auth/logout', {
    method: 'POST',
  })
}

export async function deleteAccount(confirmation: string): Promise<void> {
  // The confirmation string must match the authenticated user's email.
  // The backend re-validates it server-side so a direct API call cannot
  // bypass the typed-confirmation ceremony the Settings UI imposes.
  await request<unknown>('/auth/me/delete', {
    method: 'POST',
    body: { confirmation },
  })
}

// ── Application Approval Queue review surface (R15 #183) ──
// Every write is owner-scoped and audited server-side. Accept is refused (409) while
// any unresolved question remains (D-095); edit reopens materials under the existing
// diff/confirmation rules (D-073); pause halts preparation immediately (ADR 0009).

export function listPackets() {
  return request('/packets', { method: 'GET', schema: applicationPacketListSchema })
}

export function getQueueState() {
  return request('/packets/queue-state', { method: 'GET', schema: queueReviewStateSchema })
}

export function pauseQueue() {
  return request('/packets/pause', {
    method: 'POST',
    body: {},
    schema: queueReviewStateSchema,
  })
}

export function resumeQueue() {
  return request('/packets/resume', {
    method: 'POST',
    body: {},
    schema: queueReviewStateSchema,
  })
}

export function acceptPacket(packetId: string, expectedMaterialSha256: string) {
  // Accepting freezes the immutable R15 snapshot and returns only a manual handoff.
  return request(`/packets/${packetId}/accept`, {
    method: 'POST',
    body: packetApprovalRequestSchema.parse({
      expected_material_sha256: expectedMaterialSha256,
    }),
    schema: packetApprovalResultSchema,
  })
}

export function getPacketApprovalPreview(packetId: string) {
  return request(`/packets/${packetId}/approval-preview`, {
    method: 'GET',
    schema: packetApprovalPreviewSchema,
  })
}

export function skipPacket(packetId: string) {
  return request(`/packets/${packetId}/skip`, {
    method: 'POST',
    body: {},
    schema: applicationPacketItemSchema,
  })
}

export function rejectPacket(packetId: string) {
  return request(`/packets/${packetId}/reject`, {
    method: 'POST',
    body: {},
    schema: applicationPacketItemSchema,
  })
}

export function editPacket(packetId: string) {
  return request(`/packets/${packetId}/edit`, {
    method: 'POST',
    body: {},
    schema: applicationPacketItemSchema,
  })
}

export function answerPacketStopQuestion(
  packetId: string,
  payload: { field: string; answer: string },
) {
  return request(`/packets/${packetId}/stop-answers`, {
    method: 'POST',
    body: stopAnswerRequestSchema.parse(payload),
    schema: stopAnswerResultSchema,
  })
}
