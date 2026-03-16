import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/career/result/$historyId')({
  head: () => ({
    meta: [{ title: 'Career Result | Career Workbench' }],
  }),
  component: lazyRouteComponent(() => import('#/pages/tool-result-pages'), 'CareerResultPage'),
})
