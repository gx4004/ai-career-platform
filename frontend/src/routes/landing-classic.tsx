import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/landing-classic')({
  head: () => ({
    meta: [{ title: 'Career Workbench (Classic)' }],
  }),
  component: lazyRouteComponent(
    () => import('#/pages/landing-page-archived'),
    'LandingRoutePageArchived',
  ),
})
