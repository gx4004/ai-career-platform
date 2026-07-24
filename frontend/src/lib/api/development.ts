import type { z } from 'zod'
import { API_URL } from '#/lib/api/client'
import { ApiError } from '#/lib/api/errors'
import {
  developmentItemCreateSchema,
  developmentItemSchema,
  developmentItemUpdateSchema,
  developmentPlanResponseSchema,
  type DevelopmentItem,
  type DevelopmentPlanResponse,
} from '#/lib/api/developmentSchemas'

// R17 #199 development-plan client. Mirrors the sibling admin.ts feature client:
// its own owner-scoped fetch wrapper (single silent-refresh on 401) plus Zod
// validation of every response against the shared developmentSchemas. Request
// bodies are parsed through the same schemas so `null` (clear) vs. omitted
// (leave unchanged) is preserved end-to-end (D-112).

export type DevelopmentItemCreate = z.infer<typeof developmentItemCreateSchema>
export type DevelopmentItemUpdate = z.infer<typeof developmentItemUpdateSchema>

async function developmentFetch(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers || {})
  if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
    signal: AbortSignal.timeout(30_000),
  })
}

async function developmentRequest(path: string, options: RequestInit = {}): Promise<unknown> {
  let response = await developmentFetch(path, options)

  if (response.status === 401 && path !== '/auth/refresh') {
    const refreshResponse = await developmentFetch('/auth/refresh', {
      method: 'POST',
      body: '{}',
    }).catch(() => null)

    if (refreshResponse?.ok) {
      response = await developmentFetch(path, options)
    } else {
      window.dispatchEvent(new CustomEvent('cw:session-expired'))
    }
  }

  // 204 No Content (DELETE) carries no body to parse.
  if (response.status === 204) {
    if (!response.ok) throw new ApiError('Request failed', response.status)
    return undefined
  }

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

export async function getDevelopmentPlan(): Promise<DevelopmentPlanResponse> {
  const data = await developmentRequest('/development-plan', { method: 'GET' })
  return developmentPlanResponseSchema.parse(data)
}

export async function createDevelopmentItem(
  payload: DevelopmentItemCreate,
): Promise<DevelopmentItem> {
  const data = await developmentRequest('/development-plan', {
    method: 'POST',
    body: JSON.stringify(developmentItemCreateSchema.parse(payload)),
  })
  return developmentItemSchema.parse(data)
}

export async function updateDevelopmentItem(
  itemId: string,
  payload: DevelopmentItemUpdate,
): Promise<DevelopmentItem> {
  const data = await developmentRequest(`/development-plan/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(developmentItemUpdateSchema.parse(payload)),
  })
  return developmentItemSchema.parse(data)
}

export async function deleteDevelopmentItem(itemId: string): Promise<void> {
  await developmentRequest(`/development-plan/${itemId}`, { method: 'DELETE' })
}

// R17 #201: act on the proposal completion staged (D-113). Confirming makes it
// available to future tailoring/recommendations; declining hard-deletes it,
// leaving no trace in the Evidence Profile, while the item itself stays intact.

export async function confirmDevelopmentEvidence(itemId: string): Promise<DevelopmentItem> {
  const data = await developmentRequest(`/development-plan/${itemId}/confirm-evidence`, {
    method: 'POST',
  })
  return developmentItemSchema.parse(data)
}

export async function declineDevelopmentEvidence(itemId: string): Promise<DevelopmentItem> {
  const data = await developmentRequest(`/development-plan/${itemId}/decline-evidence`, {
    method: 'POST',
  })
  return developmentItemSchema.parse(data)
}
