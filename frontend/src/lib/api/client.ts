import { z } from 'zod'
import { ApiError } from '#/lib/api/errors'
import { gapClassificationListResponseSchema } from '#/lib/api/gapClassificationSchemas'
import { gapResponseOfferSchema } from '#/lib/api/gapResponseSchemas'
import {
  authProvidersSchema,
  authSessionResponseSchema,
  careerRequestSchema,
  careerResultSchema,
  coverLetterRequestSchema,
  coverLetterResultSchema,
  deletedResponseSchema,
  evidenceItemListSchema,
  evidenceItemSchema,
  evidenceItemCreateSchema,
  evidenceItemUpdateSchema,
  evidenceImportRequestSchema,
  evidenceItemIdsSchema,
  discoveryListingPageSchema,
  discoveryDismissalSchema,
  healthCheckSchema,
  importedJobSchema,
  importJobTextSchema,
  importJobUrlSchema,
  interviewPracticeFeedbackSchema,
  interviewRequestSchema,
  interviewResultSchema,
  jobMatchRequestSchema,
  jobMatchResultSchema,
  loginRequestSchema,
  parsedCvSchema,
  passwordResetConfirmRequestSchema,
  portfolioRequestSchema,
  portfolioResultSchema,
  registerRequestSchema,
  resumeAnalyzeRequestSchema,
  resumeResultSchema,
  toolRunDetailSchema,
  toolRunListSchema,
  toolRunSummarySchema,
  userSchema,
  workspaceListSchema,
  workspaceSummarySchema,
  workspaceUpdateSchema,
  applicationDetailSchema,
  applicationListSchema,
  applicationPreferencesSchema,
  applicationPreferencesUpdateSchema,
  applicationReviewResponseSchema,
  applicationTaskSchema,
  applicationUpdateSchema,
  autofillReportSchema,
  bulkPrepareResultSchema,
  careerDataExportSchema,
  cvDocumentCreateSchema,
  cvDocumentListSchema,
  cvDocumentsExportSchema,
  cvDocumentSchema,
  cvDocumentUpdateSchema,
  cvVariantCreateSchema,
  cvVariantSchema,
  cvQualityResponseSchema,
  cvTailoringApplySchema,
  cvTailoringProposalSchema,
  cvStyleCatalogSchema,
  cvImportProposalSchema,
  cvImportAcceptSchema,
} from '#/lib/api/schemas'
import type {
  EvidenceItemCreate,
  EvidenceItemUpdate,
  CvDocumentCreate,
  CvDocumentUpdate,
  CvImportProposal,
  WorkspaceUpdate,
  ApplicationUpdate,
  ApplicationPreferencesUpdate,
} from '#/lib/api/schemas'

export function listCvDocuments() {
  return request('/cv-documents', { method: 'GET', schema: cvDocumentListSchema })
}

export function exportCvDocuments() {
  return request('/cv-documents/export', {
    method: 'GET',
    schema: cvDocumentsExportSchema,
  })
}

export function createCvDocument(payload: CvDocumentCreate) {
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

export function scoreCvDocument(documentId: string) {
  return request(`/cv-documents/${documentId}/quality`, {
    method: 'POST', body: {}, schema: cvQualityResponseSchema,
  })
}

export function getCvStyleCatalog() {
  return request('/cv-documents/style-catalog', { method: 'GET', schema: cvStyleCatalogSchema })
}

// Reviewed CV import: the server parses a PDF/DOCX into a proposal the person
// looks over, then accepting it creates the CV document (and stages any facts
// it found as unconfirmed Evidence).
export function proposeCvImport(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return request('/cv-documents/import/proposals', {
    method: 'POST', body: formData, schema: cvImportProposalSchema,
  })
}

export function acceptCvImport(proposal: CvImportProposal) {
  return request('/cv-documents/import/accept', {
    method: 'POST', body: cvImportAcceptSchema.parse(proposal), schema: cvDocumentSchema,
  })
}

/** The saved CV rendered in its saved style: exactly what Export downloads. */
export async function fetchCvArtifactBlob(documentId: string, format: 'docx' | 'pdf', retry = false): Promise<Blob> {
  const url = `${API_URL}/cv-documents/${encodeURIComponent(documentId)}/artifacts/${format}`
  const response = await fetch(url, {
    credentials: 'include', signal: AbortSignal.timeout(180_000),
  })
  if (response.status === 401 && !retry && Date.now() >= refreshCooldownUntil) {
    try {
      if (!refreshPromise) refreshPromise = silentRefresh()
      await refreshPromise
      refreshPromise = null
      return fetchCvArtifactBlob(documentId, format, true)
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

export async function request<T>(
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

// Auth endpoints don't parse response bodies. HttpOnly cookies set by the
// backend are the sole source of session truth.
export async function login(payload: z.input<typeof loginRequestSchema>): Promise<void> {
  await request('/auth/login', {
    method: 'POST',
    body: loginRequestSchema.parse(payload),
    schema: authSessionResponseSchema,
  })
}

export function register(payload: z.input<typeof registerRequestSchema>) {
  return request('/auth/register', {
    method: 'POST',
    body: registerRequestSchema.parse(payload),
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

export type DiscoveryListingQuery = {
  q?: string
  location?: string
  remote?: boolean
  company?: string
  posted_within_days?: number
  sort?: 'best_match' | 'newest'
  page?: number
  limit?: number
}

export function searchDiscoveryListings(query: DiscoveryListingQuery = {}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value))
  }
  const search = params.toString()
  return request(`/discovery/listings${search ? `?${search}` : ''}`, {
    method: 'GET',
    schema: discoveryListingPageSchema,
  })
}

// One explicit user action turns a visible recommendation into a saved
// application carrying the listing, its apply link and retrieval date.
export function adoptDiscoveryRecommendation(listingId: string) {
  return request(`/discovery/recommendations/${listingId}/adopt`, {
    method: 'POST',
    body: {},
    schema: applicationDetailSchema,
  })
}

// R14 #175 listing dismissals. Every write is owner-scoped server-side.
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

// Save one suggestion. Rejecting a suggestion is deleteEvidenceItem.
export function confirmEvidenceItem(itemId: string) {
  return request(`/evidence-profile/items/${itemId}/confirm`, {
    method: 'POST',
    schema: evidenceItemSchema,
  })
}

// Save several suggestions in one server commit.
export function confirmEvidenceItems(ids: string[]) {
  return request('/evidence-profile/items/confirm', {
    method: 'POST',
    body: evidenceItemIdsSchema.parse({ ids }),
    schema: evidenceItemListSchema,
  })
}

export function deleteEvidenceItem(itemId: string) {
  return request<void>(`/evidence-profile/items/${itemId}`, { method: 'DELETE' })
}

export function deleteEvidenceProfile() {
  return request<void>('/evidence-profile/items', { method: 'DELETE' })
}

export function exportCareerData() {
  return request('/evidence-profile/export', {
    method: 'GET',
    schema: careerDataExportSchema,
  })
}

// R11 (#146): extract facts from parsed resume text and store them as
// suggestions to review on the profile. Authenticated-only server-side.
export function importEvidenceFromResume(resumeText: string) {
  return request('/evidence-profile/import', {
    method: 'POST',
    body: evidenceImportRequestSchema.parse({ resume_text: resumeText }),
    schema: evidenceItemListSchema,
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

export function runResumeAnalysis(payload: z.input<typeof resumeAnalyzeRequestSchema>) {
  return request('/resume/analyze', {
    method: 'POST',
    body: resumeAnalyzeRequestSchema.parse(payload),
    schema: resumeResultSchema,
  })
}

export function runJobMatch(payload: z.input<typeof jobMatchRequestSchema>) {
  return request('/job-match/match', {
    method: 'POST',
    body: jobMatchRequestSchema.parse(payload),
    schema: jobMatchResultSchema,
  })
}

export function runCoverLetter(payload: z.input<typeof coverLetterRequestSchema>) {
  return request('/cover-letter/generate', {
    method: 'POST',
    body: coverLetterRequestSchema.parse(payload),
    schema: coverLetterResultSchema,
  })
}

export function runInterview(payload: z.input<typeof interviewRequestSchema>) {
  return request('/interview/questions', {
    method: 'POST',
    body: interviewRequestSchema.parse(payload),
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

export function runCareer(payload: z.input<typeof careerRequestSchema>) {
  return request('/career/recommend', {
    method: 'POST',
    body: careerRequestSchema.parse(payload),
    schema: careerResultSchema,
  })
}

export function runPortfolio(payload: z.input<typeof portfolioRequestSchema>) {
  return request('/portfolio/recommend', {
    method: 'POST',
    body: portfolioRequestSchema.parse(payload),
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

// ── Applications (/applications): the board, one application, its apply flow ──

export function listApplications() {
  return request('/applications', { method: 'GET', schema: applicationListSchema })
}

export function getApplication(applicationId: string) {
  return request(`/applications/${applicationId}`, { method: 'GET', schema: applicationDetailSchema })
}

export function updateApplication(applicationId: string, payload: ApplicationUpdate) {
  return request(`/applications/${applicationId}`, {
    method: 'PATCH',
    body: applicationUpdateSchema.parse(payload),
    schema: applicationDetailSchema,
  })
}

export function deleteApplication(applicationId: string) {
  return request(`/applications/${applicationId}`, { method: 'DELETE', schema: deletedResponseSchema })
}

/** Draft a cover letter and screening answers; list what only the owner can answer. */
export function prepareApplication(applicationId: string) {
  return request(`/applications/${applicationId}/prepare`, {
    method: 'POST', body: {}, schema: applicationDetailSchema,
  })
}

/** The full set of typed answers; a blank answer removes it. */
export function saveApplicationAnswers(applicationId: string, answers: Record<string, string>) {
  return request(`/applications/${applicationId}/answers`, {
    method: 'PUT', body: { answers }, schema: applicationDetailSchema,
  })
}

/** The owner applied on the employer's site: freezes what was sent. */
export function markApplicationApplied(applicationId: string) {
  return request(`/applications/${applicationId}/applied`, {
    method: 'POST', body: {}, schema: applicationDetailSchema,
  })
}

/** Autopilot experiment: fill the form in a local browser. Never submits. */
export function autofillApplication(applicationId: string) {
  return request(`/applications/${applicationId}/autofill`, {
    method: 'POST', body: {}, schema: autofillReportSchema,
  })
}

export function reviewApplication(applicationId: string) {
  return request(`/applications/${applicationId}/review`, {
    method: 'POST', body: {}, schema: applicationReviewResponseSchema,
  })
}

export function createApplicationTask(applicationId: string, payload: { title: string; deadline?: string | null }) {
  return request(`/applications/${applicationId}/tasks`, { method: 'POST', body: payload, schema: applicationTaskSchema })
}

export function updateApplicationTask(applicationId: string, taskId: string, completed: boolean) {
  return request(`/applications/${applicationId}/tasks/${taskId}`, {
    method: 'PATCH', body: { completed }, schema: applicationTaskSchema,
  })
}

export function deleteApplicationTask(applicationId: string, taskId: string) {
  return request(`/applications/${applicationId}/tasks/${taskId}`, { method: 'DELETE', schema: deletedResponseSchema })
}

export function classifyApplicationGaps(applicationId: string) {
  return request(`/applications/${applicationId}/gap-classifications`, {
    method: 'POST',
    body: {},
    schema: gapClassificationListResponseSchema,
  })
}

export function getApplicationGapResponse(applicationId: string, classificationId: string) {
  return request(
    `/applications/${applicationId}/gap-classifications/${classificationId}/response`,
    { method: 'GET', schema: gapResponseOfferSchema },
  )
}

export function getApplicationPreferences() {
  return request('/applications/preferences', { method: 'GET', schema: applicationPreferencesSchema })
}

export function saveApplicationPreferences(payload: ApplicationPreferencesUpdate) {
  return request('/applications/preferences', {
    method: 'PUT',
    body: applicationPreferencesUpdateSchema.parse(payload),
    schema: applicationPreferencesSchema,
  })
}

/** "Prepare applications for me": adopt and prepare the best matches, up to the cap. */
export function prepareApplicationsForMe() {
  return request('/applications/prepare', { method: 'POST', body: {}, schema: bulkPrepareResultSchema })
}

export function requestPasswordReset(payload: { email: string }) {
  return request<{ message: string }>('/auth/password-reset/request', {
    method: 'POST',
    body: payload,
  })
}

export function confirmPasswordReset(payload: z.input<typeof passwordResetConfirmRequestSchema>) {
  return request<{ message: string }>('/auth/password-reset/confirm', {
    method: 'POST',
    body: passwordResetConfirmRequestSchema.parse(payload),
  })
}

export async function refreshToken(): Promise<void> {
  await request('/auth/refresh', {
    method: 'POST',
    body: {},
    schema: authSessionResponseSchema,
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
