import { tools } from '#/lib/tools/registry'

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

  if (pathname === '/campaigns') {
    return {
      title: 'Applications',
      description: 'Every job you are going for, from saved to offer.',
      sectionLabel: 'Job search',
      breadcrumbs: ['Dashboard', 'Applications'],
      topbarVariant: 'compact',
    }
  }

  // Application pages (/campaigns/$id) fall through to here;
  // without this the topbar breadcrumb renders nothing at all (career-
  // workbench#326) since the 'standard' fallback variant only shows on mobile.
  if (pathname.startsWith('/campaigns/')) {
    return {
      title: 'Application',
      description: 'Apply, documents, tasks, notes and activity for this application.',
      sectionLabel: 'Job search',
      breadcrumbs: ['Dashboard', 'Applications', 'Application'],
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
