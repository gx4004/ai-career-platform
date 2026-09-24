import type { LucideIcon } from 'lucide-react'
import {
  BadgeCheck,
  ClipboardCheck,
  Compass,
  History as HistoryIcon,
  Megaphone,
  PanelsTopLeft,
} from 'lucide-react'
import {
  isR11EvidenceProfileEnabled,
  isR12CvStudioEnabled,
  isR13CampaignsEnabled,
  isR14DiscoveryEnabled,
  isR15QueueEnabled,
} from '#/lib/flags/featureFlags'
import { tools } from '#/lib/tools/registry'

/** One destination in a grouped nav section (sidebar + mobile tools sheet). */
export type NavDestination = {
  label: string
  route: string
  icon: LucideIcon
  /** Omitted means always visible (subject to the surrounding auth gate). */
  enabled?: () => boolean
}

export type NavGroup = {
  id: string
  label: string
  destinations: NavDestination[]
}

/**
 * Shared source of truth for the owner-workspace nav groups so the sidebar
 * and the mobile tools sheet render the same structure instead of drifting.
 * The six tools live in their own "Tools" group built straight from
 * `toolList` (canonical priority order) at each call site.
 */
export const navGroups: NavGroup[] = [
  {
    id: 'job-search',
    label: 'Job search',
    destinations: [
      { label: 'Discover', route: '/discovery', icon: Compass, enabled: isR14DiscoveryEnabled },
      { label: 'Queue', route: '/queue', icon: ClipboardCheck, enabled: isR15QueueEnabled },
      { label: 'Campaigns', route: '/campaigns', icon: Megaphone, enabled: isR13CampaignsEnabled },
    ],
  },
  {
    id: 'you',
    label: 'You',
    destinations: [
      { label: 'CV Studio', route: '/cv-studio', icon: PanelsTopLeft, enabled: isR12CvStudioEnabled },
      { label: 'Profile', route: '/profile', icon: BadgeCheck, enabled: isR11EvidenceProfileEnabled },
      { label: 'History', route: '/history', icon: HistoryIcon },
    ],
  },
]

type RouteMeta = {
  title: string
  description: string
  sectionLabel: string
  breadcrumbs: string[]
  topbarVariant: 'compact' | 'standard'
}

export function getRouteMeta(pathname: string): RouteMeta {
  if (pathname === '/dashboard') {
    return {
      title: 'Dashboard',
      description: 'Review your current pipeline, recent runs, and the recommended next step.',
      sectionLabel: 'Command center',
      breadcrumbs: ['Dashboard'],
      topbarVariant: 'compact',
    }
  }

  if (pathname === '/history') {
    return {
      title: 'Run History',
      description: 'Browse previous analyses, favorites, and saved outputs.',
      sectionLabel: 'Activity',
      breadcrumbs: ['Dashboard', 'History'],
      topbarVariant: 'compact',
    }
  }

  if (pathname === '/profile') {
    return {
      title: 'Your profile',
      description: 'Facts about your experience that CV Studio and the tools reuse.',
      sectionLabel: 'You',
      breadcrumbs: ['Dashboard', 'Your profile'],
      topbarVariant: 'compact',
    }
  }

  if (pathname === '/cv-studio') {
    return {
      title: 'CV Studio',
      description: 'Build and tailor CV versions from the facts in your profile.',
      sectionLabel: 'You',
      breadcrumbs: ['Dashboard', 'CV Studio'],
      topbarVariant: 'compact',
    }
  }

  if (pathname === '/discovery') {
    return {
      title: 'Job Discovery',
      description: 'Review live roles ranked against evidence and preferences you confirmed.',
      sectionLabel: 'Job search',
      breadcrumbs: ['Dashboard', 'Job Discovery'],
      topbarVariant: 'compact',
    }
  }

  if (pathname === '/queue') {
    return {
      title: 'Application Queue',
      description: 'Review each prepared packet, then accept, edit, skip, or reject it — or pause all preparation.',
      sectionLabel: 'Job search',
      breadcrumbs: ['Dashboard', 'Application Queue'],
      topbarVariant: 'compact',
    }
  }

  if (pathname === '/campaigns') {
    return {
      title: 'Campaigns',
      description: 'Track applications you have saved from Job Discovery.',
      sectionLabel: 'Job search',
      breadcrumbs: ['Dashboard', 'Campaigns'],
      topbarVariant: 'compact',
    }
  }

  // Detail tabs (/campaigns/$id, /campaigns/$id?tab=…) fall through to here;
  // without this the topbar breadcrumb renders nothing at all (career-
  // workbench#326) since the 'standard' fallback variant only shows on mobile.
  if (pathname.startsWith('/campaigns/')) {
    return {
      title: 'Application',
      description: 'Documents, tasks, notes, and the timeline for this application.',
      sectionLabel: 'Job search',
      breadcrumbs: ['Dashboard', 'Campaigns', 'Application'],
      topbarVariant: 'compact',
    }
  }

  if (pathname === '/account') {
    return {
      title: 'Account',
      description: 'Manage your profile and see the current account status.',
      sectionLabel: 'Settings',
      breadcrumbs: ['Dashboard', 'Account'],
      topbarVariant: 'compact',
    }
  }

  if (pathname === '/settings') {
    return {
      title: 'Settings',
      description: 'Onboarding, local workspace data, and system status.',
      sectionLabel: 'Settings',
      breadcrumbs: ['Dashboard', 'Settings'],
      topbarVariant: 'compact',
    }
  }

  for (const tool of Object.values(tools)) {
    if (pathname === tool.route) {
      return {
        title: tool.label,
        description: tool.summary,
        sectionLabel:
          tool.group === 'primary'
            ? 'Core flow'
            : tool.group === 'application'
              ? 'Application support'
              : 'Planning',
        breadcrumbs: ['Dashboard', tool.label],
        topbarVariant: 'compact',
      }
    }

    if (pathname.startsWith(tool.route + '/result/')) {
      return {
        title: tool.resultTitle,
        description: `Saved output for ${tool.label.toLowerCase()}.`,
        sectionLabel: 'Results',
        breadcrumbs: ['Dashboard', tool.label, 'Result'],
        topbarVariant: 'compact',
      }
    }
  }

  return {
    title: 'Career Workbench',
    description: 'AI-powered job search suite.',
    sectionLabel: 'Workspace',
    breadcrumbs: ['Dashboard'],
    topbarVariant: 'standard',
  }
}
