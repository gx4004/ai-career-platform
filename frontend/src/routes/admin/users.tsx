import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/users')({
  head: () => ({
    meta: [{ title: 'Users | Admin | Career Workbench' }],
  }),
  component: lazyRouteComponent(
    () => import('#/pages/admin/admin-users-page'),
    'AdminUsersPage',
  ),
})
