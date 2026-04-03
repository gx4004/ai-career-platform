import type { ToolRunDetail } from '#/lib/api/schemas'
import { deriveRunMetadata } from '#/lib/tools/runMetadata'
import type { ToolId } from '#/lib/tools/registry'
import { tools } from '#/lib/tools/registry'

/**
 * In-memory transient result store for guest demo runs.
 *
 * Results are NEVER persisted to sessionStorage or any other storage.
 * They exist only in memory for the current page lifecycle. If the user
 * navigates away or closes the tab, results are gone — this is intentional
 * to drive signup conversion.
 */
const transientResults = new Map<string, ToolRunDetail>()

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
  return item
}

export function getTransientResult(demoId: string): ToolRunDetail | null {
  return transientResults.get(demoId) ?? null
}

export function clearTransientResults(): void {
  transientResults.clear()
}
