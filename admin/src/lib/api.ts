const API_URL = '/api/v1'

function getToken(): string | null {
  return localStorage.getItem('admin_token')
}

export function setToken(token: string) {
  localStorage.setItem('admin_token', token)
}

export function clearToken() {
  localStorage.removeItem('admin_token')
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> || {}),
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `Request failed: ${res.status}`)
  }

  return res.json()
}

// Auth
export const login = (email: string, password: string) =>
  request<{ access_token: string; refresh_token: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })

export const getMe = () =>
  request<{ id: string; email: string; is_admin?: boolean }>('/auth/me')

// Admin endpoints
export const getStats = () => request<{
  total_users: number
  total_runs: number
  runs_today: number
  active_users_7d: number
  runs_by_tool: Record<string, number>
}>('/admin/stats')

export const getAdminHealth = () => request<{
  database: string
  llm_provider: string
  llm_model: string
  cache_enabled: boolean
  cache_entries: number
  environment: string
}>('/admin/health')

export const getUsers = (params: { page?: number; page_size?: number; q?: string } = {}) => {
  const qs = new URLSearchParams()
  if (params.page) qs.set('page', String(params.page))
  if (params.page_size) qs.set('page_size', String(params.page_size))
  if (params.q) qs.set('q', params.q)
  return request<{
    items: Array<{
      id: string; email: string; full_name: string | null
      is_active: boolean; is_admin: boolean; created_at: string | null; run_count: number
    }>
    total: number; page: number; page_size: number
  }>(`/admin/users?${qs}`)
}

export const getRuns = (params: { page?: number; page_size?: number; tool?: string; user_id?: string } = {}) => {
  const qs = new URLSearchParams()
  if (params.page) qs.set('page', String(params.page))
  if (params.page_size) qs.set('page_size', String(params.page_size))
  if (params.tool) qs.set('tool', params.tool)
  if (params.user_id) qs.set('user_id', params.user_id)
  return request<{
    items: Array<{
      id: string; user_id: string; user_email: string | null
      tool_name: string; label: string | null; created_at: string | null; has_parent: boolean
    }>
    total: number; page: number; page_size: number
  }>(`/admin/runs?${qs}`)
}

export const getRun = (id: string) => request<{
  id: string; user_id: string; user_email: string | null
  tool_name: string; label: string | null; created_at: string | null
  result_payload: Record<string, unknown>; feedback_text: string | null
}>(`/admin/runs/${id}`)

export const setUserAdmin = (userId: string, isAdmin: boolean) =>
  request<{ ok: boolean }>(`/admin/users/${userId}/admin`, {
    method: 'PATCH',
    body: JSON.stringify({ is_admin: isAdmin }),
  })
