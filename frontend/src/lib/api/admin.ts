import { z } from 'zod'
import { request } from '#/lib/api/client'
import {
  discoverySourceListSchema,
  discoverySourceSchema,
  type DiscoverySource,
  type DiscoverySourceList,
} from '#/lib/api/discoverySchemas'

export type { DiscoverySource, DiscoverySourceList } from '#/lib/api/discoverySchemas'

// Admin calls follow the same session and failure rules as every other request; they are cheap, so they give up sooner.
function adminRequest<T>(path: string, options: RequestInit = {}, schema?: z.ZodType<T>): Promise<T> {
  return request<T>(path, { ...options, schema, timeoutMs: 30_000 })
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
  // Last admin-role change; role_changed_by is the acting admin's email (null once deleted).
  role_changed_at: string | null
  role_changed_by: string | null
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

/** One UTC day of the run series: `date` is YYYY-MM-DD. */
export type AdminRunsOnDay = { date: string; count: number }

export type AdminStats = {
  total_users: number
  total_runs: number
  runs_today: number
  active_users_7d: number
  runs_by_tool: Record<string, number>
  // The last 14 UTC days, oldest first, today last, days without runs as 0.
  runs_by_day: AdminRunsOnDay[]
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

export function getAdminUsers(
  params: { page?: number; page_size?: number; q?: string; is_admin?: boolean } = {},
) {
  return adminRequest<AdminUserListResponse>(
    `/admin/users${buildQs({
      page: params.page,
      page_size: params.page_size,
      q: params.q,
      is_admin: params.is_admin === undefined ? undefined : String(params.is_admin),
    })}`,
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

export async function getAdminDiscoverySources(): Promise<DiscoverySourceList> {
  const response = await adminRequest<unknown>('/admin/discovery-sources')
  return discoverySourceListSchema.parse(response)
}

export async function setDiscoverySourceKillSwitch(
  sourceId: string,
  tripped: boolean,
): Promise<DiscoverySource> {
  // `tripped` is a bool query param (see backend operate_kill_switch): the admin
  // router's rate-limited endpoints cannot resolve a Pydantic request body under
  // `from __future__ import annotations`, so the action is carried on the query.
  const response = await adminRequest<unknown>(
    `/admin/discovery-sources/${sourceId}/kill-switch${buildQs({ tripped: String(tripped) })}`,
    { method: 'POST' },
  )
  return discoverySourceSchema.parse(response)
}
