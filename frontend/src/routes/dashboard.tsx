import { createFileRoute } from '@tanstack/react-router'
import { warmDashboard } from '#/lib/query/routePrefetch'
import { DashboardPage } from '#/pages/dashboard-page'

export const Route = createFileRoute('/dashboard')({
  head: () => ({
    meta: [{ title: 'Dashboard | Career Workbench' }],
  }),
  // Not awaited: the page shows at once and reads whatever has arrived (hover preload warms it too).
  loader: () => {
    warmDashboard()
  },
  component: DashboardPage,
})
