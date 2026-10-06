import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from '#/routeTree.gen'

function RoutePending() {
  return (
    <div className="route-pending">
      <div className="route-pending-spinner" />
    </div>
  )
}

export function createRouter() {
  return createTanStackRouter({
    routeTree,
    scrollRestoration: ({ location }) => {
      if (location.pathname === '/landing-experiment' && !location.hash) {
        return false
      }

      return true
    },
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: RoutePending,
    defaultPendingMs: 200,
    // The router's default keeps a pending screen up for at least 500ms once it shows; a load that finishes
    // at 210ms would then flash the spinner for half a second. Show it only while something is really pending.
    defaultPendingMinMs: 0,
  })
}

export function getRouter() {
  return createRouter()
}


declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
