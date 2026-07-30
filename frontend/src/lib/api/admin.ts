import { z } from 'zod'
import { API_URL } from '#/lib/api/client'
import {
  developmentResponseKindSchema,
  developmentStateSchema,
} from '#/lib/api/developmentSchemas'
import { ApiError } from '#/lib/api/errors'
import { gapKindSchema } from '#/lib/api/gapClassificationSchemas'
import {
  discoverySourceListSchema,
  discoverySourceSchema,
  submissionSourceGovernanceSchema,
  type DiscoverySource,
  type DiscoverySourceList,
} from '#/lib/api/discoverySchemas'
import {
  adminDiscoveryReportListSchema,
  type AdminDiscoveryReportList,
} from '#/lib/api/schemas'
import {
  adminSubmissionSafetySchema,
  submissionSafetyControlSchema,
  submissionSafetyPolicyConfigSchema,
  submissionSafetyPolicySchema,
  type AdminSubmissionSafety,
  type SubmissionIncidentRehearsalInput,
  type SubmissionSafetyControl,
  type SubmissionSafetyPolicy,
  type SubmissionSafetyPolicyConfig,
} from '#/lib/api/submissionSafetySchemas'

export type { DiscoverySource, DiscoverySourceList } from '#/lib/api/discoverySchemas'

async function adminFetch(path: string, options: RequestInit = {}) {
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

async function adminRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response = await adminFetch(path, options)

  if (response.status === 401 && path !== '/auth/refresh') {
    const refreshResponse = await adminFetch('/auth/refresh', {
      method: 'POST',
      body: '{}',
    }).catch(() => null)

    if (refreshResponse?.ok) {
      response = await adminFetch(path, options)
    } else {
      window.dispatchEvent(new CustomEvent('cw:session-expired'))
    }
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

// R6 activation dashboard — mirrors backend/app/schemas/admin.py
// (FunnelStepCount / FailureCategoryCount / ToolLatencyCost / AdminActivationResponse).

export type AdminAccessMode = 'authenticated' | 'guest_demo'

export type FunnelStepCount = {
  step: string
  label: string
  count: number
}

export type FailureCategoryCount = {
  failure_category: string
  count: number
}

export type ToolLatencyCost = {
  tool_id: string
  runs: number
  avg_duration_ms: number | null
  total_cost_estimate: number | string | null
  avg_cost_estimate: number | string | null
}

export type AdminActivation = {
  window_start: string
  window_end: string
  access_mode: AdminAccessMode | null
  funnel: FunnelStepCount[]
  failures: FailureCategoryCount[]
  tools: ToolLatencyCost[]
}

// R8 eval runs — mirrors backend/app/schemas/admin.py
// (EvalRunItem / AdminEvalRunsResponse). Latest report per tool read from disk
// (app/evals/reports/), never analytics_events (D-045).

export type EvalRunItem = {
  tool_id: string
  has_report: boolean
  report_schema_version: string | null
  prompt_version: string | null
  judge_prompt_version: string | null
  generated_at: string | null
  mode: string | null
  fixtures_evaluated: number | null
  calibration_miss_rate: number | null
  fabrication_candidate_count: number | null
  usefulness_score: number | null
}

export type AdminEvalRuns = {
  tools: EvalRunItem[]
}

// R11 profile-adoption view — mirrors backend/app/schemas/admin.py
// (ProfileKindCount / ProfileProvenanceCount / ProfileTransitionCount /
// AdminProfileAdoptionResponse). Read-only aggregate over the same first-party
// analytics store; every figure is a bounded low-cardinality count derived from
// allowlisted profile events — no evidence content is reachable (D-067).

export type ProfileKindCount = {
  kind: string
  count: number
}

export type ProfileProvenanceCount = {
  provenance: string
  count: number
}

export type ProfileTransitionCount = {
  transition: string
  count: number
}

export type AdminProfileAdoption = {
  window_start: string
  window_end: string
  total_created: number
  total_deleted: number
  created_by_kind: ProfileKindCount[]
  created_by_provenance: ProfileProvenanceCount[]
  confirmation_transitions: ProfileTransitionCount[]
}

export const adminDevelopmentLoopSchema = z.strictObject({
  window_start: z.iso.datetime({ offset: true }),
  window_end: z.iso.datetime({ offset: true }),
  total_items_created: z.number().int().nonnegative(),
  total_items_deleted: z.number().int().nonnegative(),
  total_state_transitions: z.number().int().nonnegative(),
  created_by_gap_kind: z.array(
    z.strictObject({
      gap_kind: gapKindSchema,
      count: z.number().int().nonnegative(),
    }),
  ),
  created_by_response_kind: z.array(
    z.strictObject({
      response_kind: developmentResponseKindSchema,
      count: z.number().int().nonnegative(),
    }),
  ),
  state_transitions: z.array(
    z.strictObject({
      from_state: developmentStateSchema,
      to_state: developmentStateSchema,
      count: z.number().int().nonnegative(),
    }),
  ),
})
export type AdminDevelopmentLoop = z.infer<typeof adminDevelopmentLoopSchema>

// R10 scaling-trigger scorecard — mirrors backend/app/schemas/admin.py
// (ScorecardTrigger / AdminScorecardResponse). Read-only aggregate over the
// same first-party operational store; a fired trigger sets review_required and
// links its deferred response ticket — the scorecard never enables a response.

export type TriggerState = 'fired' | 'not_fired' | 'insufficient_sample'

export type ScorecardTrigger = {
  id: string
  label: string
  threshold: string
  observation_window: string
  minimum_sample: string
  evidence: string
  evidence_detail: Record<string, number | string>
  evidence_fresh: boolean
  last_evidence_at: string | null
  state: TriggerState
  review_required: boolean
  response_ticket: number
  response_ticket_title: string
  owner: string
  rollback: string
  exit_criteria: string
}

export type AdminScorecard = {
  generated_at: string
  window_start: string
  window_end: string
  replica_class: string
  triggers: ScorecardTrigger[]
}

// R14 per-source health — mirrors backend/app/schemas/admin.py
// (SourceFamilyHealth / AdminSourceHealthResponse). Read-only aggregate over the
// same first-party operational path; every figure is a bounded per-source-family
// count — no listing content, full URL, source key/name, or user data (D-053).

export type SourceFamilyHealth = {
  source_family: string
  source_count: number
  active_count: number
  killed_count: number
  pending_terms_count: number
  listing_count: number
  stale_count: number
  oldest_retrieved_at: string | null
  newest_retrieved_at: string | null
  fetch_success: number
  fetch_failure: number
  fetch_blocked: number
  ingested: number
  deduplicated: number
  expired: number
}

export type AdminSourceHealth = {
  window_start: string
  window_end: string
  staleness_threshold_days: number
  families: SourceFamilyHealth[]
}

export const submissionFamilyQualitySchema = z.strictObject({
  source_family: z.enum([
    'licensed',
    'employer_ats',
    'public_career_page',
    'user_provided',
  ]),
  evidence_base: z.number().int().nonnegative(),
  response_rate: z.number().min(0).max(1).nullable(),
  packet_edit_rate: z.number().min(0).max(1).nullable(),
  duplicate_prevention_rate: z.number().min(0).max(1).nullable(),
  complaint_rate: z.number().min(0).max(1).nullable(),
})

export const adminSubmissionQualitySchema = z.strictObject({
  window_start: z.iso.datetime({ offset: true }),
  window_end: z.iso.datetime({ offset: true }),
  families: z.array(submissionFamilyQualitySchema),
})

export type SubmissionFamilyQuality = z.infer<typeof submissionFamilyQualitySchema>
export type AdminSubmissionQuality = z.infer<typeof adminSubmissionQualitySchema>

// R15 packet-queue trust-chain gate — mirrors backend/app/schemas/admin.py
// (AdminPacketGateResponse). Read-only aggregate over the same first-party
// operational path; only the current halt posture + bounded gate-event counts —
// no packet content, listing text/id, run id, finding text, or user data (D-097).
export type AdminPacketGate = {
  window_start: string
  window_end: string
  halted: boolean
  halt_reason: string | null
  halted_since: string | null
  gate_running: number
  gate_passed: number
  gate_blocked: number
  pipeline_halted: number
  pipeline_cleared: number
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

export function getAdminActivation(
  params: { access_mode?: AdminAccessMode; start?: string; end?: string } = {},
) {
  return adminRequest<AdminActivation>(
    `/admin/activation${buildQs({
      access_mode: params.access_mode,
      start: params.start,
      end: params.end,
    })}`,
  )
}

export function getAdminEvalRuns() {
  return adminRequest<AdminEvalRuns>('/admin/eval-runs')
}

export function getAdminScorecard() {
  return adminRequest<AdminScorecard>('/admin/scorecard')
}

export function getAdminProfileAdoption(
  params: { start?: string; end?: string } = {},
) {
  return adminRequest<AdminProfileAdoption>(
    `/admin/profile-adoption${buildQs({ start: params.start, end: params.end })}`,
  )
}

export async function getAdminDevelopmentLoop(
  params: { start?: string; end?: string } = {},
) {
  const response = await adminRequest<unknown>(
    `/admin/development-loop${buildQs({ start: params.start, end: params.end })}`,
  )
  return adminDevelopmentLoopSchema.parse(response)
}

export async function getAdminDiscoverySources(): Promise<DiscoverySourceList> {
  const response = await adminRequest<unknown>('/admin/discovery-sources')
  return discoverySourceListSchema.parse(response)
}

export async function getAdminDiscoveryReports(): Promise<AdminDiscoveryReportList> {
  const response = await adminRequest<unknown>('/admin/discovery-reports')
  return adminDiscoveryReportListSchema.parse(response)
}

export function getAdminSourceHealth(params: { start?: string; end?: string } = {}) {
  return adminRequest<AdminSourceHealth>(
    `/admin/source-health${buildQs({ start: params.start, end: params.end })}`,
  )
}

export async function getAdminSubmissionQuality(
  params: { start?: string; end?: string } = {},
) {
  const response = await adminRequest<unknown>(
    `/admin/submission-quality${buildQs({ start: params.start, end: params.end })}`,
  )
  return adminSubmissionQualitySchema.parse(response)
}

export function getAdminPacketGate(params: { start?: string; end?: string } = {}) {
  return adminRequest<AdminPacketGate>(
    `/admin/packet-gate${buildQs({ start: params.start, end: params.end })}`,
  )
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

export async function getAdminSubmissionSafety(): Promise<AdminSubmissionSafety> {
  return adminSubmissionSafetySchema.parse(
    await adminRequest<unknown>('/admin/submission-safety'),
  )
}

export async function setGlobalSubmissionKillSwitch(
  tripped: boolean,
): Promise<SubmissionSafetyControl> {
  const response = await adminRequest<unknown>(
    `/admin/submission-safety/global-kill-switch${buildQs({ tripped: String(tripped) })}`,
    { method: 'POST' },
  )
  return submissionSafetyControlSchema.parse(response)
}

export async function recordSubmissionIncidentRehearsal(
  rehearsal: SubmissionIncidentRehearsalInput,
): Promise<SubmissionSafetyControl> {
  const response = await adminRequest<unknown>('/admin/submission-safety/rehearsal', {
    method: 'POST',
    body: JSON.stringify(rehearsal),
  })
  return submissionSafetyControlSchema.parse(response)
}

export async function configureSourceSubmissionSafety(
  sourceId: string,
  config: SubmissionSafetyPolicyConfig,
): Promise<SubmissionSafetyPolicy> {
  const response = await adminRequest<unknown>(
    `/admin/discovery-sources/${sourceId}/submission-safety`,
    {
      method: 'PUT',
      body: JSON.stringify(submissionSafetyPolicyConfigSchema.parse(config)),
    },
  )
  return submissionSafetyPolicySchema.parse(response)
}

export async function setSubmissionSourceKillSwitch(
  sourceId: string,
  tripped: boolean,
) {
  const response = await adminRequest<unknown>(
    `/admin/discovery-sources/${sourceId}/submission-kill-switch${buildQs({ tripped: String(tripped) })}`,
    { method: 'POST' },
  )
  return submissionSourceGovernanceSchema.parse(response)
}
