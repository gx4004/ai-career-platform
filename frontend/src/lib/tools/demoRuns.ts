import type { ToolRunDetail } from '#/lib/api/schemas'
import { readSessionJson, removeSessionValue, writeSessionJson } from '#/lib/auth/storage'
import { deriveRunMetadata } from '#/lib/tools/runMetadata'
import type { ToolId } from '#/lib/tools/registry'
import { tools } from '#/lib/tools/registry'

const DEMO_RUN_PREFIX = 'career-workbench:demo-run:'
const DEMO_RUN_TTL_MS = 2 * 60 * 60 * 1000

export function storeDemoRun(
  toolId: ToolId,
  result: Record<string, unknown>,
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
    metadata: deriveRunMetadata(toolId, result),
    result_payload: result,
  }

  writeSessionJson(getDemoRunKey(demoId), {
    expiresAt: Date.now() + DEMO_RUN_TTL_MS,
    item,
  })

  return item
}

export function readDemoRun(demoId: string): ToolRunDetail | null {
  const payload = readSessionJson<{ expiresAt: number; item: ToolRunDetail }>(
    getDemoRunKey(demoId),
  )
  if (!payload) return null
  if (Date.now() > payload.expiresAt) {
    removeSessionValue(getDemoRunKey(demoId))
    return null
  }
  return payload.item
}

export function clearDemoRuns(): void {
  if (typeof window === 'undefined') return

  const keys: string[] = []
  for (let index = 0; index < window.sessionStorage.length; index += 1) {
    const key = window.sessionStorage.key(index)
    if (key?.startsWith(DEMO_RUN_PREFIX)) {
      keys.push(key)
    }
  }

  for (const key of keys) {
    removeSessionValue(key)
  }
}

function getDemoRunKey(demoId: string): string {
  return `${DEMO_RUN_PREFIX}${demoId}`
}
