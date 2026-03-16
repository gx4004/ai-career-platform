import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/portfolio')({
  head: () => ({
    meta: [{ title: 'Portfolio Planner | Career Workbench' }],
  }),
  component: lazyRouteComponent(() => import('#/pages/tool-pages'), 'PortfolioPage'),
})
