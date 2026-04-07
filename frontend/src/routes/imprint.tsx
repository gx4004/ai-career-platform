import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/imprint')({
  head: () => ({
    meta: [{ title: 'Imprint | Career Workbench' }],
  }),
  component: lazyRouteComponent(() => import('#/pages/legal/ImprintPage'), 'ImprintPage'),
})
