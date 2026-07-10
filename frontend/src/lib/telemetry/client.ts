import { API_URL } from '#/lib/api/client'
import { getStoredConsent } from '#/lib/consent'

const TELEMETRY_URL = `${API_URL}/telemetry/events`

export type TelemetryEventName =
  | 'landing_page_viewed'
  | 'tool_run_started'
  | 'tool_run_succeeded'
  | 'tool_run_failed'
  | 'result_page_loaded'
  | 'export_action_used'
  | 'workspace_resumed'
  | 'frontend_error'
  | 'tool_regenerate'
  | 'auth_signup_source'
  | 'workflow_continued'
  | 'result_page_cache_miss'

type TelemetryPayload = {
  event_name: TelemetryEventName
  level?: 'info' | 'error'
  tool_id?: 'resume' | 'job-match' | 'career' | 'cover-letter' | 'interview' | 'portfolio'
  access_mode?: 'authenticated' | 'guest_demo'
  saved?: boolean
  failure_category?: 'tool_request_failed' | 'render_error' | 'route_error' | 'chunk_load_error'
  export_format?: 'txt' | 'md'
  has_feedback?: boolean
  session_status?: 'loading' | 'guest' | 'authenticated'
}

export function trackTelemetry(payload: TelemetryPayload): void {
  if (typeof window === 'undefined') return

  // Respect cookie consent — skip analytics if user declined
  if (getStoredConsent() === 'rejected') return

  const body = JSON.stringify({
    ...payload,
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
  _error: Error | unknown,
  context: {
    source: 'error-boundary' | 'route-error'
    failure_kind?: 'chunk-load' | 'generic-route'
  },
): void {
  trackTelemetry({
    event_name: 'frontend_error',
    level: 'error',
    failure_category:
      context.source === 'error-boundary'
        ? 'render_error'
        : context.failure_kind === 'chunk-load'
          ? 'chunk_load_error'
          : 'route_error',
  })
}
