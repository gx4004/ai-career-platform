import type { LucideIcon } from 'lucide-react'
import { getNavDestination } from '#/lib/navigation/navGroups'
import { getToolByHistoryName } from '#/lib/tools/registry'

export type HistoryRunPresentation = {
  label: string
  /** Short label for compact badges. */
  shortLabel: string
  icon: LucideIcon | null
  accent: string
  route: string
  isTool: boolean
}

const APPLICATION_TOOL_NAME = 'application-drafts'

/** Turns an unknown identifier such as "some_new-tool" into "Some new tool". */
export function humanizeToolName(toolName: string): string {
  const words = toolName
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  if (!words) return 'Saved run'
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * How a history row presents itself. Application drafts are not one of the six
 * tools (no registry entry), so they get a presentation here and link to the
 * applications board; unknown names are humanised, never shown raw.
 */
export function historyRunPresentation(
  toolName: string,
  id: string,
): HistoryRunPresentation {
  const tool = getToolByHistoryName(toolName)
  if (tool) {
    return {
      label: tool.label,
      shortLabel: tool.shortLabel,
      icon: tool.icon,
      accent: tool.accent,
      route: tool.resultRoute.replace('$historyId', id),
      isTool: true,
    }
  }
  if (toolName === APPLICATION_TOOL_NAME) {
    return {
      label: 'Application',
      shortLabel: 'Application',
      icon: getNavDestination('/campaigns').icon,
      accent: 'var(--accent)',
      route: '/campaigns',
      isTool: false,
    }
  }
  const label = humanizeToolName(toolName)
  return {
    label,
    shortLabel: label,
    icon: null,
    accent: 'var(--accent)',
    route: '/history',
    isTool: false,
  }
}
