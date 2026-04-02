import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/runs')({
  head: () => ({
    meta: [{ title: 'Runs | Admin | Career Workbench' }],
  }),
  component: lazyRouteComponent(
    () => import('#/pages/admin/admin-runs-page'),
    'AdminRunsPage',
  ),
})
