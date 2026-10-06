import { createFileRoute } from '@tanstack/react-router'
import { warmToolRun } from '#/lib/query/routePrefetch'
import { PortfolioResultPage } from '#/pages/tool-result-pages'

export const Route = createFileRoute('/portfolio_/result/$historyId')({
  head: () => ({
    meta: [{ title: 'Portfolio Result | Career Workbench' }],
  }),
  // Not awaited: the report frame shows at once (hover preload warms the run too).
  loader: ({ params }) => {
    warmToolRun(params.historyId)
  },
  component: PortfolioResultPage,
})
