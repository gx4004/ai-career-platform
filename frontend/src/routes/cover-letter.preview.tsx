import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/cover-letter/preview')({
  head: () => ({
    meta: [{ title: 'Cover Letter — Preview | Career Workbench' }],
  }),
  component: lazyRouteComponent(() => import('#/pages/tool-result-pages'), 'CoverLetterPreviewPage'),
})
