import { z } from 'zod'
import { ApiError, apiErrorFromResponse, apiErrorFromZod, networkErrorFrom } from '#/lib/api/errors'
import { clearSessionHint, hasSessionHint, markSessionHint } from '#/lib/auth/sessionHint'
import { gapClassificationListResponseSchema } from '#/lib/api/gapClassificationSchemas'
import { gapResponseOfferSchema } from '#/lib/api/gapResponseSchemas'
import { discoverySourceSchema } from '#/lib/api/discoverySchemas'
import {
  authProvidersSchema,
  authSessionResponseSchema,
  changePasswordRequestSchema,
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
  discoveryDeepMatchSchema,
  discoveryListingDetailSchema,
  discoveryListingPageSchema,
  discoveryDismissalSchema,
  todayPlanSchema,
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
  passwordResetRequestResponseSchema,
  portfolioRequestSchema,
  profileUpdateRequestSchema,
  portfolioResultSchema,
  registerRequestSchema,
  resumeAnalyzeRequestSchema,
  resumeResultSchema,
  sessionStateSchema,
  toolRunDetailSchema,
  toolRunListSchema,
  toolRunSummarySchema,
  userSchema,
  workspaceListSchema,
  workspaceSummarySchema,
  workspaceUpdateSchema,
  applicationDetailSchema,
  applicationListSchema,
  whatsWorkingSchema,
  applicationDetailsSchema,
  applicationDetailsUpdateSchema,
  applicationPreferencesSchema,
  applicationPreferencesUpdateSchema,
  applicationReviewResponseSchema,
  applicationTaskSchema,
  applicationUpdateSchema,
  autofillRunStatusSchema,
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
  ApplicationDetailsUpdate,
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
    method: 'POST', body: parseRequest(cvDocumentCreateSchema, payload), schema: cvDocumentSchema,
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
    method: 'PATCH', body: parseRequest(cvDocumentUpdateSchema, payload), schema: cvDocumentSchema,
  })
}

export function snapshotCvVariant(documentId: string, name: string) {
  return request(`/cv-documents/${documentId}/variants`, {
    method: 'POST', body: parseRequest(cvVariantCreateSchema, { name, target_role: null }), schema: cvVariantSchema,
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
    method: 'POST', body: parseRequest(cvImportAcceptSchema, proposal), schema: cvDocumentSchema,
  })
}

/** The saved CV rendered in its saved style: exactly what Export downloads. */
export async function fetchCvArtifactBlob(documentId: string, format: 'docx' | 'pdf'): Promise<Blob> {
  const { blob } = await requestBlob(`/cv-documents/${encodeURIComponent(documentId)}/artifacts/${format}`)
  return blob
}

export function tailorCvDocument(documentId: string, payload: { job_title: string; job_description: string }) {
  return request(`/cv-documents/${documentId}/tailoring`, { method: 'POST', body: payload, schema: cvTailoringProposalSchema })
}

export function applyCvTailoring(documentId: string, payload: unknown) {
  return request(`/cv-documents/${documentId}/tailoring/apply`, { method: 'POST', body: parseRequest(cvTailoringApplySchema, payload), schema: cvVariantSchema })
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function resolveApiUrl(): string {
  const configuredUrl = import.meta.env.VITE_API_URL?.trim()
  if (configuredUrl) {
    return trimTrailingSlash(configuredUrl)
  }

  // Same origin. Dev: the Vite proxy forwards /api/v1 to the backend. Production: serve.mjs proxies /api/* when
  // API_PROXY_TARGET is set; without it, build with VITE_API_URL pointing at the API's own (cross-origin) URL.
  return '/api/v1'
}

export const API_URL = resolveApiUrl()

type RequestOptions<T> = Omit<RequestInit, 'body'> & {
  body?: RequestInit['body'] | Record<string, unknown>
  schema?: z.ZodType<T>
  /** Give up after this long; 3 minutes by default, for LLM calls. */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 180_000

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

/** The server refused the refresh token itself (as opposed to being slow, down or rate-limited). */
class RefreshRejected extends Error {}

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
  if (res.status === 401 || res.status === 403) throw new RefreshRejected('refresh rejected')
  if (!res.ok) throw new Error('refresh failed')
}

function refreshOnce(): Promise<void> {
  if (!refreshPromise) {
    refreshPromise = silentRefresh().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

// Paths whose 401 is an answer, not an expired session: a wrong password must not look like one.
const NO_REFRESH_PATHS = new Set(['/auth/refresh', '/auth/login'])

/**
 * fetch() with the app's session rules, shared by every call that needs the signed-in cookie (JSON requests,
 * file downloads): a dropped connection or a timeout becomes a NetworkError; a 401 triggers one silent refresh
 * and one retry, but only in a browser that has held a session (an anonymous visitor has nothing to refresh,
 * and would otherwise spend the shared refresh limit on every page view). The person is signed out only when
 * the refresh token itself is refused or the session already ended elsewhere (no hint left), never because
 * the refresh was slow, down or rate-limited.
 */
async function fetchWithSession(path: string, makeInit: () => RequestInit): Promise<Response> {
  const send = async () => {
    try {
      return await fetch(`${API_URL}${path}`, makeInit())
    } catch (error) {
      throw networkErrorFrom(error)
    }
  }

  const response = await send()
  if (response.status !== 401 || NO_REFRESH_PATHS.has(path)) return response
  if (!hasSessionHint()) {
    // Nothing to refresh. A tab that still shows a signed-in user (the hint went with a sign-out or a refused
    // refresh in another tab) must hear that its session ended; the session ignores this for a guest.
    dispatchSessionExpired()
    return response
  }

  // A refresh failed a moment ago without being refused (a refused one clears the hint above): it was slow,
  // down or rate-limited, so this 401 is answered as it is, without another refresh and without a sign-out.
  if (Date.now() < refreshCooldownUntil) return response
  try {
    await refreshOnce()
    // The refresh cookie was just renewed, so the hint lives as long as it does.
    markSessionHint()
  } catch (error) {
    refreshCooldownUntil = Date.now() + REFRESH_COOLDOWN_MS
    if (error instanceof RefreshRejected) {
      clearSessionHint()
      dispatchSessionExpired()
    }
    return response
  }
  const retried = await send()
  if (retried.status === 401) {
    clearSessionHint()
    dispatchSessionExpired()
  }
  return retried
}

/** Validate what is about to be sent; a mistake is an ApiError 422 with a sentence, not a Zod dump. */
function parseRequest<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload)
  if (result.success) return result.data
  throw apiErrorFromZod(result.error)
}

async function readBody(response: Response): Promise<unknown> {
  return response
    .clone()
    .json()
    .catch(async () => response.text().catch(() => ''))
}

export async function request<T>(
  path: string,
  options: RequestOptions<T> = {},
): Promise<T> {
  const { schema, timeoutMs = DEFAULT_TIMEOUT_MS, ...init } = options
  const headers = new Headers(init.headers || {})
  const body = normalizeBody(init.body as RequestInit['body'])

  if (body && !(body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetchWithSession(path, () => ({
    ...init,
    body,
    headers,
    credentials: 'include',
    signal: AbortSignal.timeout(timeoutMs),
  }))

  const parsed = await readBody(response)

  if (!response.ok) throw apiErrorFromResponse(response.status, parsed, response.headers)

  if (schema) {
    // Convert a Zod parse failure into an ApiError so downstream consumers can
    // rely on a uniform error shape (`.status`, `.detail`). A 200 with a body
    // that no longer matches the schema is a backend/frontend contract drift,
    // not a 4xx; surface it as 502 so users see "service issue" not "bad input".
    try {
      return schema.parse(parsed)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid response shape'
      throw new ApiError('Server returned an unexpected response', 502, message)
    }
  }

  return parsed as T
}

/** A file the signed-in cookie unlocks (PDF, DOCX), with the name the server suggested for it. */
export async function requestBlob(path: string): Promise<{ blob: Blob; filename: string | null }> {
  const response = await fetchWithSession(path, () => ({
    credentials: 'include',
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  }))
  if (!response.ok) throw apiErrorFromResponse(response.status, await readBody(response), response.headers)
  return { blob: await response.blob(), filename: filenameFromDisposition(response.headers?.get('Content-Disposition')) }
}

function filenameFromDisposition(header: string | null | undefined): string | null {
  if (!header) return null
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header)
  const plain = /filename="?([^";]+)"?/i.exec(header)
  const raw = encoded?.[1] ?? plain?.[1]
  if (!raw) return null
  try {
    const name = decodeURIComponent(raw).trim()
    // A name from a header is only ever a file name, never a path.
    return name && !/[\\/]/.test(name) ? name : null
  } catch {
    return null
  }
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
    body: parseRequest(loginRequestSchema, payload),
    schema: authSessionResponseSchema,
  })
}

export function register(payload: z.input<typeof registerRequestSchema>) {
  return request('/auth/register', {
    method: 'POST',
    body: parseRequest(registerRequestSchema, payload),
    schema: userSchema,
  })
}

export function getCurrentUser() {
  return request('/auth/me', {
    method: 'GET',
    schema: userSchema,
  })
}

/** The signed-in user or null for a guest: a 200 either way, never a 401 (and never a refresh). */
export function getSessionState() {
  return request('/auth/session', { method: 'GET', schema: sessionStateSchema })
}

/** Change the account's own name (null clears it); the answer is the updated user. */
export function updateMe(payload: z.input<typeof profileUpdateRequestSchema>) {
  return request('/auth/me', {
    method: 'PATCH',
    body: parseRequest(profileUpdateRequestSchema, payload),
    schema: userSchema,
  })
}

/** Ends every other session; this tab keeps going on the fresh cookies the answer sets. */
export async function changePassword(payload: z.input<typeof changePasswordRequestSchema>): Promise<void> {
  await request('/auth/change-password', {
    method: 'POST',
    body: parseRequest(changePasswordRequestSchema, payload),
    schema: authSessionResponseSchema,
  })
}

/** Admin: fetch one discovery source now. A failed fetch is still a 200; its outcome is on the source. */
export function retrySourceFetch(sourceId: string) {
  return request(`/admin/discovery-sources/${sourceId}/fetch`, {
    method: 'POST',
    schema: discoverySourceSchema,
    timeoutMs: 60_000,
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

// Today's best matches to add and the applications that need action.
export function getToday() {
  return request('/today', { method: 'GET', schema: todayPlanSchema })
}

export function getDiscoveryListing(listingId: string) {
  return request(`/discovery/listings/${encodeURIComponent(listingId)}`, {
    method: 'GET',
    schema: discoveryListingDetailSchema,
  })
}

// Runs Job Match on one listing with the owner's newest CV, once; a listing that
// already has a deep match returns it instead of running again.
export function startDiscoveryDeepMatch(listingId: string) {
  return request(`/discovery/listings/${encodeURIComponent(listingId)}/deep-match`, {
    method: 'POST',
    body: {},
    schema: discoveryDeepMatchSchema,
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
    method: 'POST', body: parseRequest(evidenceItemCreateSchema, payload), schema: evidenceItemSchema,
  })
}

export function updateEvidenceItem(
  itemId: string,
  payload: EvidenceItemUpdate,
) {
  return request(`/evidence-profile/items/${itemId}`, {
    method: 'PATCH', body: parseRequest(evidenceItemUpdateSchema, payload), schema: evidenceItemSchema,
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
    body: parseRequest(evidenceItemIdsSchema, { ids }),
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
    body: parseRequest(evidenceImportRequestSchema, { resume_text: resumeText }),
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
    body: parseRequest(importJobUrlSchema, payload),
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
    method: 'POST', body: parseRequest(importJobTextSchema, payload), schema: importedJobSchema,
  })
}

export function runResumeAnalysis(payload: z.input<typeof resumeAnalyzeRequestSchema>) {
  return request('/resume/analyze', {
    method: 'POST',
    body: parseRequest(resumeAnalyzeRequestSchema, payload),
    schema: resumeResultSchema,
  })
}

export function runJobMatch(payload: z.input<typeof jobMatchRequestSchema>) {
  return request('/job-match/match', {
    method: 'POST',
    body: parseRequest(jobMatchRequestSchema, payload),
    schema: jobMatchResultSchema,
  })
}

export function runCoverLetter(payload: z.input<typeof coverLetterRequestSchema>) {
  return request('/cover-letter/generate', {
    method: 'POST',
    body: parseRequest(coverLetterRequestSchema, payload),
    schema: coverLetterResultSchema,
  })
}

export function runInterview(payload: z.input<typeof interviewRequestSchema>) {
  return request('/interview/questions', {
    method: 'POST',
    body: parseRequest(interviewRequestSchema, payload),
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
    body: parseRequest(careerRequestSchema, payload),
    schema: careerResultSchema,
  })
}

export function runPortfolio(payload: z.input<typeof portfolioRequestSchema>) {
  return request('/portfolio/recommend', {
    method: 'POST',
    body: parseRequest(portfolioRequestSchema, payload),
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
    body: parseRequest(workspaceUpdateSchema, payload),
    schema: workspaceSummarySchema,
  })
}

// ── Applications (/applications): the board, one application, its apply flow ──

export function listApplications() {
  return request('/applications', { method: 'GET', schema: applicationListSchema })
}

export function getApplicationInsights() {
  return request('/applications/insights', { method: 'GET', schema: whatsWorkingSchema })
}

export function getApplication(applicationId: string) {
  return request(`/applications/${applicationId}`, { method: 'GET', schema: applicationDetailSchema })
}

export function updateApplication(applicationId: string, payload: ApplicationUpdate) {
  return request(`/applications/${applicationId}`, {
    method: 'PATCH',
    body: parseRequest(applicationUpdateSchema, payload),
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

/** Autopilot experiment: start filling the form in a local browser. Never submits. */
export function autofillApplication(applicationId: string) {
  return request(`/applications/${applicationId}/autofill`, {
    method: 'POST', body: {}, schema: autofillRunStatusSchema,
  })
}

export function getAutofillStatus(applicationId: string) {
  return request(`/applications/${applicationId}/autofill`, { method: 'GET', schema: autofillRunStatusSchema })
}

/** Cancel the run and close its browser window. */
export function cancelAutofill(applicationId: string) {
  return request(`/applications/${applicationId}/autofill`, { method: 'DELETE', schema: autofillRunStatusSchema })
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
    body: parseRequest(applicationPreferencesUpdateSchema, payload),
    schema: applicationPreferencesSchema,
  })
}

export function getApplicationDetails() {
  return request('/applications/details', { method: 'GET', schema: applicationDetailsSchema })
}

export function saveApplicationDetails(payload: ApplicationDetailsUpdate) {
  return request('/applications/details', {
    method: 'PUT',
    body: parseRequest(applicationDetailsUpdateSchema, payload),
    schema: applicationDetailsSchema,
  })
}

/** "Prepare applications for me": adopt and prepare the best matches, up to the cap. */
export function prepareApplicationsForMe() {
  return request('/applications/prepare', { method: 'POST', body: {}, schema: bulkPrepareResultSchema })
}

export function requestPasswordReset(payload: { email: string }) {
  return request('/auth/password-reset/request', {
    method: 'POST',
    body: payload,
    schema: passwordResetRequestResponseSchema,
  })
}

export function confirmPasswordReset(payload: z.input<typeof passwordResetConfirmRequestSchema>) {
  return request<{ message: string }>('/auth/password-reset/confirm', {
    method: 'POST',
    body: parseRequest(passwordResetConfirmRequestSchema, payload),
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
