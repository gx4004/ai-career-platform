const PUBLIC_ROUTES = new Set(['/', '/login', '/landing-experiment', '/landing-tools', '/landing-classic'])
const PUBLIC_ROUTE_PREFIXES = ['/auth/', '/admin']

export function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.has(pathname) || PUBLIC_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}
