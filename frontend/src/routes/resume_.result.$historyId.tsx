import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/resume_/result/$historyId')({
  head: () => ({
    meta: [{ title: 'Resume Result | Career Workbench' }],
  }),
  component: lazyRouteComponent(() => import('#/pages/tool-result-pages'), 'ResumeResultPage'),
})
