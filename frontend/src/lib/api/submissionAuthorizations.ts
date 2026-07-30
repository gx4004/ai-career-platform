import { API_URL } from '#/lib/api/client'
import { ApiError } from '#/lib/api/errors'
import {
  submissionAuthorizationListSchema,
  type SubmissionAuthorizationList,
} from '#/lib/api/submissionAuthorizationSchemas'
import {
  submissionSafetyStatusSchema,
  type SubmissionSafetyStatus,
} from '#/lib/api/submissionSafetySchemas'

export const SUBMISSION_AUTHORIZATIONS_QUERY_ROOT = [
  'submission-authorizations',
] as const

export function submissionAuthorizationQueryKey(userId: string) {
  return [...SUBMISSION_AUTHORIZATIONS_QUERY_ROOT, userId] as const
}

async function authorizationFetch(path: string, options: RequestInit = {}) {
  return fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    signal: AbortSignal.timeout(30_000),
  })
}

async function authorizationRequest(
  path: string,
  options: RequestInit = {},
): Promise<unknown> {
  let response = await authorizationFetch(path, options)
  if (response.status === 401) {
    const refresh = await authorizationFetch('/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }).catch(() => null)
    if (refresh?.ok) {
      response = await authorizationFetch(path, options)
    } else {
      window.dispatchEvent(new CustomEvent('cw:session-expired'))
    }
  }
  if (response.status === 204 && response.ok) return undefined
  const parsed = await response
    .clone()
    .json()
    .catch(async () => response.text().catch(() => ''))
  if (!response.ok) {
    const detail =
      typeof parsed === 'string'
        ? parsed
        : typeof parsed === 'object' && parsed && 'detail' in parsed
          ? String((parsed as Record<string, unknown>).detail)
          : undefined
    throw new ApiError(detail || 'Request failed', response.status, detail)
  }
  return parsed
}

export async function listSubmissionAuthorizations(): Promise<SubmissionAuthorizationList> {
  return submissionAuthorizationListSchema.parse(
    await authorizationRequest('/submission-authorizations', { method: 'GET' }),
  )
}

export async function revokeSubmissionAuthorization(grantId: string): Promise<void> {
  await authorizationRequest(
    `/submission-authorizations/${encodeURIComponent(grantId)}`,
    { method: 'DELETE' },
  )
}

export async function getSubmissionSafetyStatus(
  grantId: string,
): Promise<SubmissionSafetyStatus> {
  return submissionSafetyStatusSchema.parse(
    await authorizationRequest(
      `/submission-authorizations/${encodeURIComponent(grantId)}/safety`,
      { method: 'GET' },
    ),
  )
}
