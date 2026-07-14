import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/packet-gate')({
  head: () => ({
    meta: [{ title: 'Packet Gate | Admin | Career Workbench' }],
  }),
  component: lazyRouteComponent(
    () => import('#/pages/admin/admin-packet-gate-page'),
    'AdminPacketGatePage',
  ),
})
