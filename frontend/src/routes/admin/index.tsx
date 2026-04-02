import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/')({
  head: () => ({
    meta: [{ title: 'Admin Dashboard | Career Workbench' }],
  }),
  component: lazyRouteComponent(
    () => import('#/pages/admin/admin-dashboard-page'),
    'AdminDashboardPage',
  ),
})
