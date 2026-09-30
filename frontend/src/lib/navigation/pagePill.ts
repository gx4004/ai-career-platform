import type { LucideIcon } from 'lucide-react'
import { Settings, UserRound } from 'lucide-react'
import { navGroups } from '#/lib/navigation/navGroups'

export type PagePill = { icon: LucideIcon; label: string }

const SETTINGS_PILLS: Record<string, PagePill> = {
  '/account': { icon: UserRound, label: 'Account' },
  '/settings': { icon: Settings, label: 'Settings' },
}

/**
 * The topbar pill (icon + label) for a non-tool page. Grouped destinations
 * come straight from `navGroups`, so Applications, Discover, CV Studio,
 * Profile and History match the sidebar; sub-paths such as
 * `/campaigns/$id` resolve to their parent destination.
 */
export function getPagePill(pathname: string): PagePill | null {
  const isWithin = (route: string) => pathname === route || pathname.startsWith(`${route}/`)
  for (const group of navGroups) {
    const match = group.destinations.find((destination) => isWithin(destination.route))
    if (match) return { icon: match.icon, label: match.label }
  }
  const settingsRoute = Object.keys(SETTINGS_PILLS).find(isWithin)
  return settingsRoute ? SETTINGS_PILLS[settingsRoute] : null
}
