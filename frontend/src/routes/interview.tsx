import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/interview')({
  head: () => ({
    meta: [{ title: 'Interview Prep | Career Workbench' }],
  }),
  component: lazyRouteComponent(() => import('#/pages/tool-pages'), 'InterviewPage'),
})
