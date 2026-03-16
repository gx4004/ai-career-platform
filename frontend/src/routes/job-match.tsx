import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/job-match')({
  head: () => ({
    meta: [{ title: 'Job Match | Career Workbench' }],
  }),
  component: lazyRouteComponent(() => import('#/pages/tool-pages'), 'JobMatchPage'),
})
