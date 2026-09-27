import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'
import { requireUser } from '#/lib/auth/userGuard'

export const Route = createFileRoute('/queue')({
  // The session cookie is only sent from the browser, so the auth guard must
  // not run during server rendering (it would bounce a signed-in reload to /login).
  ssr: false,
  beforeLoad: requireUser,
  head: () => ({
    meta: [{ title: 'Application Queue | Career Workbench' }],
  }),
  component: lazyRouteComponent(() => import('#/pages/queue-page'), 'QueuePage'),
})
