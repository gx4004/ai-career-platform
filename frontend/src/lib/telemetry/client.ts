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
  | 'generation_loader_abandoned'
  | 'result_page_cache_miss'

// The tool ids a browser may report. Deliberately narrower than the backend's
// full tool taxonomy: `application-packet` is generated only by the backend
// packet pipeline (backend/app/services/application_packets.py PACKET_TOOL_NAME)
// and no browser surface can start it, so accepting it here would let a client
// fabricate packet activation rows. The backend ingest contract validates
// against the matching narrow enum — `BrowserToolId` in
// backend/app/schemas/telemetry.py — and the two must agree member for member,
// which __tests__/toolIdContract.test.ts and the backend
// tests/test_telemetry_tool_id_contract.py both enforce against the real source.
//
// Kept as a runtime `as const` list so the type is derived from it, not restated
// beside it: the test can read this array, and a member added to only one side
// of the boundary fails a check instead of silently dropping or rejecting events.
export const BROWSER_TOOL_IDS = [
  'resume',
  'job-match',
  'career',
  'cover-letter',
  'interview',
  'portfolio',
  'application-reviewer',
] as const

export type BrowserToolId = (typeof BROWSER_TOOL_IDS)[number]

type TelemetryPayload = {
  event_name: TelemetryEventName
  level?: 'info' | 'error'
  tool_id?: BrowserToolId
  access_mode?: 'authenticated' | 'guest_demo'
  saved?: boolean
  failure_category?: 'tool_request_failed' | 'render_error' | 'route_error' | 'chunk_load_error'
  export_format?: 'txt' | 'md'
  has_feedback?: boolean
  session_status?: 'loading' | 'guest' | 'authenticated'
  duration_ms?: number
}

// Runtime allowlist of the fields that may leave the browser. TypeScript stops
// in-repo callers from adding fields, but a caller using a cast — or a future
// untyped call site — could otherwise spread resume text or other content into
// the request body. The backend already rejects unknown fields (extra="forbid"),
// but the guarantee that matters here is that such content never leaves the
// device in the first place; server-side rejection happens after transmission.
//
// `satisfies` makes every entry a checked key of TelemetryPayload, so a typo
// fails the build. A field added to the type but omitted here is dropped rather
// than sent — the fail-safe direction (a missing telemetry field, never a leak).
const ALLOWED_TELEMETRY_FIELDS = [
  'event_name',
  'level',
  'tool_id',
  'access_mode',
  'saved',
  'failure_category',
  'export_format',
  'has_feedback',
  'session_status',
  'duration_ms',
] as const satisfies readonly (keyof TelemetryPayload)[]

function buildTelemetryBody(payload: TelemetryPayload): string {
  const allowed = new Set<string>(ALLOWED_TELEMETRY_FIELDS)
  const filtered: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(payload)) {
    if (allowed.has(key) && value !== undefined) filtered[key] = value
  }
  // occurred_at is stamped here, not accepted from the caller, so it is added
  // after filtering rather than being part of the allowlist.
  filtered.occurred_at = new Date().toISOString()
  return JSON.stringify(filtered)
}

export function trackTelemetry(payload: TelemetryPayload): void {
  if (typeof window === 'undefined') return

  // Respect cookie consent — skip analytics if user declined
  if (getStoredConsent() === 'rejected') return

  const body = buildTelemetryBody(payload)

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
