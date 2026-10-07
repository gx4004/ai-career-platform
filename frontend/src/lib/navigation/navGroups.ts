import type { LucideIcon } from 'lucide-react'
import {
  Briefcase,
  Clock,
  Compass,
  FileText,
  House,
  User,
} from 'lucide-react'

/** One destination in a grouped nav section (sidebar + mobile tools sheet). */
export type NavDestination = {
  label: string
  route: string
  icon: LucideIcon
}

/** The dashboard is every signed-in and guest user's home, so it is not in a group (the sidebar and the palette add it first). */
export const dashboardDestination: NavDestination = { label: 'Dashboard', route: '/dashboard', icon: House }

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
 * site. Icons are the Sticker set (STICKER-SYSTEM 1.14): House, Compass, Briefcase,
 * FileText, User, Clock for destinations; FileCheck2, Target, Route, Mail, MessageCircle and
 * Layers for tools. Every destination icon differs from every tool icon, so a collapsed,
 * icon-only sidebar stays readable.
 */
export const navGroups: NavGroup[] = [
  {
    id: 'job-search',
    label: 'Job search',
    destinations: [
      { label: 'Discover', route: '/discovery', icon: Compass },
      { label: 'Applications', route: '/campaigns', icon: Briefcase },
    ],
  },
  {
    id: 'you',
    label: 'You',
    destinations: [
      { label: 'CV Studio', route: '/cv-studio', icon: FileText },
      { label: 'Profile', route: '/profile', icon: User },
      { label: 'History', route: '/history', icon: Clock },
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

/** The pages the account menu leads to (Account, Settings): there the account button is the "you are here". */
export function isAccountRoute(pathname: string) {
  return pathname.startsWith('/account') || pathname.startsWith('/settings')
}
