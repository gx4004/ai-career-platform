import { createFileRoute } from '@tanstack/react-router'
import { resolveSession } from '#/lib/auth/userGuard'
import { warmDiscovery } from '#/lib/query/routePrefetch'
import { DiscoveryPage } from '#/pages/discovery-page'

export const Route = createFileRoute('/discovery')({
  // The session cookie is only sent from the browser, so the session check must not run during server rendering
  // (it would read a signed-in reload as a guest). A guest gets the page's in-page sign-in gate (consistency-F25).
  ssr: false,
  // The first page of jobs starts loading alongside the session check, not after it.
  beforeLoad: () => {
    warmDiscovery()
    return resolveSession()
  },
  head: () => ({
    meta: [{ title: 'Job Discovery | Career Workbench' }],
  }),
  component: DiscoveryPage,
})
