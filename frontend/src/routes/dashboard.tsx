import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/dashboard')({
  head: () => ({
    meta: [{ title: 'Dashboard | Career Workbench' }],
  }),
  component: lazyRouteComponent(() => import('#/pages/dashboard-page'), 'DashboardPage'),
})
