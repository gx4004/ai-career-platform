import { tools } from '#/lib/tools/registry'
import type { ToolId } from '#/lib/tools/registry'

/** Registry name for a tool id; backend-only ids fall back to "Application drafts". */
export function toolLabel(id: string): string {
  const known = tools[id as ToolId]
  if (known) return known.label
  const spaced = id.replace(/[-_]+/g, ' ').trim()
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : id
}
