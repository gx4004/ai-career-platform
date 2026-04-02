import { API_URL } from '#/lib/api/client'
import { getAuthToken } from '#/lib/auth/storage'
import { ApiError } from '#/lib/api/errors'

async function adminRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken()
  const headers = new Headers(options.headers || {})

  if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  })

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

  return parsed as T
}

function buildQs(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) qs.set(key, String(value))
  }
  const str = qs.toString()
  return str ? `?${str}` : ''
}

// Types matching backend/app/schemas/admin.py

export type AdminUserItem = {
  id: string
  email: string
  full_name: string | null
  is_active: boolean
  is_admin: boolean
  created_at: string | null
  run_count: number
}

export type AdminUserListResponse = {
  items: AdminUserItem[]
  total: number
  page: number
  page_size: number
}

export type AdminRunItem = {
  id: string
  user_id: string
  user_email: string | null
  tool_name: string
  label: string | null
  created_at: string | null
  has_parent: boolean
}

export type AdminRunListResponse = {
  items: AdminRunItem[]
  total: number
  page: number
  page_size: number
}

export type AdminRunDetail = AdminRunItem & {
  result_payload: Record<string, unknown>
  feedback_text: string | null
  workspace_id: string | null
}

export type AdminStats = {
  total_users: number
  total_runs: number
  runs_today: number
  active_users_7d: number
  runs_by_tool: Record<string, number>
}

export type AdminHealth = {
  database: string
  llm_provider: string
  llm_model: string
  cache_enabled: boolean
  cache_entries: number
  environment: string
}

// API functions

export function getAdminStats() {
  return adminRequest<AdminStats>('/admin/stats')
}

export function getAdminHealth() {
  return adminRequest<AdminHealth>('/admin/health')
}

export function getAdminUsers(params: { page?: number; page_size?: number; q?: string } = {}) {
  return adminRequest<AdminUserListResponse>(
    `/admin/users${buildQs({ page: params.page, page_size: params.page_size, q: params.q })}`,
  )
}

export function getAdminUser(userId: string) {
  return adminRequest<AdminUserItem & { recent_runs: AdminRunItem[] }>(`/admin/users/${userId}`)
}

export function setAdminStatus(userId: string, isAdmin: boolean) {
  return adminRequest<{ ok: boolean; is_admin: boolean }>(`/admin/users/${userId}/admin`, {
    method: 'PATCH',
    body: JSON.stringify({ is_admin: isAdmin }),
  })
}

export function getAdminRuns(
  params: { page?: number; page_size?: number; tool?: string; user_id?: string } = {},
) {
  return adminRequest<AdminRunListResponse>(
    `/admin/runs${buildQs({ page: params.page, page_size: params.page_size, tool: params.tool, user_id: params.user_id })}`,
  )
}

export function getAdminRun(runId: string) {
  return adminRequest<AdminRunDetail>(`/admin/runs/${runId}`)
}
