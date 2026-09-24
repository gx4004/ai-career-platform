import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'
import { requireUser } from '#/lib/auth/userGuard'
import { isR13CampaignsEnabled } from '#/lib/flags/featureFlags'
import { requireEnabledOutcome } from '#/lib/flags/outcomeGuard'

export const Route = createFileRoute('/campaigns/')({
  // The session cookie is only sent from the browser, so the auth guard must
  // not run during server rendering (it would bounce a signed-in reload to /login).
  ssr: false,
  beforeLoad: async () => {
    requireEnabledOutcome(isR13CampaignsEnabled())
    await requireUser()
  },
  head: () => ({ meta: [{ title: 'Applications | Career Workbench' }] }),
  component: lazyRouteComponent(() => import('#/pages/campaigns-page'), 'CampaignsPage'),
})
