import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/job-match/result/$historyId')({
  head: () => ({
    meta: [{ title: 'Match Result | Career Workbench' }],
  }),
  component: lazyRouteComponent(() => import('#/pages/tool-result-pages'), 'JobMatchResultPage'),
})
