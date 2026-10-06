import { createFileRoute } from '@tanstack/react-router'
import { warmToolRun } from '#/lib/query/routePrefetch'
import { InterviewResultPage } from '#/pages/tool-result-pages'

export const Route = createFileRoute('/interview_/result/$historyId')({
  head: () => ({
    meta: [{ title: 'Interview Result | Career Workbench' }],
  }),
  // Not awaited: the report frame shows at once (hover preload warms the run too).
  loader: ({ params }) => {
    warmToolRun(params.historyId)
  },
  component: InterviewResultPage,
})
