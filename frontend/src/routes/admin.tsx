import { createFileRoute } from '@tanstack/react-router'
import { requireAdmin } from '#/lib/auth/adminGuard'
import { AdminLayout } from '#/pages/admin/admin-layout'

export const Route = createFileRoute('/admin')({
  // The guard needs the browser's auth cookies; a server render has none and would bounce admins to /login.
  ssr: false,
  beforeLoad: requireAdmin,
  component: AdminLayout,
})
