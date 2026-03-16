import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/career')({
  head: () => ({
    meta: [{ title: 'Career Planner | Career Workbench' }],
  }),
  component: lazyRouteComponent(() => import('#/pages/tool-pages'), 'CareerPage'),
})
