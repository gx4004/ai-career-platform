import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/resume')({
  head: () => ({
    meta: [{ title: 'Resume Analysis | Career Workbench' }],
  }),
  component: lazyRouteComponent(() => import('#/pages/tool-pages'), 'ResumePage'),
})
