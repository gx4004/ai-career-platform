import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/cover-letter')({
  head: () => ({
    meta: [{ title: 'Cover Letter | Career Workbench' }],
  }),
  component: lazyRouteComponent(() => import('#/pages/tool-pages'), 'CoverLetterPage'),
})
