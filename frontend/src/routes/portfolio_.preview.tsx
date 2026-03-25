import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/portfolio_/preview')({
  head: () => ({
    meta: [{ title: 'Portfolio Planner — Preview | Career Workbench' }],
  }),
  component: lazyRouteComponent(() => import('#/pages/tool-result-pages'), 'PortfolioPreviewPage'),
})
