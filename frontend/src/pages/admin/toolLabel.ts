import { Briefcase, ClipboardCheck, FileText } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { formatRunDate } from '#/components/dashboard/RunRow'
import type { Tone } from '#/components/kit/tone'
import { toolList, tools } from '#/lib/tools/registry'
import type { ToolId } from '#/lib/tools/registry'

/** Tool ids the backend records that the registry does not list (application drafts, the reviewer, CV tailoring). */
const EXTRA_TOOL_VISUALS: Record<string, { icon: LucideIcon }> = {
  'application-drafts': { icon: Briefcase },
  'application-reviewer': { icon: ClipboardCheck },
  'cv-tailoring': { icon: FileText },
}

/** Every tool id the run filter offers: the six tools, then the backend-only kinds, so no run is unreachable. */
export const ADMIN_TOOL_IDS: string[] = [...toolList.map((tool) => tool.id), ...Object.keys(EXTRA_TOOL_VISUALS)]

/** The tile of a tool: its own colour and icon, or a stone tile for the backend-only kinds (colour is never invented for them). */
export function toolVisual(id: string): { tone: Tone; icon: LucideIcon } {
  const known = tools[id as ToolId]
  if (known) return { tone: known.tone, icon: known.icon }
  return { tone: 'stone', icon: EXTRA_TOOL_VISUALS[id]?.icon ?? FileText }
}

/** Registry name for a tool id; backend-only ids fall back to "Application drafts". */
export function toolLabel(id: string): string {
  const known = tools[id as ToolId]
  if (known) return known.label
  const spaced = id.replace(/[-_]+/g, ' ').trim()
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : id
}

/** "Oct 3", or "Oct 3, 2025" outside the current year: the one date format of the app. */
export function adminDate(value: string | null | undefined) {
  return value ? formatRunDate(value) : ''
}

/** The date with its time, for rows that happen several times a day. */
export function adminDateTime(value: string | null | undefined) {
  if (!value) return ''
  const time = new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${formatRunDate(value)}, ${time}`
}

/** True when a run label already says which tool made it ("Job Match (75%)"), so the tool need not be repeated. */
export function labelNamesTool(label: string, toolId: string) {
  const text = label.toLowerCase()
  const known = tools[toolId as ToolId]
  return [toolLabel(toolId), known?.shortLabel].some((name) => name && text.includes(name.toLowerCase()))
}
