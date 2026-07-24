import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/development-loop')({
  head: () => ({
    meta: [{ title: 'Development Loop | Admin | Career Workbench' }],
  }),
  component: lazyRouteComponent(
    () => import('#/pages/admin/admin-development-loop-page'),
    'AdminDevelopmentLoopPage',
  ),
})
