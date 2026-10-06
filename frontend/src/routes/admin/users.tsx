import { createFileRoute } from '@tanstack/react-router'
import { AdminUsersPage } from '#/pages/admin/admin-users-page'

export const Route = createFileRoute('/admin/users')({
  head: () => ({
    meta: [{ title: 'Users | Admin | Career Workbench' }],
  }),
  component: AdminUsersPage,
})
