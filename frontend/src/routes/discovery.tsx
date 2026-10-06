import { createFileRoute } from '@tanstack/react-router'
import { requireUser } from '#/lib/auth/userGuard'
import { warmDiscovery } from '#/lib/query/routePrefetch'
import { DiscoveryPage } from '#/pages/discovery-page'

export const Route = createFileRoute('/discovery')({
  // The session cookie is only sent from the browser, so the auth guard must
  // not run during server rendering (it would bounce a signed-in reload to /login).
  ssr: false,
  // The first page of jobs starts loading alongside the session check, not after it.
  beforeLoad: (ctx) => {
    warmDiscovery()
    return requireUser(ctx)
  },
  head: () => ({
    meta: [{ title: 'Job Discovery | Career Workbench' }],
  }),
  component: DiscoveryPage,
})
