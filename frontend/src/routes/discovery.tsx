import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'
import { requireUser } from '#/lib/auth/userGuard'
import { isR14DiscoveryEnabled } from '#/lib/flags/featureFlags'
import { requireEnabledOutcome } from '#/lib/flags/outcomeGuard'

export const Route = createFileRoute('/discovery')({
  beforeLoad: async () => {
    requireEnabledOutcome(isR14DiscoveryEnabled())
    await requireUser()
  },
  head: () => ({
    meta: [{ title: 'Job Discovery | Career Workbench' }],
  }),
  component: lazyRouteComponent(
    () => import('#/pages/discovery-page'),
    'DiscoveryPage',
  ),
})
