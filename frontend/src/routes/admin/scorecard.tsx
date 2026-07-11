import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/scorecard')({
  head: () => ({
    meta: [{ title: 'Scaling Triggers | Admin | Career Workbench' }],
  }),
  component: lazyRouteComponent(
    () => import('#/pages/admin/admin-scorecard-page'),
    'AdminScorecardPage',
  ),
})
