import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'
import { requireUser } from '#/lib/auth/userGuard'
import { isR15QueueEnabled } from '#/lib/flags/featureFlags'
import { requireEnabledOutcome } from '#/lib/flags/outcomeGuard'

export const Route = createFileRoute('/queue')({
  beforeLoad: async () => {
    requireEnabledOutcome(isR15QueueEnabled())
    await requireUser()
  },
  head: () => ({
    meta: [{ title: 'Application Queue | Career Workbench' }],
  }),
  component: lazyRouteComponent(() => import('#/pages/queue-page'), 'QueuePage'),
})
