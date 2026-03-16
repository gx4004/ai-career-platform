import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/portfolio/result/$historyId')({
  head: () => ({
    meta: [{ title: 'Portfolio Result | Career Workbench' }],
  }),
  component: lazyRouteComponent(() => import('#/pages/tool-result-pages'), 'PortfolioResultPage'),
})
