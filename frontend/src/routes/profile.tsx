import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'
import { isR11EvidenceProfileEnabled } from '#/lib/flags/featureFlags'
import { requireEnabledOutcome } from '#/lib/flags/outcomeGuard'

export const Route = createFileRoute('/profile')({
  beforeLoad: () => requireEnabledOutcome(isR11EvidenceProfileEnabled()),
  head: () => ({
    meta: [{ title: 'Evidence Profile | Career Workbench' }],
  }),
  component: lazyRouteComponent(() => import('#/pages/profile-page'), 'ProfilePage'),
})
