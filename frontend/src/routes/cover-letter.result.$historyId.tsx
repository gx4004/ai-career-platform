import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/cover-letter/result/$historyId')({
  head: () => ({
    meta: [{ title: 'Cover Letter Result | Career Workbench' }],
  }),
  component: lazyRouteComponent(() => import('#/pages/tool-result-pages'), 'CoverLetterResultPage'),
})
