import type { LucideIcon } from 'lucide-react'
import {
  BadgeCheck,
  ClipboardCheck,
  History as HistoryIcon,
  PanelsTopLeft,
  SquareKanban,
  Telescope,
} from 'lucide-react'

/** One destination in a grouped nav section (sidebar + mobile tools sheet). */
export type NavDestination = {
  label: string
  route: string
  icon: LucideIcon
}

export type NavGroup = {
  id: string
  label: string
  destinations: NavDestination[]
}

/**
 * Shared source of truth for the owner-workspace nav groups so the sidebar,
 * the mobile tab bar and the mobile tools sheet render the same labels and
 * icons instead of drifting. The six tools live in their own "Tools" group
 * built straight from `toolList` (canonical priority order) at each call
 * site. Every destination icon must differ from every tool icon (Career Path
 * owns Compass), so a collapsed, icon-only sidebar stays readable.
 */
export const navGroups: NavGroup[] = [
  {
    id: 'job-search',
    label: 'Job search',
    destinations: [
      { label: 'Discover', route: '/discovery', icon: Telescope },
      { label: 'Queue', route: '/queue', icon: ClipboardCheck },
      { label: 'Campaigns', route: '/campaigns', icon: SquareKanban },
    ],
  },
  {
    id: 'you',
    label: 'You',
    destinations: [
      { label: 'CV Studio', route: '/cv-studio', icon: PanelsTopLeft },
      { label: 'Profile', route: '/profile', icon: BadgeCheck },
      { label: 'History', route: '/history', icon: HistoryIcon },
    ],
  },
]

/** Look up a grouped destination by route (e.g. the mobile tab bar's Discover tab). */
export function getNavDestination(route: string): NavDestination {
  for (const group of navGroups) {
    const match = group.destinations.find((destination) => destination.route === route)
    if (match) return match
  }
  throw new Error(`No nav destination for ${route}`)
}
