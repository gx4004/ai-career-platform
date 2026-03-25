import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/interview_/preview')({
  head: () => ({
    meta: [{ title: 'Interview Q&A — Preview | Career Workbench' }],
  }),
  component: lazyRouteComponent(() => import('#/pages/tool-result-pages'), 'InterviewPreviewPage'),
})
