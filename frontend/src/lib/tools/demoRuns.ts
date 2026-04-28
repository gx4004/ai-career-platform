import type { ToolRunDetail } from '#/lib/api/schemas'
import { readSessionJson, removeSessionValue, writeSessionJson } from '#/lib/auth/storage'
import { deriveRunMetadata } from '#/lib/tools/runMetadata'
import type { ToolId } from '#/lib/tools/registry'
import { tools } from '#/lib/tools/registry'

/**
 * Transient result store for guest demo runs.
 *
 * Primary store is an in-memory Map for speed. Results are also persisted
 * to sessionStorage so they survive page refresh (tab-scoped, cleared on
 * tab close). This prevents the "Result unavailable" error when a guest
 * refreshes the result page.
 */
const transientResults = new Map<string, ToolRunDetail>()
const SESSION_KEY_PREFIX = 'cw:demo-result:'
const DEMO_ID_PATTERN = /^[a-z][a-z-]*-demo-\d+$/

export function isDemoHistoryId(id: string): boolean {
  return DEMO_ID_PATTERN.test(id)
}

export function setTransientResult(
  toolId: ToolId,
  result: Record<string, unknown>,
  parentRunId?: string,
): ToolRunDetail {
  const generatedAt =
    typeof result.generated_at === 'string' ? result.generated_at : new Date().toISOString()
  const demoId = `${toolId}-demo-${Date.now()}`

  const item: ToolRunDetail = {
    id: demoId,
    tool_name: toolId,
    label: `${tools[toolId].shortLabel} demo`,
    is_favorite: false,
    created_at: generatedAt,
    saved: false,
    access_mode: 'guest_demo',
    locked_actions: ['save', 'favorite', 'continue', 'history'],
    parent_run_id: parentRunId ?? null,
    metadata: deriveRunMetadata(toolId, result),
    result_payload: result,
  }

  transientResults.set(demoId, item)

  // Persist to sessionStorage so guest results survive page refresh
  try {
    writeSessionJson(`${SESSION_KEY_PREFIX}${demoId}`, item)
  } catch {
    // sessionStorage full or unavailable — in-memory only
  }

  return item
}

export function getTransientResult(demoId: string): ToolRunDetail | null {
  // Fast path: in-memory
  const memoryResult = transientResults.get(demoId) ?? null
  if (memoryResult) return memoryResult

  // Fallback: sessionStorage (survives page refresh)
  const stored = readSessionJson<ToolRunDetail>(`${SESSION_KEY_PREFIX}${demoId}`)
  if (stored) {
    transientResults.set(demoId, stored)
    return stored
  }

  return null
}

export function clearTransientResults(): void {
  for (const key of transientResults.keys()) {
    removeSessionValue(`${SESSION_KEY_PREFIX}${key}`)
  }
  transientResults.clear()
}
