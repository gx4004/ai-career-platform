import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/discovery-sources')({
  head: () => ({
    meta: [{ title: 'Discovery Sources | Admin | Career Workbench' }],
  }),
  component: lazyRouteComponent(
    () => import('#/pages/admin/admin-discovery-sources-page'),
    'AdminDiscoverySourcesPage',
  ),
})
