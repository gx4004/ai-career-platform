import { createFileRoute } from '@tanstack/react-router'
import { AdminDiscoverySourcesPage } from '#/pages/admin/admin-discovery-sources-page'

export const Route = createFileRoute('/admin/discovery-sources')({
  head: () => ({
    meta: [{ title: 'Discovery Sources | Admin | Career Workbench' }],
  }),
  component: AdminDiscoverySourcesPage,
})
