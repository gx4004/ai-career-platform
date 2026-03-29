import { API_URL } from '#/lib/api/client'

const TELEMETRY_URL = `${API_URL}/telemetry/events`

export type TelemetryEventName =
  | 'tool_run_started'
  | 'tool_run_succeeded'
  | 'tool_run_failed'
  | 'result_page_loaded'
  | 'export_action_used'
  | 'workspace_resumed'
  | 'frontend_error'
  | 'tool_regenerate'
  | 'ad_shown'
  | 'ad_completed'
  | 'auth_signup_source'
  | 'workflow_continued'

type TelemetryPayload = {
  event_name: TelemetryEventName
  level?: 'info' | 'error'
  tool_id?: string
  history_id?: string
  access_mode?: 'authenticated' | 'guest_demo'
  route?: string
  workspace_id?: string
  saved?: boolean
  error_message?: string
  metadata?: Record<string, string | number | boolean | null | undefined>
}

export function trackTelemetry(payload: TelemetryPayload): void {
  if (typeof window === 'undefined') return

  const body = JSON.stringify({
    ...payload,
    route: payload.route || window.location.pathname,
    occurred_at: new Date().toISOString(),
  })

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' })
      navigator.sendBeacon(TELEMETRY_URL, blob)
      return
    }
  } catch {
    // Fall back to fetch below.
  }

  void fetch(TELEMETRY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {
    // Telemetry must never interrupt the user flow.
  })
}

export function captureAppError(
  error: Error | unknown,
  metadata: Record<string, string | number | boolean | null | undefined> = {},
): void {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Unknown frontend error'

  trackTelemetry({
    event_name: 'frontend_error',
    level: 'error',
    error_message: message,
    metadata,
  })
}
