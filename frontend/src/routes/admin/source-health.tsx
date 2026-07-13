import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/source-health')({
  head: () => ({
    meta: [{ title: 'Source Health | Admin | Career Workbench' }],
  }),
  component: lazyRouteComponent(
    () => import('#/pages/admin/admin-source-health-page'),
    'AdminSourceHealthPage',
  ),
})
