import { createFileRoute } from '@tanstack/react-router'
import { AdminDashboardPage } from '#/pages/admin/admin-dashboard-page'

export const Route = createFileRoute('/admin/')({
  head: () => ({
    meta: [{ title: 'Admin Dashboard | Career Workbench' }],
  }),
  component: AdminDashboardPage,
})
