import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/resume_/preview')({
  head: () => ({
    meta: [{ title: 'Resume Analyzer — Preview | Career Workbench' }],
  }),
  component: lazyRouteComponent(() => import('#/pages/tool-result-pages'), 'ResumePreviewPage'),
})
