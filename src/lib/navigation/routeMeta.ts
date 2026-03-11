import { tools } from '#/lib/tools/registry'

type RouteMeta = {
  title: string
  description: string
  sectionLabel: string
  breadcrumbs: string[]
}

export function getRouteMeta(pathname: string): RouteMeta {
  if (pathname === '/dashboard') {
    return {
      title: 'Dashboard',
      description: 'Review your current pipeline, recent runs, and the recommended next step.',
      sectionLabel: 'Command center',
      breadcrumbs: ['Dashboard'],
    }
  }

  if (pathname === '/history') {
    return {
      title: 'Run History',
      description: 'Browse previous analyses, favorites, and saved outputs.',
      sectionLabel: 'Activity',
      breadcrumbs: ['Dashboard', 'History'],
    }
  }

  if (pathname === '/account') {
    return {
      title: 'Account',
      description: 'Manage your profile and see the current account status.',
      sectionLabel: 'Settings',
      breadcrumbs: ['Dashboard', 'Account'],
    }
  }

  if (pathname === '/settings') {
    return {
      title: 'Settings',
      description: 'Theme, notifications, and data-management preferences.',
      sectionLabel: 'Settings',
      breadcrumbs: ['Dashboard', 'Settings'],
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
      }
    }

    if (pathname.startsWith(tool.route + '/result/')) {
      return {
        title: tool.resultTitle,
        description: `Saved output for ${tool.label.toLowerCase()}.`,
        sectionLabel: 'Results',
        breadcrumbs: ['Dashboard', tool.label, 'Result'],
      }
    }
  }

  return {
    title: 'Career Workbench',
    description: 'AI-powered job search suite.',
    sectionLabel: 'Workspace',
    breadcrumbs: ['Dashboard'],
  }
}
