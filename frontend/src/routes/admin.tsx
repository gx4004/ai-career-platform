import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'
import { requireAdmin } from '#/lib/auth/adminGuard'

export const Route = createFileRoute('/admin')({
  beforeLoad: requireAdmin,
  component: lazyRouteComponent(() => import('#/pages/admin/admin-layout'), 'AdminLayout'),
})
