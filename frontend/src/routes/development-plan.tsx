import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/development-plan')({
  head: () => ({
    meta: [{ title: 'Development Plan | Career Workbench' }],
  }),
  component: lazyRouteComponent(
    () => import('#/pages/development-plan-page'),
    'DevelopmentPlanPage',
  ),
})
