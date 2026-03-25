import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/career_/result/$historyId')({
  head: () => ({
    meta: [{ title: 'Career Result | Career Workbench' }],
  }),
  component: lazyRouteComponent(() => import('#/pages/tool-result-pages'), 'CareerResultPage'),
})
