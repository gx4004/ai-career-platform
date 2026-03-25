import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/career_/preview')({
  head: () => ({
    meta: [{ title: 'Career Path — Preview | Career Workbench' }],
  }),
  component: lazyRouteComponent(() => import('#/pages/tool-result-pages'), 'CareerPreviewPage'),
})
