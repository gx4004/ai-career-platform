import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'
import { requireUser } from '#/lib/auth/userGuard'
import { isR14DiscoveryEnabled } from '#/lib/flags/featureFlags'
import { requireEnabledOutcome } from '#/lib/flags/outcomeGuard'

export const Route = createFileRoute('/discovery')({
  // The session cookie is only sent from the browser, so the auth guard must
  // not run during server rendering (it would bounce a signed-in reload to /login).
  ssr: false,
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
