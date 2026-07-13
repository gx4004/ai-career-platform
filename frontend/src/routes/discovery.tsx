import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'
import { requireUser } from '#/lib/auth/userGuard'

export const Route = createFileRoute('/discovery')({
  beforeLoad: requireUser,
  head: () => ({
    meta: [{ title: 'Job Discovery | Career Workbench' }],
  }),
  component: lazyRouteComponent(
    () => import('#/pages/discovery-page'),
    'DiscoveryPage',
  ),
})
