import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/job-match/preview')({
  head: () => ({
    meta: [{ title: 'Job Match — Preview | Career Workbench' }],
  }),
  component: lazyRouteComponent(() => import('#/pages/tool-result-pages'), 'JobMatchPreviewPage'),
})
