import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'
import { requireAdmin } from '#/lib/auth/adminGuard'

export const Route = createFileRoute('/admin')({
  // The guard needs the browser's auth cookies; a server render has none and would bounce admins to /login.
  ssr: false,
  beforeLoad: requireAdmin,
  component: lazyRouteComponent(() => import('#/pages/admin/admin-layout'), 'AdminLayout'),
})
