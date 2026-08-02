import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'
import { isR17DevelopmentLoopEnabled } from '#/lib/flags/featureFlags'
import { requireEnabledOutcome } from '#/lib/flags/outcomeGuard'

export const Route = createFileRoute('/development-plan')({
  beforeLoad: () => requireEnabledOutcome(isR17DevelopmentLoopEnabled()),
  head: () => ({
    meta: [{ title: 'Development Plan | Career Workbench' }],
  }),
  component: lazyRouteComponent(
    () => import('#/pages/development-plan-page'),
    'DevelopmentPlanPage',
  ),
})
