import { createFileRoute } from '@tanstack/react-router'
import { AdminRunsPage } from '#/pages/admin/admin-runs-page'

export const Route = createFileRoute('/admin/runs')({
  head: () => ({
    meta: [{ title: 'Runs | Admin | Career Workbench' }],
  }),
  component: AdminRunsPage,
})
