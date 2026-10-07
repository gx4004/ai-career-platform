import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { AdminOnlyToast } from '#/components/app/AdminOnlyToast'
import { ADMIN_ONLY_NOTICE } from '#/lib/auth/adminGuard'
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
  // `notice=admin-only`: the admin guard sent a signed-in non-admin here; the page says why, then drops the flag.
  validateSearch: (search: Record<string, unknown>): { notice?: typeof ADMIN_ONLY_NOTICE } =>
    search.notice === ADMIN_ONLY_NOTICE ? { notice: ADMIN_ONLY_NOTICE } : {},
  component: DashboardRoute,
})

function DashboardRoute() {
  const { notice } = Route.useSearch()
  const navigate = useNavigate()
  return (
    <>
      <AdminOnlyToast notice={notice} onDone={() => void navigate({ to: '/dashboard', search: {}, replace: true })} />
      <DashboardPage />
    </>
  )
}
