import type { ToolRunDetail } from '#/lib/api/schemas'
import {
  canUseDOM,
  readSessionJson,
  removeSessionValuesByPrefix,
  writeSessionJson,
} from '#/lib/auth/storage'
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

/**
 * Guest results hold complete LLM output (resume text, job descriptions, and
 * generated letters). The guest flow renders one result at a time and can chain
 * at most the six registered tools before signup, so anything older than the six
 * most recent runs is unreachable in practice and is not worth retaining. The
 * cap bounds a long guest session that would otherwise accumulate every run.
 */
export const MAX_TRANSIENT_RESULTS = 6

/**
 * `Date.now()` alone collides when two runs land in the same millisecond, which
 * silently overwrites the earlier result and makes "oldest" ambiguous. Keeping
 * the sequence strictly increasing preserves the `{tool}-demo-{digits}` id shape
 * that `DEMO_ID_PATTERN` and the result routes depend on.
 */
let lastDemoSequence = 0

function nextDemoSequence(): number {
  lastDemoSequence = Math.max(Date.now(), lastDemoSequence + 1)
  return lastDemoSequence
}

function demoSequenceOf(id: string): number {
  const parsed = Number.parseInt(id.slice(id.lastIndexOf('-') + 1), 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function storedDemoIds(): string[] {
  if (!canUseDOM()) return []

  const ids: string[] = []
  for (let index = 0; index < window.sessionStorage.length; index += 1) {
    const key = window.sessionStorage.key(index)
    if (key?.startsWith(SESSION_KEY_PREFIX)) ids.push(key.slice(SESSION_KEY_PREFIX.length))
  }
  return ids
}

/** Oldest first, so eviction always drops the least recent run. */
function byAge(ids: string[]): string[] {
  return [...ids].sort(
    (left, right) => demoSequenceOf(left) - demoSequenceOf(right) || left.localeCompare(right),
  )
}

/**
 * Enforces the retention cap on both copies of the store. Storage is pruned by
 * its own key listing rather than from memory, so results left behind by an
 * earlier page load are pruned too.
 */
function pruneTransientResults(): void {
  try {
    const storedIds = byAge(storedDemoIds())
    for (const id of storedIds.slice(0, Math.max(0, storedIds.length - MAX_TRANSIENT_RESULTS))) {
      window.sessionStorage.removeItem(`${SESSION_KEY_PREFIX}${id}`)
    }
  } catch {
    // Sandboxed or private storage can reject access; the in-memory cap below
    // still bounds this page's copy.
  }

  const memoryIds = byAge([...transientResults.keys()])
  for (const id of memoryIds.slice(0, Math.max(0, memoryIds.length - MAX_TRANSIENT_RESULTS))) {
    transientResults.delete(id)
  }
}

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
  const demoId = `${toolId}-demo-${nextDemoSequence()}`

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

  // Retention is enforced on write: writes are the only thing that grows the
  // store, and pruning on read could drop the result the guest is looking at.
  pruneTransientResults()

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
  removeSessionValuesByPrefix(SESSION_KEY_PREFIX)
  transientResults.clear()
}
