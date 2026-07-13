import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/discovery-reports')({
  head: () => ({
    meta: [{ title: 'Recommendation Reports | Admin | Career Workbench' }],
  }),
  component: lazyRouteComponent(
    () => import('#/pages/admin/admin-discovery-reports-page'),
    'AdminDiscoveryReportsPage',
  ),
})
