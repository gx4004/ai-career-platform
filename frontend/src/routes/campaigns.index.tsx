import { createFileRoute } from '@tanstack/react-router'
import { resolveSession } from '#/lib/auth/userGuard'
import { warmApplications } from '#/lib/query/routePrefetch'
import { ApplicationsPage } from '#/pages/applications-page'

export const Route = createFileRoute('/campaigns/')({
  // The session cookie is only sent from the browser, so the session check must not run during server rendering
  // (it would read a signed-in reload as a guest). A guest gets the page's in-page sign-in gate (consistency-F25).
  ssr: false,
  // The board starts loading alongside the session check, not after it.
  beforeLoad: () => {
    warmApplications()
    return resolveSession()
  },
  head: () => ({ meta: [{ title: 'Applications | Career Workbench' }] }),
  component: ApplicationsPage,
})
