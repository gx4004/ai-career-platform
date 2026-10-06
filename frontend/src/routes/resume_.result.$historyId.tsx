import { createFileRoute } from '@tanstack/react-router'
import { warmToolRun } from '#/lib/query/routePrefetch'
import { ResumeResultPage } from '#/pages/tool-result-pages'

export const Route = createFileRoute('/resume_/result/$historyId')({
  head: () => ({
    meta: [{ title: 'Resume Result | Career Workbench' }],
  }),
  // Not awaited: the report frame shows at once (hover preload warms the run too).
  loader: ({ params }) => {
    warmToolRun(params.historyId)
  },
  component: ResumeResultPage,
})
