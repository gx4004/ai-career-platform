// Routes that render without the main AppShell (no sidebar/topbar).
// NOTE: "shellless" does NOT mean unauthenticated — admin routes are protected
// by requireAdmin() but still render their own layout instead of the app shell.
const SHELLLESS_ROUTES = new Set([
  '/',
  '/login',
  '/landing-experiment',
  '/landing-tools',
  '/landing-classic',
  '/privacy',
  '/terms',
  '/cookies',
  '/imprint',
])
const SHELLLESS_ROUTE_PREFIXES = ['/auth/', '/admin']

/** Returns true for routes that render without the main sidebar/topbar shell. */
export function isShelllessRoute(pathname: string) {
  return SHELLLESS_ROUTES.has(pathname) || SHELLLESS_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

// Legacy alias — kept so callers can be updated incrementally.
export const isPublicRoute = isShelllessRoute
