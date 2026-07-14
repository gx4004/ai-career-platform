import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'
import { requireUser } from '#/lib/auth/userGuard'

export const Route = createFileRoute('/queue')({
  beforeLoad: requireUser,
  head: () => ({
    meta: [{ title: 'Application Queue | Career Workbench' }],
  }),
  component: lazyRouteComponent(() => import('#/pages/queue-page'), 'QueuePage'),
})
