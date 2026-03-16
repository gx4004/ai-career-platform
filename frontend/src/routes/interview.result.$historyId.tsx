import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/interview/result/$historyId')({
  head: () => ({
    meta: [{ title: 'Interview Result | Career Workbench' }],
  }),
  component: lazyRouteComponent(() => import('#/pages/tool-result-pages'), 'InterviewResultPage'),
})
