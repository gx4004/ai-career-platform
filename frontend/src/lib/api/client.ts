import type { z } from 'zod'
import { ApiError } from '#/lib/api/errors'
import {
  authProvidersSchema,
  careerResultSchema,
  coverLetterResultSchema,
  deletedResponseSchema,
  healthCheckSchema,
  importedJobSchema,
  interviewPracticeFeedbackSchema,
  interviewResultSchema,
  jobMatchResultSchema,
  parsedCvSchema,
  portfolioResultSchema,
  resumeResultSchema,
  tokenSchema,
  toolRunDetailSchema,
  toolRunListSchema,
  toolRunSummarySchema,
  userSchema,
  workspaceListSchema,
  workspaceSummarySchema,
} from '#/lib/api/schemas'
import type { JobMatchResult, ResumeResult } from '#/lib/api/schemas'
import { clearAuthToken, getAuthToken, setAuthToken } from '#/lib/auth/storage'

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
let refreshPromise: Promise<string> | null = null

async function silentRefresh(): Promise<string> {
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    credentials: 'include',
  })
  if (!res.ok) throw new Error('refresh failed')
  const data = await res.json()
  const newToken: string = data.access_token
  setAuthToken(newToken)
  return newToken
}

async function request<T>(
  path: string,
  options: RequestOptions<T> = {},
  _isRetry = false,
): Promise<T> {
  const token = getAuthToken()
  const headers = new Headers(options.headers || {})
  const body = normalizeBody(options.body as RequestInit['body'])

  if (body && !(body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
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
    if (response.status === 401 && !_isRetry && path !== '/auth/refresh') {
      try {
        if (!refreshPromise) {
          refreshPromise = silentRefresh()
        }
        await refreshPromise
        refreshPromise = null
        return request(path, options, true)
      } catch {
        refreshPromise = null
        clearAuthToken()
        if (token) {
          window.dispatchEvent(new CustomEvent('cw:session-expired'))
        }
      }
    } else if (response.status === 401 && token) {
      clearAuthToken()
      window.dispatchEvent(new CustomEvent('cw:session-expired'))
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
    return options.schema.parse(parsed)
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

export function login(payload: { email: string; password: string }) {
  return request('/auth/login', {
    method: 'POST',
    body: payload,
    schema: tokenSchema,
  })
}

export function register(payload: {
  email: string
  password: string
  full_name?: string
  captcha_token?: string
}) {
  return request('/auth/register', {
    method: 'POST',
    body: { ...payload, tos_accepted: true },
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

export function parseCv(file: File) {
  const formData = new FormData()
  formData.append('file', file)

  return request('/files/parse-cv', {
    method: 'POST',
    body: formData,
    schema: parsedCvSchema,
  })
}

export function importJobUrl(payload: { url: string }) {
  return request('/job-posts/import-url', {
    method: 'POST',
    body: payload,
    schema: importedJobSchema,
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
  payload: {
    label?: string | null
    is_pinned?: boolean
  },
) {
  return request(`/history/workspaces/${workspaceId}`, {
    method: 'PATCH',
    body: payload,
    schema: workspaceSummarySchema,
  })
}

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

export function refreshToken() {
  return request('/auth/refresh', {
    method: 'POST',
    body: {},
    schema: tokenSchema,
  })
}

export function logout() {
  return request<{ ok: boolean }>('/auth/logout', {
    method: 'POST',
  })
}
